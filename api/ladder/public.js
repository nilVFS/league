import { listCollection } from "../_lib/content-store.js";
import { getQueryParam, sendJson } from "../_lib/http.js";
import { buildLadderRows } from "../../shared/ladder.js";

export default async function handler(request, response) {
  try {
    const [awards, claims] = await Promise.all([
      listCollection("awards"),
      listCollection("achievementClaims"),
    ]);
    const rows = buildLadderRows(awards, claims);
    const limit = Number(getQueryParam(request, "limit") || 0);
    const items = Number.isFinite(limit) && limit > 0 ? rows.slice(0, limit) : rows;

    return sendJson(response, 200, {
      items,
      totalPlayers: rows.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/ladder/public] request failed", {
      statusCode: error.statusCode || 500,
      message: error.message,
      stack: error.stack,
    });

    return sendJson(response, error.statusCode || 500, {
      error: error.message || "Не удалось загрузить публичный ладдер.",
    });
  }
}
