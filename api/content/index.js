import { requireAdmin } from "../_lib/admin-auth.js";
import { createDocument, listCollection } from "../_lib/content-store.js";
import { getQueryParam, readJsonBody, sendJson } from "../_lib/http.js";

function canReadCollection(name, isAdmin) {
  return !["suggestions", "trackedChannels"].includes(name) || isAdmin;
}

function canCreateCollection(name, isAdmin) {
  if (name === "suggestions") {
    return true;
  }

  return isAdmin;
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
      return sendJson(response, 200, { items });
    }

    if (request.method === "POST") {
      if (!canCreateCollection(collectionName, isAdmin)) {
        return sendJson(response, 401, { error: "Unauthorized" });
      }

      const payload = await readJsonBody(request);
      const document = await createDocument(collectionName, payload);
      return sendJson(response, 201, { item: document });
    }

    response.setHeader("Allow", "GET, POST");
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
