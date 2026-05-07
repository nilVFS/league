import { createDocument, listCollection } from "../_lib/content-store.js";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const TWITCH_CLIPS_URL = "https://api.twitch.tv/helix/clips";
const TWITCH_GAMES_URL = "https://api.twitch.tv/helix/games";
const IMPORT_LOOKBACK_HOURS = 12;
const TARGET_CLIP_GAME_NAME = "Path of Exile 2";
const CLIPS_PAGE_SIZE = 100;
const MAX_CLIP_PAGES_PER_CHANNEL = 3;

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

async function createClipDocument(payload) {
  await createDocument("clips", payload);
}

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

async function getGameIdByName(gameName, clientId, accessToken) {
  const search = new URLSearchParams({
    name: gameName,
  });

  const response = await fetch(`${TWITCH_GAMES_URL}?${search.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Не удалось получить Twitch-категорию ${gameName}.`);
  }

  const payload = await response.json();
  return String(payload?.data?.[0]?.id || "").trim();
}

async function getClipsForBroadcaster(broadcasterId, clientId, accessToken, startedAt) {
  const clips = [];
  let cursor = "";

  for (let page = 0; page < MAX_CLIP_PAGES_PER_CHANNEL; page += 1) {
    const search = new URLSearchParams({
      broadcaster_id: broadcasterId,
      first: String(CLIPS_PAGE_SIZE),
      started_at: startedAt,
    });

    if (cursor) {
      search.set("after", cursor);
    }

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
    clips.push(...(payload?.data || []));

    cursor = String(payload?.pagination?.cursor || "");
    if (!cursor) {
      break;
    }
  }

  return clips;
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
    const [participants, existingClips] = await Promise.all([
      listCollection("participants"),
      listCollection("clips"),
    ]);

    const participantLogins = Array.from(
      new Set(
        participants
          .map((participant) => extractTwitchChannelLogin(participant.href || ""))
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

    const existingSlugs = new Set(
      existingClips
        .map((clip) => String(clip.clipSlug || "").trim())
        .filter(Boolean)
    );
    const importedSlugs = new Set();

    const accessToken = await getAppAccessToken(clientId, clientSecret);
    const users = await getUsersByLogins(participantLogins, clientId, accessToken);
    const targetGameName =
      String(process.env.TWITCH_CLIP_GAME_NAME || "").trim() || TARGET_CLIP_GAME_NAME;
    const targetGameId =
      String(process.env.TWITCH_CLIP_GAME_ID || "").trim() ||
      (await getGameIdByName(targetGameName, clientId, accessToken));

    if (!targetGameId) {
      return response.status(500).json({
        error: `Twitch-категория ${targetGameName} не найдена.`,
      });
    }

    const startedAt = new Date(
      Date.now() - IMPORT_LOOKBACK_HOURS * 60 * 60 * 1000
    ).toISOString();

    let importedCount = 0;
    let skippedByGameCount = 0;

    for (const user of users) {
      const clips = await getClipsForBroadcaster(user.id, clientId, accessToken, startedAt);

      for (const clip of clips) {
        if (String(clip.game_id || "") !== targetGameId) {
          skippedByGameCount += 1;
          continue;
        }

        const clipSlug = String(clip.id || "").trim();
        if (!clipSlug || existingSlugs.has(clipSlug) || importedSlugs.has(clipSlug)) {
          continue;
        }

        const nowIso = new Date().toISOString();
        await createClipDocument({
          title: clip.title || `${user.display_name} Clip`,
          preview: clip.title || "",
          description: `Автодобавлено с канала ${clip.broadcaster_name || user.display_name}.`,
          clipSlug,
          thumbnailUrl: clip.thumbnail_url || "",
          broadcasterName: clip.broadcaster_name || user.display_name || "",
          clipCreatedAt: clip.created_at || "",
          importedByCron: true,
          importedAt: nowIso,
          createdAt: nowIso,
        });

        importedSlugs.add(clipSlug);
        importedCount += 1;
      }
    }

    return response.status(200).json({
      imported: importedCount,
      checkedChannels: users.length,
      lookbackHours: IMPORT_LOOKBACK_HOURS,
      gameName: targetGameName,
      gameId: targetGameId,
      skippedByGame: skippedByGameCount,
    });
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Не удалось импортировать клипы.",
    });
  }
}
