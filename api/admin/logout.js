import { createExpiredAdminSessionCookie } from "../_lib/admin-auth.js";
import { sendJson } from "../_lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  response.setHeader("Set-Cookie", createExpiredAdminSessionCookie());
  return sendJson(response, 200, { ok: true });
}
