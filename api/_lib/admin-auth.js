import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || "";
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(value) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(headerValue = "") {
  return headerValue
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, cookieEntry) => {
      const [name, ...rest] = cookieEntry.split("=");
      accumulator[name] = rest.join("=");
      return accumulator;
    }, {});
}

function createSessionToken(email) {
  const payload = {
    email,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function readSessionToken(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  return cookies[SESSION_COOKIE_NAME] || "";
}

function parseSessionToken(token) {
  if (!token || !getSessionSecret()) {
    return null;
  }

  const [encodedPayload = "", signature = ""] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    if (!payload?.email || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function isAdminConfigured() {
  return Boolean(
    process.env.ADMIN_EMAIL &&
      process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_SESSION_SECRET
  );
}

export function createAdminSessionCookie(email) {
  const token = createSessionToken(email);
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
    SESSION_TTL_MS / 1000
  }`;
}

export function createExpiredAdminSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getAdminSession(request) {
  const token = readSessionToken(request);
  return parseSessionToken(token);
}

export function requireAdmin(request) {
  const session = getAdminSession(request);
  if (!session) {
    const error = new Error("Требуется вход администратора.");
    error.statusCode = 401;
    throw error;
  }

  return session;
}

export function validateAdminCredentials(email, password) {
  return (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  );
}
