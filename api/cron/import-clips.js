const FIREBASE_API_KEY = "AIzaSyD5Q9Z94YMK4K1OQRlQBvxZOSsaiAarOXI";
const FIREBASE_PROJECT_ID = "league-9849c";
const FIREBASE_AUTH_URL =
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
const FIRESTORE_BASE_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const TWITCH_CLIPS_URL = "https://api.twitch.tv/helix/clips";
const IMPORT_LOOKBACK_HOURS = 24;
const MAX_CLIPS_PER_CHANNEL = 20;

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

function parseFirestoreValue(value) {
  if ("stringValue" in value) {
    return value.stringValue;
  }
  if ("integerValue" in value) {
    return Number(value.integerValue);
  }
  if ("doubleValue" in value) {
    return Number(value.doubleValue);
  }
  if ("booleanValue" in value) {
    return Boolean(value.booleanValue);
  }
  if ("timestampValue" in value) {
    return value.timestampValue;
  }
  if ("nullValue" in value) {
    return null;
  }

  return undefined;
}

function parseFirestoreDocument(document) {
  const fields = document.fields || {};
  return Object.entries(fields).reduce(
    (accumulator, [key, value]) => {
      accumulator[key] = parseFirestoreValue(value);
      return accumulator;
    },
    {
      id: document.name?.split("/").pop() || "",
    }
  );
}

function toFirestoreFields(payload) {
  return Object.entries(payload).reduce((accumulator, [key, value]) => {
    if (value === undefined) {
      return accumulator;
    }

    if (typeof value === "boolean") {
      accumulator[key] = { booleanValue: value };
      return accumulator;
    }

    if (typeof value === "number") {
      accumulator[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
      return accumulator;
    }

    if (key === "createdAt" || key === "importedAt") {
      accumulator[key] = { timestampValue: String(value) };
      return accumulator;
    }

    accumulator[key] = { stringValue: String(value ?? "") };
    return accumulator;
  }, {});
}

async function signInCronUser() {
  const email = process.env.CRON_FIREBASE_EMAIL;
  const password = process.env.CRON_FIREBASE_PASSWORD;

  if (!email || !password) {
    throw new Error("Cron Firebase credentials are not configured.");
  }

  const response = await fetch(FIREBASE_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!response.ok) {
    throw new Error("Не удалось войти в Firebase cron-пользователем.");
  }

  const payload = await response.json();
  return payload.idToken || "";
}

async function listCollection(name, idToken) {
  const response = await fetch(`${FIRESTORE_BASE_URL}/${name}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Не удалось получить коллекцию ${name} из Firestore.`);
  }

  const payload = await response.json();
  return (payload.documents || []).map(parseFirestoreDocument);
}

async function createClipDocument(payload, idToken) {
  const response = await fetch(`${FIRESTORE_BASE_URL}/clips`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: toFirestoreFields(payload),
    }),
  });

  if (!response.ok) {
    throw new Error("Не удалось записать новый клип в Firestore.");
  }
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
    const idToken = await signInCronUser();
    const [participants, existingClips] = await Promise.all([
      listCollection("participants", idToken),
      listCollection("clips", idToken),
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

        const nowIso = new Date().toISOString();
        await createClipDocument(
          {
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
          },
          idToken
        );

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
