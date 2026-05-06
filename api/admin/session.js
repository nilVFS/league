import { getAdminSession } from "../_lib/admin-auth.js";
import { sendJson } from "../_lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  const session = getAdminSession(request);

  return sendJson(response, 200, {
    user: session ? { email: session.email } : null,
  });
}
