import { requireAdmin } from "../_lib/admin-auth.js";
import {
  createDocument,
  deleteDocument,
  listCollection,
  updateDocument,
} from "../_lib/content-store.js";
import { getQueryParam, readJsonBody, sendJson } from "../_lib/http.js";

function canReadCollection(name, isAdmin) {
  return !["suggestions", "trackedChannels", "ladderPlayers"].includes(name) || isAdmin;
}

function canCreateCollection(name, isAdmin) {
  if (name === "suggestions" || name === "tinderPosts" || name === "tinderResponses") {
    return true;
  }

  return isAdmin;
}

function sanitizeAchievementClaimForPublic(item) {
  return {
    id: item.id,
    playerTag: item.playerTag,
    playerTagNormalized: item.playerTagNormalized,
    achievementCode: item.achievementCode,
    achievementTitle: item.achievementTitle,
    achievementScore: item.achievementScore,
    achievementBonusScore: item.achievementBonusScore,
    proofUrl: item.proofUrl,
    submittedAt: item.submittedAt,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export default async function handler(request, response) {
  const collectionName = getQueryParam(request, "collection");
  let isAdmin = false;

  try {
    requireAdmin(request);
    isAdmin = true;
  } catch {
    isAdmin = false;
  }

  try {
    if (request.method === "GET") {
      if (!canReadCollection(collectionName, isAdmin)) {
        return sendJson(response, 401, { error: "Unauthorized" });
      }

      const items = await listCollection(collectionName);
      const publicItems =
        collectionName === "achievementClaims" && !isAdmin
          ? items.map(sanitizeAchievementClaimForPublic)
          : items;
      return sendJson(response, 200, { items: publicItems });
    }

    if (request.method === "PATCH") {
      if (!isAdmin) {
        return sendJson(response, 401, { error: "Unauthorized" });
      }

      const documentId = getQueryParam(request, "id");
      const payload = await readJsonBody(request);
      const document = await updateDocument(collectionName, documentId, payload);
      return sendJson(response, 200, { item: document });
    }

    if (request.method === "POST") {
      if (!canCreateCollection(collectionName, isAdmin)) {
        return sendJson(response, 401, { error: "Unauthorized" });
      }

      const payload = await readJsonBody(request);
      const document = await createDocument(collectionName, payload);
      return sendJson(response, 201, { item: document });
    }

    if (request.method === "DELETE") {
      if (!isAdmin) {
        return sendJson(response, 401, { error: "Unauthorized" });
      }

      const documentId = getQueryParam(request, "id");
      await deleteDocument(collectionName, documentId);
      return sendJson(response, 200, { ok: true });
    }

    response.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  } catch (error) {
    console.error("[api/content] request failed", {
      method: request.method,
      collectionName,
      isAdmin,
      statusCode: error.statusCode || 500,
      message: error.message,
      stack: error.stack,
    });

    return sendJson(response, error.statusCode || 500, {
      error: error.message || "Unknown content API error.",
    });
  }
}
