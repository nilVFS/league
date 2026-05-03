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

export async function fetchTwitchClipThumbnailBySlug(value) {
  const slug = extractTwitchClipSlug(value);
  if (!slug) {
    return "";
  }

  const response = await fetch(
    `/api/twitch/clip-thumbnail?slug=${encodeURIComponent(slug)}`
  );

  if (!response.ok) {
    throw new Error("Не удалось подтянуть превью клипа из Twitch.");
  }

  const payload = await response.json();
  return payload.thumbnailUrl || "";
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
