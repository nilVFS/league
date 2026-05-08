import {
  collectionNames,
  createDocument,
  listCollection,
  updateDocument,
} from "../../_lib/content-store.js";
import { parseOauthStateToken } from "../../_lib/twitch-oauth-state.js";
import {
  createOrReuseChatMessageSubscription,
  exchangeAuthorizationCode,
  getTwitchUserFromAccessToken,
} from "../../_lib/twitch-eventsub.js";

function getBaseUrl(request) {
  const protoHeader = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const hostHeader =
    String(request.headers["x-forwarded-host"] || "").split(",")[0].trim() ||
    String(request.headers.host || "").trim();
  const protocol = protoHeader || (hostHeader.includes("localhost") ? "http" : "https");

  return `${protocol}://${hostHeader}`;
}

function getFrontendBaseUrl() {
  const explicitBaseUrl = String(process.env.FRONTEND_BASE_URL || "").trim().replace(/\/+$/, "");

  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const [firstAllowedOrigin = ""] = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  return firstAllowedOrigin;
}

function redirectToFrontend(response, params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      searchParams.set(key, String(value));
    }
  });

  const frontendBaseUrl = getFrontendBaseUrl();
  const targetUrl = frontendBaseUrl
    ? `${frontendBaseUrl}/?${searchParams.toString()}`
    : `/?${searchParams.toString()}`;

  return response.redirect(targetUrl);
}

function getTrackedChannelId(channel) {
  return String(channel.broadcasterUserId || "")
    .trim()
    .toLowerCase() || String(channel.broadcasterLogin || "").trim().toLowerCase();
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const state = parseOauthStateToken(String(request.query.state || ""));
    const code = String(request.query.code || "").trim();
    const errorCode = String(request.query.error || "").trim();
    const errorDescription = String(request.query.error_description || "").trim();

    if (errorCode) {
      return redirectToFrontend(response, {
        status: "error",
        step: state.kind,
        message: errorDescription || errorCode,
        channel: state.broadcasterLogin || "",
      });
    }

    if (!code) {
      const error = new Error("Twitch не вернул code.");
      error.statusCode = 400;
      throw error;
    }

    const baseUrl = getBaseUrl(request);
    const redirectUri = `${baseUrl}/api/twitch/auth/callback`;
    const tokenPayload = await exchangeAuthorizationCode({ code, redirectUri });
    const accessToken = String(tokenPayload.access_token || "");
    const twitchUser = await getTwitchUserFromAccessToken(accessToken);

    if (state.kind === "bot") {
      const configuredBotUserId = String(process.env.TWITCH_BOT_USER_ID || "").trim();

      if (configuredBotUserId && configuredBotUserId !== twitchUser.id) {
        return redirectToFrontend(response, {
          status: "error",
          step: "bot",
          message: `Авторизован не тот бот. Ожидался user id ${configuredBotUserId}, а пришёл ${twitchUser.id}.`,
        });
      }

      return redirectToFrontend(response, {
        status: "bot-connected",
        step: "bot",
        bot: twitchUser.login,
      });
    }

    if (
      state.broadcasterLogin &&
      twitchUser.login.toLowerCase() !== state.broadcasterLogin.toLowerCase()
    ) {
      return redirectToFrontend(response, {
        status: "error",
        step: "broadcaster",
        message: `Авторизован аккаунт ${twitchUser.login}, а ожидался ${state.broadcasterLogin}.`,
        channel: state.broadcasterLogin,
      });
    }

    const { subscription, reused } = await createOrReuseChatMessageSubscription({
      broadcasterUserId: twitchUser.id,
      callbackUrl: `${baseUrl}/api/twitch/eventsub/chat`,
    });
    const trackedChannels = await listCollection(collectionNames.trackedChannels);
    const existingChannel = trackedChannels.find(
      (channel) =>
        String(channel.broadcasterUserId || "") === twitchUser.id ||
        String(channel.broadcasterLogin || "").toLowerCase() === twitchUser.login.toLowerCase()
    );
    const channelPayload = {
      id:
        existingChannel?.id ||
        getTrackedChannelId({
          broadcasterUserId: twitchUser.id,
          broadcasterLogin: twitchUser.login,
        }),
      broadcasterUserId: twitchUser.id,
      broadcasterLogin: twitchUser.login,
      displayName: twitchUser.displayName,
      enabled: true,
      subscriptionId: String(subscription?.id || ""),
      subscriptionStatus: String(subscription?.status || ""),
      lastSyncAt: new Date().toISOString(),
      lastSyncError: "",
      oauthGrantedAt: new Date().toISOString(),
    };

    if (existingChannel) {
      await updateDocument(collectionNames.trackedChannels, existingChannel.id, channelPayload);
    } else {
      await createDocument(collectionNames.trackedChannels, channelPayload);
    }

    return redirectToFrontend(response, {
      status: reused ? "already-connected" : "connected",
      step: "broadcaster",
      channel: twitchUser.login,
    });
  } catch (error) {
    console.error("[twitch/auth/callback] failed", {
      message: error.message,
      stack: error.stack,
      details: error.details || null,
    });

    return redirectToFrontend(response, {
      status: "error",
      step: "callback",
      message: error.message || "Unknown Twitch auth callback error.",
    });
  }
}
