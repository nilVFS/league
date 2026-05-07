import crypto from "node:crypto";
import {
  collectionNames,
  createDocument,
  listCollection,
  updateDocument,
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

function isRateLimitError(error) {
  const messageText = String(error?.message || "").toLowerCase();
  const detailsMessage = String(error?.details?.message || "").toLowerCase();

  return (
    error?.statusCode === 429 ||
    error?.details?.status === 429 ||
    messageText.includes("too many requests") ||
    messageText.includes("too quickly") ||
    detailsMessage.includes("too many requests") ||
    detailsMessage.includes("too quickly")
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

async function hasProcessedSourceMessage(sourceMessageId) {
  const normalizedMessageId = String(sourceMessageId || "").trim();

  if (!normalizedMessageId) {
    return false;
  }

  const [achievementClaims, suggestions] = await Promise.all([
    listCollection(collectionNames.achievementClaims),
    listCollection(collectionNames.suggestions),
  ]);

  return [...achievementClaims, ...suggestions].some(
    (item) => String(item.sourceMessageId || "") === normalizedMessageId
  );
}

async function updateTrackedChannelDiagnostics(channelId, payload) {
  if (!channelId) {
    return;
  }

  try {
    await updateDocument(collectionNames.trackedChannels, channelId, payload);
  } catch (error) {
    console.warn("[eventsub/chat] failed to update channel diagnostics", {
      channelId,
      message: error.message,
    });
  }
}

async function sendChatAcknowledgement({
  broadcasterUserId,
  chatterLogin,
  sourceMessageId,
  trackedChannelId,
  text,
}) {
  if (!broadcasterUserId || !chatterLogin || !text) {
    return;
  }

  const message = `@${chatterLogin} ${text}`;
  const channelId = trackedChannelId || "";

  if (channelId) {
    await updateDocument(collectionNames.trackedChannels, channelId, {
      lastChatAttemptAt: new Date().toISOString(),
    });
  }

  const markError = async (error) => {
    if (!channelId) {
      return;
    }

    await updateDocument(collectionNames.trackedChannels, channelId, {
      lastChatError: error.message || "Twitch не отправил сообщение в чат.",
      lastChatErrorDetails: error.details || null,
      lastChatErrorAt: new Date().toISOString(),
    });
  };
  const markSent = async (mode) => {
    if (!channelId) {
      return;
    }

    try {
      await updateDocument(collectionNames.trackedChannels, channelId, {
        lastChatSentAt: new Date().toISOString(),
        lastChatSentMode: mode,
        lastChatError: "",
        lastChatErrorDetails: null,
        lastChatErrorAt: "",
      });
    } catch (statusError) {
      console.warn("[eventsub/chat] failed to update chat sent status", {
        broadcasterUserId,
        trackedChannelId: channelId,
        message: statusError.message,
      });
    }
  };

  try {
    await sendTwitchChatMessage({
      broadcasterUserId,
      message,
      replyParentMessageId: sourceMessageId,
    });
    await markSent("reply");
  } catch (error) {
    console.warn("[eventsub/chat] failed to send reply acknowledgement", {
      broadcasterUserId,
      chatterLogin,
      message: error.message,
      details: error.details || null,
    });

    if (isRateLimitError(error)) {
      await markError(error);
      return;
    }

    try {
      await sendTwitchChatMessage({
        broadcasterUserId,
        message,
      });
      await markSent("message");
    } catch (fallbackError) {
      console.warn("[eventsub/chat] failed to send fallback acknowledgement", {
        broadcasterUserId,
        chatterLogin,
        message: fallbackError.message,
        details: fallbackError.details || null,
      });

      await markError(fallbackError);
    }
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
    const sourceMessageId = payload?.event?.message_id || "";

    await updateTrackedChannelDiagnostics(trackedChannel.id, {
      lastEventAt: new Date().toISOString(),
      lastEventMessageId: sourceMessageId,
      lastEventText: text,
      lastEventChatterLogin: payload?.event?.chatter_user_login || "",
      lastEventChatterName: payload?.event?.chatter_user_name || "",
      lastEventIgnoredReason: "",
      lastCommandAcceptedAt: "",
      lastCommandError: "",
    });

    const command = parseAchievementCommand(text);

    if (!command) {
      await updateTrackedChannelDiagnostics(trackedChannel.id, {
        lastEventIgnoredReason: "command_not_matched",
        lastEventIgnoredAt: new Date().toISOString(),
      });

      return response.status(200).json({ ok: true, ignored: true });
    }

    if (await hasProcessedSourceMessage(sourceMessageId)) {
      await updateTrackedChannelDiagnostics(trackedChannel.id, {
        lastEventIgnoredReason: "duplicate_message",
        lastEventIgnoredAt: new Date().toISOString(),
      });

      return response.status(200).json({
        ok: true,
        ignored: true,
        reason: "duplicate_message",
      });
    }

    let result = null;

    try {
      result = await saveAchievementClaim(command, {
        sourceMessageId,
        chatterLogin: payload?.event?.chatter_user_login || "",
        chatterName: payload?.event?.chatter_user_name || "",
        broadcasterUserId,
        broadcasterLogin,
        submittedAt: payload?.event?.message?.sent_at || payload?.event?.created_at || "",
      });
    } catch (error) {
      await updateTrackedChannelDiagnostics(trackedChannel.id, {
        lastCommandError: error.message || "Не удалось сохранить команду.",
        lastCommandErrorAt: new Date().toISOString(),
      });
      throw error;
    }

    await updateTrackedChannelDiagnostics(trackedChannel.id, {
      lastCommandAcceptedAt: new Date().toISOString(),
      lastCommandStatus: result?.status || "accepted",
      lastCommandPlayerTag: command.playerTag,
      lastCommandAchievementCode: Number(command.achievementCode || 0),
      lastCommandError: "",
      lastCommandErrorAt: "",
      lastEventIgnoredReason: "",
    });

    await sendChatAcknowledgement({
      broadcasterUserId,
      chatterLogin: payload?.event?.chatter_user_login || "",
      sourceMessageId,
      trackedChannelId: trackedChannel.id,
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
