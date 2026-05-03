const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";

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

async function getChannelProfile(login, clientId, accessToken) {
  const response = await fetch(
    `${TWITCH_USERS_URL}?login=${encodeURIComponent(login)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Не удалось получить профиль Twitch.");
  }

  const payload = await response.json();
  const user = payload?.data?.[0];

  return {
    login: user?.login || login,
    displayName: user?.display_name || login,
    profileImageUrl: user?.profile_image_url || "",
    description: user?.description || "",
  };
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  const login = String(request.query.login || "").trim().toLowerCase();
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!login) {
    return response.status(400).json({ error: "Missing Twitch login." });
  }

  if (!clientId || !clientSecret) {
    return response.status(500).json({
      error: "Twitch credentials are not configured.",
    });
  }

  try {
    const accessToken = await getAppAccessToken(clientId, clientSecret);
    const profile = await getChannelProfile(login, clientId, accessToken);
    return response.status(200).json(profile);
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Unknown Twitch API error.",
    });
  }
}
