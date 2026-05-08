import { parseAchievementCommand, saveAchievementClaim } from "../_lib/ladder.js";
import { readJsonBody, sendJson } from "../_lib/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  try {
    const payload = await readJsonBody(request);
    if (payload?.consentAccepted !== true) {
      return sendJson(response, 422, {
        error: "Нужно подтвердить согласие с политикой обработки персональных данных.",
      });
    }

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
      consentAcceptedAt: String(payload.consentAcceptedAt || new Date().toISOString()),
      privacyPolicyVersion: String(payload.privacyPolicyVersion || "2026-05-09"),
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
