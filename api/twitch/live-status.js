const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_STREAMS_URL = "https://api.twitch.tv/helix/streams";

async function getAppAccessToken(clientId, clientSecret) {
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error("Не удалось получить Twitch access token.");
  }

  const payload = await response.json();
  return payload.access_token || "";
}

async function getLiveStatuses(logins, clientId, accessToken) {
  const search = new URLSearchParams();
  logins.forEach((login) => {
    search.append("user_login", login);
  });

  const response = await fetch(`${TWITCH_STREAMS_URL}?${search.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });

  if (!response.ok) {
    throw new Error("Не удалось получить live-статусы Twitch.");
  }

  const payload = await response.json();
  const liveLogins = new Set(
    (payload?.data || []).map((stream) => String(stream.user_login || "").toLowerCase())
  );

  return logins.reduce((accumulator, login) => {
    accumulator[login] = liveLogins.has(login);
    return accumulator;
  }, {});
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  const rawLogins = request.query.login;
  const logins = (Array.isArray(rawLogins) ? rawLogins : [rawLogins])
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 100);

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!logins.length) {
    return response.status(400).json({ error: "Missing Twitch logins." });
  }

  if (!clientId || !clientSecret) {
    return response.status(500).json({
      error: "Twitch credentials are not configured.",
    });
  }

  try {
    const accessToken = await getAppAccessToken(clientId, clientSecret);
    const statuses = await getLiveStatuses(logins, clientId, accessToken);
    return response.status(200).json({ statuses });
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Unknown Twitch API error.",
    });
  }
}
