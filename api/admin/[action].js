import {
  createAdminSessionCookie,
  createExpiredAdminSessionCookie,
  getAdminSession,
  isAdminConfigured,
  validateAdminCredentials,
} from "../_lib/admin-auth.js";
import { readJsonBody, sendJson } from "../_lib/http.js";

async function handleLogin(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!isAdminConfigured()) {
    return sendJson(response, 500, {
      error: "ADMIN_EMAIL, ADMIN_PASSWORD и ADMIN_SESSION_SECRET должны быть заданы.",
    });
  }

  const payload = await readJsonBody(request);
  const email = String(payload.email || "").trim();
  const password = String(payload.password || "");

  if (!validateAdminCredentials(email, password)) {
    return sendJson(response, 401, { error: "Неверный email или пароль." });
  }

  response.setHeader("Set-Cookie", createAdminSessionCookie(email));
  return sendJson(response, 200, {
    user: { email },
  });
}

function handleLogout(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  response.setHeader("Set-Cookie", createExpiredAdminSessionCookie());
  return sendJson(response, 200, { ok: true });
}

function handleSession(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  const session = getAdminSession(request);

  return sendJson(response, 200, {
    user: session ? { email: session.email } : null,
  });
}

export default async function handler(request, response) {
  const action = String(request.query.action || "").trim().toLowerCase();

  try {
    if (action === "login") {
      return await handleLogin(request, response);
    }

    if (action === "logout") {
      return handleLogout(request, response);
    }

    if (action === "session") {
      return handleSession(request, response);
    }

    return sendJson(response, 404, { error: "Admin action not found." });
  } catch (error) {
    console.error("[api/admin/:action] request failed", {
      action,
      method: request.method,
      statusCode: error.statusCode || 500,
      message: error.message,
      stack: error.stack,
    });

    return sendJson(response, error.statusCode || 500, {
      error: error.message || "Unknown admin API error.",
    });
  }
}
