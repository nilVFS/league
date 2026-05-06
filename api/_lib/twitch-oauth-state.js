import crypto from "node:crypto";

function getStateSecret() {
  return (
    process.env.TWITCH_OAUTH_STATE_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.TWITCH_EVENTSUB_SECRET ||
    ""
  );
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value) {
  const secret = getStateSecret();

  if (!secret) {
    const error = new Error(
      "Не задан TWITCH_OAUTH_STATE_SECRET, ADMIN_SESSION_SECRET или TWITCH_EVENTSUB_SECRET."
    );
    error.statusCode = 500;
    throw error;
  }

  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createOauthStateToken(payload) {
  const value = encodeBase64Url(
    JSON.stringify({
      ...payload,
      exp: Date.now() + 15 * 60 * 1000,
    })
  );
  const signature = signValue(value);

  return `${value}.${signature}`;
}

export function parseOauthStateToken(token) {
  const [value = "", signature = ""] = String(token || "").split(".");

  if (!value || !signature) {
    const error = new Error("Некорректный OAuth state.");
    error.statusCode = 400;
    throw error;
  }

  const expectedSignature = signValue(value);

  if (!timingSafeEqual(signature, expectedSignature)) {
    const error = new Error("OAuth state подпись не совпала.");
    error.statusCode = 400;
    throw error;
  }

  let payload = null;

  try {
    payload = JSON.parse(decodeBase64Url(value));
  } catch {
    payload = null;
  }

  if (!payload?.exp || payload.exp <= Date.now()) {
    const error = new Error("OAuth state истёк. Попробуй начать заново.");
    error.statusCode = 400;
    throw error;
  }

  return payload;
}
