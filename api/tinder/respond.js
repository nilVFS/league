import { listCollection, updateDocument, collectionNames } from "../_lib/content-store.js";
import { readJsonBody, sendJson } from "../_lib/http.js";

function normalizeNickname(value = "") {
  return String(value || "").trim();
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  try {
    const payload = await readJsonBody(request);
    const postId = String(payload?.postId || "").trim();
    const nickname = normalizeNickname(payload?.nickname);

    if (!postId) {
      return sendJson(response, 400, { error: "Не указана заявка." });
    }

    if (!nickname) {
      return sendJson(response, 400, { error: "Укажи свой ник." });
    }

    const posts = await listCollection(collectionNames.tinderPosts);
    const post = posts.find(
      (item) => String(item.id || item._storageId || "").trim() === postId
    );

    if (!post) {
      return sendJson(response, 404, { error: "Заявка не найдена." });
    }

    if (post.status === "closed") {
      return sendJson(response, 400, { error: "Эта заявка уже закрыта." });
    }

    const currentPlayers = Array.isArray(post.interestedPlayers) ? post.interestedPlayers : [];
    const normalizedNickname = nickname.toLowerCase();
    const hasDuplicate = currentPlayers.some(
      (player) => String(player || "").trim().toLowerCase() === normalizedNickname
    );

    if (hasDuplicate) {
      return sendJson(response, 200, {
        item: post,
        duplicate: true,
      });
    }

    const nextInterestedPlayers = [...currentPlayers, nickname];
    const updatedPost = await updateDocument(collectionNames.tinderPosts, post._storageId || post.id, {
      interestedPlayers: nextInterestedPlayers,
    });

    return sendJson(response, 200, { item: updatedPost });
  } catch (error) {
    console.error("[api/tinder/respond] request failed", {
      statusCode: error.statusCode || 500,
      message: error.message,
      stack: error.stack,
    });

    return sendJson(response, error.statusCode || 500, {
      error: error.message || "Не удалось откликнуться на заявку.",
    });
  }
}
