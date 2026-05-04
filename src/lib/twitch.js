export function extractTwitchClipSlug(value) {
  const input = value.trim();

  if (!input) {
    return "";
  }

  if (!input.includes("http")) {
    return input;
  }

  try {
    const url = new URL(input);

    if (url.hostname.includes("clips.twitch.tv")) {
      return url.pathname.replaceAll("/", "");
    }

    const clipSegmentIndex = url.pathname.split("/").findIndex((part) => part === "clip");
    if (clipSegmentIndex >= 0) {
      return url.pathname.split("/")[clipSegmentIndex + 1] || "";
    }
  } catch {
    return input;
  }

  return input;
}

export function extractTwitchChannelLogin(value) {
  const input = value.trim();

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

export async function fetchTwitchClipThumbnailBySlug(value) {
  const clipData = await fetchTwitchClipData(value);
  return clipData.thumbnailUrl || "";
}

export async function fetchTwitchClipData(value) {
  const slug = extractTwitchClipSlug(value);
  if (!slug) {
    return {
      title: "",
      thumbnailUrl: "",
      createdAt: "",
      broadcasterName: "",
    };
  }

  const response = await fetch(
    `/api/twitch/clip-thumbnail?slug=${encodeURIComponent(slug)}`
  );

  if (!response.ok) {
    throw new Error("Не удалось подтянуть превью клипа из Twitch.");
  }

  const payload = await response.json();
  return {
    title: payload.title || "",
    thumbnailUrl: payload.thumbnailUrl || "",
    createdAt: payload.createdAt || "",
    broadcasterName: payload.broadcasterName || "",
  };
}

export async function fetchTwitchChannelProfile(value) {
  const login = extractTwitchChannelLogin(value);
  if (!login) {
    throw new Error("Не удалось определить Twitch-аккаунт из ссылки.");
  }

  const response = await fetch(
    `/api/twitch/channel-profile?login=${encodeURIComponent(login)}`
  );

  if (!response.ok) {
    throw new Error("Не удалось подтянуть профиль участника из Twitch.");
  }

  return response.json();
}

export async function fetchTwitchLiveStatuses(values) {
  const logins = Array.from(
    new Set(
      values
        .map((value) => extractTwitchChannelLogin(value))
        .filter(Boolean)
    )
  );

  if (!logins.length) {
    return {};
  }

  const search = new URLSearchParams();
  logins.forEach((login) => {
    search.append("login", login);
  });

  const response = await fetch(`/api/twitch/live-status?${search.toString()}`);
  if (!response.ok) {
    throw new Error("Не удалось проверить live-статусы участников.");
  }

  const payload = await response.json();
  return payload.statuses || {};
}

export function getTwitchEmbedParent() {
  if (typeof window === "undefined") {
    return "localhost";
  }

  return window.location.hostname || "localhost";
}

export function getTwitchClipEmbedUrl(clipSlug) {
  const parent = getTwitchEmbedParent();
  const slug = extractTwitchClipSlug(clipSlug);

  if (!slug) {
    return "";
  }

  return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${encodeURIComponent(parent)}&autoplay=false`;
}
