export function getQueryParam(request, name) {
  const value = request?.query?.[name];

  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
}

export async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];

  await new Promise((resolve, reject) => {
    request.on("data", (chunk) => {
      chunks.push(chunk);
    });
    request.on("end", resolve);
    request.on("error", reject);
  });

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}
