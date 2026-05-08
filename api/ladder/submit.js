import { parseAchievementCommand, saveAchievementClaim } from "../_lib/ladder.js";
import { readJsonBody, sendJson } from "../_lib/http.js";

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const origin = String(request.headers.origin || "");
  const referer = String(request.headers.referer || "");
  const host =
    String(request.headers["x-forwarded-host"] || request.headers.host || "").trim();

  if (host) {
    const normalizedHost = host.toLowerCase();

    const matchesHost = (value) => {
      if (!value) {
        return false;
      }

      try {
        return new URL(value).host.toLowerCase() === normalizedHost;
      } catch {
        return false;
      }
    };

    if (matchesHost(origin) || matchesHost(referer)) {
      return true;
    }
  }

  const authorization = request.headers.authorization || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  return bearerToken === secret;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  if (!isAuthorized(request)) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  try {
    const payload = await readJsonBody(request);
    const text = String(payload.text || "").trim();
    const command = parseAchievementCommand(text);

    if (!command) {
      return sendJson(response, 400, {
        error:
          "Команда должна быть в формате !выполнил nick#1234 номер, !выполнил nick#1234 номер ссылка, !в nick#1234 номер или !в nick#1234 номер ссылка",
      });
    }

    const result = await saveAchievementClaim(command, {
      sourceMessageId: String(payload.sourceMessageId || ""),
      chatterLogin: String(payload.chatterLogin || "manual"),
      chatterName: String(payload.chatterName || "manual"),
      broadcasterUserId: String(payload.broadcasterUserId || ""),
      broadcasterLogin: String(payload.broadcasterLogin || ""),
      submittedAt: String(payload.submittedAt || new Date().toISOString()),
    });

    return sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    console.error("[ladder/submit] failed", {
      message: error.message,
      stack: error.stack,
    });

    return sendJson(response, error.statusCode || 500, {
      error: error.message || "Unknown ladder submit error.",
    });
  }
}
