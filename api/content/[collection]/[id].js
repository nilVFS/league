import { requireAdmin } from "../../_lib/admin-auth.js";
import { deleteDocument, updateDocument } from "../../_lib/content-store.js";
import { readJsonBody, sendJson } from "../../_lib/http.js";

export default async function handler(request, response) {
  const collectionName = String(request.query.collection || "").trim();
  const documentId = String(request.query.id || "").trim();

  try {
    requireAdmin(request);

    if (request.method === "PATCH") {
      const payload = await readJsonBody(request);
      const document = await updateDocument(collectionName, documentId, payload);
      return sendJson(response, 200, { item: document });
    }

    if (request.method === "DELETE") {
      await deleteDocument(collectionName, documentId);
      return sendJson(response, 200, { ok: true });
    }

    response.setHeader("Allow", "PATCH, DELETE");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  } catch (error) {
    console.error("[api/content/:collection/:id] request failed", {
      method: request.method,
      collectionName,
      documentId,
      statusCode: error.statusCode || 500,
      message: error.message,
      stack: error.stack,
    });

    return sendJson(response, error.statusCode || 500, {
      error: error.message || "Unknown content API error.",
    });
  }
}
