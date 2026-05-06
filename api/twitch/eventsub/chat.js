import crypto from "node:crypto";
import { parseAchievementCommand, saveAchievementClaim } from "../../_lib/ladder.js";

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

    const text = payload?.event?.message?.text || "";
    const command = parseAchievementCommand(text);

    if (!command) {
      return response.status(200).json({ ok: true, ignored: true });
    }

    await saveAchievementClaim(command, {
      sourceMessageId: payload?.event?.message_id || "",
      chatterLogin: payload?.event?.chatter_user_login || "",
      chatterName: payload?.event?.chatter_user_name || "",
      broadcasterLogin: payload?.event?.broadcaster_user_login || "",
      submittedAt: payload?.event?.message?.sent_at || payload?.event?.created_at || "",
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
