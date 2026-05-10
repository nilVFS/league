import { requireAdmin } from "../../_lib/admin-auth.js";
import {
  collectionNames,
  listCollection,
  updateDocument,
} from "../../_lib/content-store.js";
import { sendJson } from "../../_lib/http.js";
import { deleteAllChatMessageSubscriptions } from "../../_lib/twitch-eventsub.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method Not Allowed" });
  }

  try {
    requireAdmin(request);

    const removedSubscriptions = await deleteAllChatMessageSubscriptions();
    const trackedChannels = await listCollection(collectionNames.trackedChannels);

    await Promise.all(
      trackedChannels.map((channel) =>
        updateDocument(collectionNames.trackedChannels, channel.id, {
          enabled: false,
          subscriptionStatus: "disabled",
          lastSyncAt: new Date().toISOString(),
          lastSyncError: "",
        })
      )
    );

    return sendJson(response, 200, {
      ok: true,
      removedSubscriptions,
      disabledTrackedChannels: trackedChannels.length,
    });
  } catch (error) {
    console.error("[twitch/eventsub/disable] failed", {
      message: error.message,
      stack: error.stack,
      details: error.details || null,
    });

    return sendJson(response, error.statusCode || 500, {
      error: error.message || "Unknown EventSub disable error.",
      details: error.details || null,
    });
  }
}
