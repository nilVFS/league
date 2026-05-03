const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_CLIPS_URL = "https://api.twitch.tv/helix/clips";

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

async function getClipData(slug, clientId, accessToken) {
  const response = await fetch(
    `${TWITCH_CLIPS_URL}?id=${encodeURIComponent(slug)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Не удалось получить данные клипа из Twitch API.");
  }

  const payload = await response.json();
  const clip = payload?.data?.[0];

  return {
    title: clip?.title || "",
    thumbnailUrl: clip?.thumbnail_url || "",
  };
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  const slug = String(request.query.slug || "").trim();
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!slug) {
    return response.status(400).json({ error: "Missing clip slug." });
  }

  if (!clientId || !clientSecret) {
    return response.status(500).json({
      error: "Twitch credentials are not configured.",
    });
  }

  try {
    const accessToken = await getAppAccessToken(clientId, clientSecret);
    const clipData = await getClipData(slug, clientId, accessToken);

    return response.status(200).json({
      slug,
      title: clipData.title,
      thumbnailUrl: clipData.thumbnailUrl,
    });
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Unknown Twitch API error.",
    });
  }
}
