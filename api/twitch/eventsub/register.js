import { requireAdmin } from "../../_lib/admin-auth.js";
import {
  collectionNames,
  createDocument,
  listCollection,
  updateDocument,
} from "../../_lib/content-store.js";
import { readJsonBody, sendJson } from "../../_lib/http.js";
import {
  createOrReuseChatMessageSubscription,
  findTwitchUserByLogin,
  getTwitchAppAccessToken,
} from "../../_lib/twitch-eventsub.js";

function getCallbackUrl(request) {
  const protoHeader = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const hostHeader =
    String(request.headers["x-forwarded-host"] || "").split(",")[0].trim() ||
    String(request.headers.host || "").trim();
  const protocol = protoHeader || (hostHeader.includes("localhost") ? "http" : "https");

  return `${protocol}://${hostHeader}/api/twitch/eventsub/chat`;
}

function getTrackedChannelId(channel) {
  return String(channel.broadcasterUserId || "")
    .trim()
    .toLowerCase() || String(channel.broadcasterLogin || "").trim().toLowerCase();
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  try {
    requireAdmin(request);

    const payload = await readJsonBody(request);
    const broadcasterLogin = String(payload.broadcasterLogin || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    let broadcasterUserId = String(payload.broadcasterUserId || "").trim();
    let displayName = String(payload.displayName || "").trim();

    if (!broadcasterUserId && !broadcasterLogin) {
      const error = new Error("Нужен broadcaster login или broadcaster user id.");
      error.statusCode = 400;
      throw error;
    }

    if (!broadcasterUserId) {
      const appToken = await getTwitchAppAccessToken();
      const twitchUser = await findTwitchUserByLogin(broadcasterLogin, appToken);
      broadcasterUserId = twitchUser.id;
      displayName = displayName || twitchUser.displayName;
    }

    const callbackUrl = getCallbackUrl(request);
    const { subscription, reused } = await createOrReuseChatMessageSubscription({
      broadcasterUserId,
      callbackUrl,
    });

    if (!subscription?.id) {
      const error = new Error("Twitch не вернул subscription id.");
      error.statusCode = 502;
      throw error;
    }

    const trackedChannels = await listCollection(collectionNames.trackedChannels);
    const existingChannel = trackedChannels.find(
      (channel) =>
        String(channel.broadcasterUserId || "") === broadcasterUserId ||
        String(channel.broadcasterLogin || "").toLowerCase() === broadcasterLogin
    );
    const channelPayload = {
      id:
        existingChannel?.id ||
        getTrackedChannelId({
          broadcasterUserId,
          broadcasterLogin,
        }),
      broadcasterUserId,
      broadcasterLogin,
      displayName: displayName || existingChannel?.displayName || broadcasterLogin,
      enabled: true,
      subscriptionId: String(subscription.id || ""),
      subscriptionStatus: String(subscription.status || ""),
      lastSyncAt: new Date().toISOString(),
      lastSyncError: "",
    };

    const trackedChannel = existingChannel
      ? await updateDocument(collectionNames.trackedChannels, existingChannel.id, channelPayload)
      : await createDocument(collectionNames.trackedChannels, channelPayload);

    return sendJson(response, 200, {
      ok: true,
      reused,
      trackedChannel,
      subscription,
    });
  } catch (error) {
    console.error("[twitch/eventsub/register] failed", {
      message: error.message,
      stack: error.stack,
      details: error.details || null,
    });

    return sendJson(response, error.statusCode || 500, {
      error: error.message || "Unknown EventSub register error.",
      details: error.details || null,
    });
  }
}
