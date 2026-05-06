import {
  createAdminSessionCookie,
  isAdminConfigured,
  validateAdminCredentials,
} from "../_lib/admin-auth.js";
import { readJsonBody, sendJson } from "../_lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!isAdminConfigured()) {
    return sendJson(response, 500, {
      error: "ADMIN_EMAIL, ADMIN_PASSWORD и ADMIN_SESSION_SECRET должны быть заданы.",
    });
  }

  try {
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
  } catch (error) {
    return sendJson(response, 500, {
      error: error.message || "Unknown login error.",
    });
  }
}
