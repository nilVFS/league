const TWITCH_OAUTH_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_API_BASE_URL = "https://api.twitch.tv/helix";

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    const error = new Error(`${name} не задан.`);
    error.statusCode = 500;
    throw error;
  }

  return value;
}

async function readResponsePayload(response, fallbackMessage) {
  const contentType = String(response.headers.get("content-type") || "");
  let payload = null;
  let text = "";

  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      text = await response.text();
    } catch {
      text = "";
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.message || text || fallbackMessage);
    error.statusCode = response.status;
    error.details = payload || text || null;
    throw error;
  }

  return payload;
}

function getTwitchConfig() {
  return {
    clientId: getRequiredEnv("TWITCH_CLIENT_ID"),
    clientSecret: getRequiredEnv("TWITCH_CLIENT_SECRET"),
    eventsubSecret: getRequiredEnv("TWITCH_EVENTSUB_SECRET"),
    botUserId: getRequiredEnv("TWITCH_BOT_USER_ID"),
  };
}

export async function getTwitchAppAccessToken() {
  const { clientId, clientSecret } = getTwitchConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch(TWITCH_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await readResponsePayload(
    response,
    "Не удалось получить app access token Twitch."
  );

  return payload.access_token || "";
}

export function createTwitchAuthorizeUrl({
  redirectUri,
  state,
  scopes,
}) {
  const { clientId } = getTwitchConfig();
  const searchParams = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(" "),
  });

  return `${TWITCH_AUTHORIZE_URL}?${searchParams.toString()}`;
}

export async function exchangeAuthorizationCode({ code, redirectUri }) {
  const { clientId, clientSecret } = getTwitchConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch(TWITCH_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return readResponsePayload(
    response,
    "Не удалось обменять Twitch code на user token."
  );
}

async function twitchApiRequest(pathname, accessToken, options = {}) {
  const { clientId } = getTwitchConfig();
  const response = await fetch(`${TWITCH_API_BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  return readResponsePayload(response, "Twitch API request failed.");
}

export async function findTwitchUserByLogin(login, accessToken) {
  const normalizedLogin = String(login || "").trim().toLowerCase();

  if (!normalizedLogin) {
    const error = new Error("Нужен broadcaster login.");
    error.statusCode = 400;
    throw error;
  }

  const payload = await twitchApiRequest(
    `/users?login=${encodeURIComponent(normalizedLogin)}`,
    accessToken,
    { method: "GET" }
  );
  const [user] = payload?.data || [];

  if (!user?.id) {
    const error = new Error(`Twitch-пользователь ${normalizedLogin} не найден.`);
    error.statusCode = 404;
    throw error;
  }

  return {
    id: String(user.id),
    login: String(user.login || normalizedLogin),
    displayName: String(user.display_name || user.login || normalizedLogin),
  };
}

export async function getTwitchUserFromAccessToken(accessToken) {
  const payload = await twitchApiRequest("/users", accessToken, {
    method: "GET",
  });
  const [user] = payload?.data || [];

  if (!user?.id) {
    const error = new Error("Не удалось получить Twitch-пользователя по access token.");
    error.statusCode = 502;
    throw error;
  }

  return {
    id: String(user.id),
    login: String(user.login || ""),
    displayName: String(user.display_name || user.login || ""),
  };
}

export async function listEventsubSubscriptions(accessToken) {
  const payload = await twitchApiRequest("/eventsub/subscriptions", accessToken, {
    method: "GET",
  });

  return payload?.data || [];
}

async function deleteEventsubSubscription(subscriptionId, accessToken) {
  if (!subscriptionId) {
    return;
  }

  await twitchApiRequest(
    `/eventsub/subscriptions?id=${encodeURIComponent(String(subscriptionId))}`,
    accessToken,
    {
      method: "DELETE",
    }
  );
}

export async function createOrReuseChatMessageSubscription({
  broadcasterUserId,
  callbackUrl,
}) {
  const { botUserId, eventsubSecret } = getTwitchConfig();
  const accessToken = await getTwitchAppAccessToken();
  const subscriptions = await listEventsubSubscriptions(accessToken);
  const matchingSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription?.type === "channel.chat.message" &&
      String(subscription?.condition?.broadcaster_user_id || "") ===
        String(broadcasterUserId) &&
      String(subscription?.condition?.user_id || "") === String(botUserId) &&
      subscription?.status !== "authorization_revoked" &&
      subscription?.status !== "user_removed"
  );

  const callbackNormalized = String(callbackUrl || "").trim().replace(/\/+$/, "");
  const sameCallbackSubscriptions = matchingSubscriptions.filter(
    (subscription) =>
      String(subscription?.transport?.callback || "").trim().replace(/\/+$/, "") ===
      callbackNormalized
  );
  const existingSubscription = sameCallbackSubscriptions.find(
    (subscription) => subscription?.status === "enabled"
  );

  await Promise.all(
    matchingSubscriptions
      .filter((subscription) => subscription?.id !== existingSubscription?.id)
      .map((subscription) => deleteEventsubSubscription(subscription?.id, accessToken))
  );

  if (existingSubscription) {
    return {
      subscription: existingSubscription,
      reused: true,
    };
  }

  const payload = await twitchApiRequest("/eventsub/subscriptions", accessToken, {
    method: "POST",
    body: JSON.stringify({
      type: "channel.chat.message",
      version: "1",
      condition: {
        broadcaster_user_id: String(broadcasterUserId),
        user_id: String(botUserId),
      },
      transport: {
        method: "webhook",
        callback: callbackUrl,
        secret: eventsubSecret,
      },
    }),
  });

  return {
    subscription: payload?.data?.[0] || null,
    reused: false,
  };
}

export async function sendTwitchChatMessage({
  broadcasterUserId,
  message,
  replyParentMessageId = "",
}) {
  const { botUserId } = getTwitchConfig();
  const accessToken = await getTwitchAppAccessToken();
  const payload = await twitchApiRequest("/chat/messages", accessToken, {
    method: "POST",
    body: JSON.stringify({
      broadcaster_id: String(broadcasterUserId),
      sender_id: String(botUserId),
      message: String(message || ""),
      ...(replyParentMessageId
        ? { reply_parent_message_id: String(replyParentMessageId) }
        : {}),
    }),
  });
  const messageResult = payload?.data?.[0] || null;

  if (!messageResult?.is_sent) {
    const error = new Error(
      messageResult?.drop_reason?.message || "Twitch не отправил сообщение в чат."
    );
    error.statusCode = 502;
    error.details = messageResult?.drop_reason || payload || null;
    throw error;
  }

  return messageResult;
}
