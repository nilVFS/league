import http from "node:http";
import process from "node:process";
import { URL } from "node:url";
import adminActionHandler from "../api/admin/[action].js";
import contentDocumentHandler from "../api/content/[collection]/[id].js";
import contentIndexHandler from "../api/content/index.js";
import importClipsHandler from "../api/cron/import-clips.js";
import ladderSubmitHandler from "../api/ladder/submit.js";
import twitchAuthCallbackHandler from "../api/twitch/auth/callback.js";
import twitchAuthStartHandler from "../api/twitch/auth/start.js";
import twitchChannelProfileHandler from "../api/twitch/channel-profile.js";
import twitchClipThumbnailHandler from "../api/twitch/clip-thumbnail.js";
import twitchEventsubChatHandler from "../api/twitch/eventsub/chat.js";
import twitchEventsubDisableHandler from "../api/twitch/eventsub/disable.js";
import twitchEventsubRegisterHandler from "../api/twitch/eventsub/register.js";
import twitchLiveStatusHandler from "../api/twitch/live-status.js";

function isTimerImportRequest(pathname, method, body) {
  if (pathname !== "/" || method !== "POST" || !body || typeof body !== "object") {
    return false;
  }

  const message = Array.isArray(body.messages) ? body.messages[0] : null;
  const eventType = String(message?.event_metadata?.event_type || "");
  const payload = String(message?.details?.payload || "").trim().toLowerCase();

  return (
    eventType === "yandex.cloud.events.serverless.triggers.TimerMessage" &&
    payload === "import-clips"
  );
}

function getAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function applyCors(request, response) {
  const origin = String(request.headers.origin || "");
  const allowedOrigins = getAllowedOrigins();
  const allowAnyOrigin = allowedOrigins.includes("*");
  const allowedOrigin = allowAnyOrigin
    ? origin
    : allowedOrigins.find((value) => value === origin) || "";

  if (allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Twitch-Eventsub-Message-Id, Twitch-Eventsub-Message-Timestamp, Twitch-Eventsub-Message-Signature, Twitch-Eventsub-Message-Type"
    );
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS"
    );
  }
}

function createQueryObject(searchParams) {
  const query = {};

  for (const [key, value] of searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const current = query[key];
      query[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else {
      query[key] = value;
    }
  }

  return query;
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];

  await new Promise((resolve, reject) => {
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", resolve);
    request.on("error", reject);
  });

  if (!chunks.length) {
    request.body = {};
    return request.body;
  }

  request.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return request.body;
}

function enhanceResponse(response) {
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };

  response.json = (payload) => {
    if (!response.headersSent) {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
    }

    response.end(JSON.stringify(payload));
    return response;
  };

  response.send = (payload = "") => {
    if (Buffer.isBuffer(payload)) {
      response.end(payload);
      return response;
    }

    if (typeof payload === "object" && payload !== null) {
      return response.json(payload);
    }

    response.end(String(payload));
    return response;
  };

  response.redirect = (location) => {
    response.statusCode = response.statusCode >= 300 && response.statusCode < 400
      ? response.statusCode
      : 302;
    response.setHeader("Location", location);
    response.end();
    return response;
  };

  return response;
}

function matchRoute(pathname) {
  const routes = [
    {
      pattern: /^\/api\/admin\/([^/]+)\/?$/,
      handler: adminActionHandler,
      params: ["action"],
    },
    {
      pattern: /^\/api\/content\/([^/]+)\/([^/]+)\/?$/,
      handler: contentDocumentHandler,
      params: ["collection", "id"],
    },
    {
      pattern: /^\/api\/content\/?$/,
      handler: contentIndexHandler,
      params: [],
    },
    {
      pattern: /^\/api\/cron\/import-clips\/?$/,
      handler: importClipsHandler,
      params: [],
    },
    {
      pattern: /^\/api\/ladder\/submit\/?$/,
      handler: ladderSubmitHandler,
      params: [],
    },
    {
      pattern: /^\/api\/twitch\/auth\/callback\/?$/,
      handler: twitchAuthCallbackHandler,
      params: [],
    },
    {
      pattern: /^\/api\/twitch\/auth\/start\/?$/,
      handler: twitchAuthStartHandler,
      params: [],
    },
    {
      pattern: /^\/api\/twitch\/channel-profile\/?$/,
      handler: twitchChannelProfileHandler,
      params: [],
    },
    {
      pattern: /^\/api\/twitch\/clip-thumbnail\/?$/,
      handler: twitchClipThumbnailHandler,
      params: [],
    },
    {
      pattern: /^\/api\/twitch\/eventsub\/chat\/?$/,
      handler: twitchEventsubChatHandler,
      params: [],
    },
    {
      pattern: /^\/api\/twitch\/eventsub\/disable\/?$/,
      handler: twitchEventsubDisableHandler,
      params: [],
    },
    {
      pattern: /^\/api\/twitch\/eventsub\/register\/?$/,
      handler: twitchEventsubRegisterHandler,
      params: [],
    },
    {
      pattern: /^\/api\/twitch\/live-status\/?$/,
      handler: twitchLiveStatusHandler,
      params: [],
    },
  ];

  for (const route of routes) {
    const match = pathname.match(route.pattern);

    if (!match) {
      continue;
    }

    const routeQuery = {};
    route.params.forEach((paramName, index) => {
      routeQuery[paramName] = decodeURIComponent(match[index + 1] || "");
    });

    return {
      handler: route.handler,
      routeQuery,
    };
  }

  return null;
}

export function createApiServer() {
  return http.createServer(async (request, rawResponse) => {
    const response = enhanceResponse(rawResponse);
    applyCors(request, response);

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/healthz") {
      return response.status(200).json({ ok: true });
    }

    if (requestUrl.pathname === "/" && request.method === "POST") {
      try {
        const body = await readJsonBody(request);

        if (isTimerImportRequest(requestUrl.pathname, request.method, body)) {
          request.method = "GET";
          request.query = process.env.CRON_SECRET
            ? { secret: String(process.env.CRON_SECRET) }
            : {};
          return await importClipsHandler(request, response);
        }
      } catch (error) {
        return response.status(400).json({
          error: error.message || "Invalid trigger payload.",
        });
      }
    }

    const matchedRoute = matchRoute(requestUrl.pathname);

    if (!matchedRoute) {
      return response.status(404).json({ error: "Not Found" });
    }

    request.query = {
      ...createQueryObject(requestUrl.searchParams),
      ...matchedRoute.routeQuery,
    };

    try {
      await matchedRoute.handler(request, response);
    } catch (error) {
      console.error("[server] unhandled route error", {
        pathname: requestUrl.pathname,
        method: request.method,
        message: error.message,
        stack: error.stack,
      });

      if (!response.headersSent) {
        response.status(500).json({
          error: error.message || "Unknown server error.",
        });
      }
    }
  });
}

function shouldStartServer() {
  return process.argv[1] && process.argv[1].endsWith("/server/index.js");
}

if (shouldStartServer()) {
  const server = createApiServer();
  const port = Number(process.env.PORT || 3000);

  server.listen(port, () => {
    console.log(`[server] listening on port ${port}`);
  });
}
