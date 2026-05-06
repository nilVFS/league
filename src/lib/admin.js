import { buildApiUrl } from "./api.js";

async function readJson(response, fallbackMessage) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || fallbackMessage);
  }

  return payload;
}

export async function getAdminSession() {
  const response = await fetch(buildApiUrl("/api/admin/session"), {
    credentials: "include",
  });
  const payload = await readJson(response, "Не удалось проверить сессию.");
  return payload.user;
}

export async function loginAdmin(email, password) {
  const response = await fetch(buildApiUrl("/api/admin/login"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readJson(response, "Не удалось войти.");
  return payload.user;
}

export async function logoutAdmin() {
  const response = await fetch(buildApiUrl("/api/admin/logout"), {
    method: "POST",
    credentials: "include",
  });
  await readJson(response, "Не удалось завершить сессию.");
}
