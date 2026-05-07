import crypto from "node:crypto";
import {
  collectionNames,
  createDocument,
  listCollection,
} from "../../_lib/content-store.js";
import { parseAchievementCommand, saveAchievementClaim } from "../../_lib/ladder.js";
import { sendTwitchChatMessage } from "../../_lib/twitch-eventsub.js";

const MESSAGE_ID_HEADER = "twitch-eventsub-message-id";
const MESSAGE_TIMESTAMP_HEADER = "twitch-eventsub-message-timestamp";
const MESSAGE_SIGNATURE_HEADER = "twitch-eventsub-message-signature";
const MESSAGE_TYPE_HEADER = "twitch-eventsub-message-type";
const HMAC_PREFIX = "sha256=";

async function readRawBody(request) {
  const chunks = [];

  await new Promise((resolve, reject) => {
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", resolve);
    request.on("error", reject);
  });

  return Buffer.concat(chunks).toString("utf8");
}

function timingSafeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyEventsubSignature(request, rawBody) {
  const secret = process.env.TWITCH_EVENTSUB_SECRET || "";

  if (!secret) {
    const error = new Error("TWITCH_EVENTSUB_SECRET не задан.");
    error.statusCode = 500;
    throw error;
  }

  const message = [
    request.headers[MESSAGE_ID_HEADER] || "",
    request.headers[MESSAGE_TIMESTAMP_HEADER] || "",
    rawBody,
  ].join("");

  const expectedSignature =
    HMAC_PREFIX +
    crypto.createHmac("sha256", secret).update(message).digest("hex");
  const actualSignature = String(request.headers[MESSAGE_SIGNATURE_HEADER] || "");

  return timingSafeCompare(expectedSignature, actualSignature);
}

function getTrackedChannelId(channel) {
  return String(channel.broadcasterUserId || "")
    .trim()
    .toLowerCase() || String(channel.broadcasterLogin || "").trim().toLowerCase();
}

function isExpectedChatSubscription(payload, broadcasterUserId) {
  const botUserId = String(process.env.TWITCH_BOT_USER_ID || "").trim();
  const condition = payload?.subscription?.condition || {};

  return (
    String(condition.broadcaster_user_id || "") === String(broadcasterUserId || "") &&
    (!botUserId || String(condition.user_id || "") === botUserId)
  );
}

async function findOrRecoverTrackedChannel({
  payload,
  broadcasterUserId,
  broadcasterLogin,
}) {
  const trackedChannels = await listCollection(collectionNames.trackedChannels);
  const trackedChannel = trackedChannels.find(
    (channel) =>
      String(channel.broadcasterUserId || "") === broadcasterUserId ||
      String(channel.broadcasterLogin || "").toLowerCase() ===
        broadcasterLogin.toLowerCase()
  );

  if (trackedChannel || !isExpectedChatSubscription(payload, broadcasterUserId)) {
    return trackedChannel || null;
  }

  return createDocument(collectionNames.trackedChannels, {
    id: getTrackedChannelId({
      broadcasterUserId,
      broadcasterLogin,
    }),
    broadcasterUserId,
    broadcasterLogin,
    displayName: String(payload?.event?.broadcaster_user_name || broadcasterLogin),
    enabled: true,
    subscriptionId: String(payload?.subscription?.id || ""),
    subscriptionStatus: String(payload?.subscription?.status || ""),
    lastSyncAt: new Date().toISOString(),
    lastSyncError: "",
    recoveredFromEventsubAt: new Date().toISOString(),
  });
}

async function sendChatAcknowledgement({
  broadcasterUserId,
  chatterLogin,
  sourceMessageId,
  text,
}) {
  if (!broadcasterUserId || !chatterLogin || !text) {
    return;
  }

  try {
    await sendTwitchChatMessage({
      broadcasterUserId,
      message: `@${chatterLogin} ${text}`,
      replyParentMessageId: sourceMessageId,
    });
  } catch (error) {
    console.warn("[eventsub/chat] failed to send acknowledgement", {
      broadcasterUserId,
      chatterLogin,
      message: error.message,
      details: error.details || null,
    });
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  const rawBody = await readRawBody(request);

  try {
    if (!verifyEventsubSignature(request, rawBody)) {
      return response.status(403).json({ error: "Invalid EventSub signature." });
    }

    const payload = JSON.parse(rawBody || "{}");
    const messageType = String(request.headers[MESSAGE_TYPE_HEADER] || "");

    if (messageType === "webhook_callback_verification") {
      response.setHeader("Content-Type", "text/plain");
      return response.status(200).send(payload.challenge || "");
    }

    if (messageType === "revocation") {
      console.warn("[eventsub/chat] subscription revoked", payload);
      return response.status(200).json({ ok: true, revoked: true });
    }

    if (messageType !== "notification") {
      return response.status(200).json({ ok: true, ignored: true });
    }

    if (payload?.subscription?.type !== "channel.chat.message") {
      return response.status(200).json({ ok: true, ignored: true });
    }

    const broadcasterUserId = String(payload?.event?.broadcaster_user_id || "");
    const broadcasterLogin = String(payload?.event?.broadcaster_user_login || "");
    const trackedChannel = await findOrRecoverTrackedChannel({
      payload,
      broadcasterUserId,
      broadcasterLogin,
    });

    if (!trackedChannel || trackedChannel.enabled === false) {
      return response.status(200).json({ ok: true, ignored: true, reason: "channel_not_tracked" });
    }

    const text = payload?.event?.message?.text || "";
    const command = parseAchievementCommand(text);

    if (!command) {
      return response.status(200).json({ ok: true, ignored: true });
    }

    const result = await saveAchievementClaim(command, {
      sourceMessageId: payload?.event?.message_id || "",
      chatterLogin: payload?.event?.chatter_user_login || "",
      chatterName: payload?.event?.chatter_user_name || "",
      broadcasterUserId,
      broadcasterLogin,
      submittedAt: payload?.event?.message?.sent_at || payload?.event?.created_at || "",
    });

    await sendChatAcknowledgement({
      broadcasterUserId,
      chatterLogin: payload?.event?.chatter_user_login || "",
      sourceMessageId: payload?.event?.message_id || "",
      text:
        result?.status === "pending_moderation"
          ? "отправил на модерацию!"
          : "добавил!",
    });

    return response.status(200).json({ ok: true, accepted: true });
  } catch (error) {
    console.error("[eventsub/chat] failed", {
      message: error.message,
      stack: error.stack,
    });

    return response.status(error.statusCode || 500).json({
      error: error.message || "Unknown EventSub chat error.",
    });
  }
}
