import { getAdminDb, FieldValue } from "../_lib/firebase-admin.js";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const TWITCH_CLIPS_URL = "https://api.twitch.tv/helix/clips";
const IMPORT_LOOKBACK_HOURS = 13;
const MAX_CLIPS_PER_CHANNEL = 20;

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

function extractTwitchChannelLogin(value = "") {
  const input = String(value).trim();

  if (!input) {
    return "";
  }

  if (!input.includes("http")) {
    return input.replace(/^@/, "").trim().toLowerCase();
  }

  try {
    const url = new URL(input);
    if (!url.hostname.includes("twitch.tv")) {
      return "";
    }

    const [firstSegment = ""] = url.pathname.split("/").filter(Boolean);
    if (!firstSegment || firstSegment.toLowerCase() === "videos") {
      return "";
    }

    return firstSegment.replace(/^@/, "").trim().toLowerCase();
  } catch {
    return "";
  }
}

async function getUsersByLogins(logins, clientId, accessToken) {
  const users = [];

  for (let index = 0; index < logins.length; index += 100) {
    const chunk = logins.slice(index, index + 100);
    const search = new URLSearchParams();
    chunk.forEach((login) => {
      search.append("login", login);
    });

    const response = await fetch(`${TWITCH_USERS_URL}?${search.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
    });

    if (!response.ok) {
      throw new Error("Не удалось получить Twitch-пользователей.");
    }

    const payload = await response.json();
    users.push(...(payload?.data || []));
  }

  return users;
}

async function getClipsForBroadcaster(broadcasterId, clientId, accessToken, startedAt) {
  const search = new URLSearchParams({
    broadcaster_id: broadcasterId,
    first: String(MAX_CLIPS_PER_CHANNEL),
    started_at: startedAt,
  });

  const response = await fetch(`${TWITCH_CLIPS_URL}?${search.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Не удалось получить клипы для broadcaster_id=${broadcasterId}.`);
  }

  const payload = await response.json();
  return payload?.data || [];
}

async function getExistingClipSlugs(db) {
  const snapshot = await db.collection("clips").get();
  const slugs = new Set();

  snapshot.forEach((doc) => {
    const clipSlug = String(doc.data()?.clipSlug || "").trim();
    if (clipSlug) {
      slugs.add(clipSlug);
    }
  });

  return slugs;
}

function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true;
  }

  const authorization = request.headers.authorization || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const querySecret = String(request.query.secret || "");

  return bearerToken === cronSecret || querySecret === cronSecret;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method Not Allowed" });
  }

  if (!isAuthorized(request)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return response.status(500).json({
      error: "Twitch credentials are not configured.",
    });
  }

  try {
    const db = getAdminDb();
    const participantsSnapshot = await db.collection("participants").get();
    const participantLogins = Array.from(
      new Set(
        participantsSnapshot.docs
          .map((doc) => extractTwitchChannelLogin(doc.data()?.href || ""))
          .filter(Boolean)
      )
    );

    if (!participantLogins.length) {
      return response.status(200).json({
        imported: 0,
        checkedChannels: 0,
        message: "Нет Twitch-каналов в списке участников.",
      });
    }

    const accessToken = await getAppAccessToken(clientId, clientSecret);
    const users = await getUsersByLogins(participantLogins, clientId, accessToken);
    const existingSlugs = await getExistingClipSlugs(db);
    const importedSlugs = new Set();

    const startedAt = new Date(
      Date.now() - IMPORT_LOOKBACK_HOURS * 60 * 60 * 1000
    ).toISOString();

    let importedCount = 0;

    for (const user of users) {
      const clips = await getClipsForBroadcaster(user.id, clientId, accessToken, startedAt);

      for (const clip of clips) {
        const clipSlug = String(clip.id || "").trim();
        if (!clipSlug || existingSlugs.has(clipSlug) || importedSlugs.has(clipSlug)) {
          continue;
        }

        await db.collection("clips").add({
          title: clip.title || `${user.display_name} Clip`,
          preview: clip.title || "",
          description: `Автодобавлено с канала ${clip.broadcaster_name || user.display_name}.`,
          clipSlug,
          thumbnailUrl: clip.thumbnail_url || "",
          broadcasterName: clip.broadcaster_name || user.display_name || "",
          clipCreatedAt: clip.created_at || "",
          importedByCron: true,
          importedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });

        importedSlugs.add(clipSlug);
        importedCount += 1;
      }
    }

    return response.status(200).json({
      imported: importedCount,
      checkedChannels: users.length,
      lookbackHours: IMPORT_LOOKBACK_HOURS,
    });
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Не удалось импортировать клипы.",
    });
  }
}
