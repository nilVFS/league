import { createOauthStateToken } from "../../_lib/twitch-oauth-state.js";
import { createTwitchAuthorizeUrl } from "../../_lib/twitch-eventsub.js";

function getBaseUrl(request) {
  const protoHeader = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const hostHeader =
    String(request.headers["x-forwarded-host"] || "").split(",")[0].trim() ||
    String(request.headers.host || "").trim();
  const protocol = protoHeader || (hostHeader.includes("localhost") ? "http" : "https");

  return `${protocol}://${hostHeader}`;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const kind = String(request.query.kind || "broadcaster").trim().toLowerCase();
    const broadcasterLogin = String(request.query.broadcasterLogin || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

    if (!["bot", "broadcaster"].includes(kind)) {
      const error = new Error("Неизвестный тип Twitch OAuth.");
      error.statusCode = 400;
      throw error;
    }

    if (kind === "broadcaster" && !broadcasterLogin) {
      const error = new Error("Укажи Twitch login стримера.");
      error.statusCode = 400;
      throw error;
    }

    const baseUrl = getBaseUrl(request);
    const redirectUri = `${baseUrl}/api/twitch/auth/callback`;
    const state = createOauthStateToken({
      kind,
      broadcasterLogin,
    });
    const authorizeUrl = createTwitchAuthorizeUrl({
      redirectUri,
      state,
      scopes:
        kind === "bot"
          ? ["user:read:chat", "user:bot"]
          : ["channel:bot"],
    });

    return response.redirect(authorizeUrl);
  } catch (error) {
    return response.status(error.statusCode || 500).json({
      error: error.message || "Unknown Twitch auth start error.",
    });
  }
}
