export const collectionNames = {
  clips: "clips",
  participants: "participants",
  awards: "awards",
  suggestions: "suggestions",
};

const POLL_INTERVAL_MS = 15000;

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

async function fetchCollection(name) {
  const response = await fetch(`/api/content?collection=${encodeURIComponent(name)}`, {
    credentials: "same-origin",
  });
  const payload = await readJson(response, "Не удалось загрузить коллекцию.");
  return payload.items || [];
}

export function subscribeToCollection(name, onData, onError) {
  let stopped = false;

  const load = async () => {
    try {
      const items = await fetchCollection(name);
      if (!stopped) {
        onData(items);
      }
    } catch (error) {
      if (!stopped) {
        onError(error);
      }
    }
  };

  load();
  const intervalId = window.setInterval(load, POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
  };
}

export async function createDocument(name, payload) {
  const response = await fetch(`/api/content?collection=${encodeURIComponent(name)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const nextPayload = await readJson(response, "Не удалось создать запись.");
  return nextPayload.item;
}

export async function updateDocument(name, id, payload) {
  const response = await fetch(
    `/api/content/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const nextPayload = await readJson(response, "Не удалось обновить запись.");
  return nextPayload.item;
}

export async function deleteDocument(name, id) {
  const response = await fetch(
    `/api/content/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
    }
  );

  await readJson(response, "Не удалось удалить запись.");
}

export async function isCollectionEmpty(name) {
  const items = await fetchCollection(name);
  return items.length === 0;
}

export async function seedCollection(name, items) {
  const createdItems = [];

  for (const item of items) {
    const createdItem = await createDocument(name, item);
    createdItems.push(createdItem);
  }

  return createdItems;
}

export async function uploadFile() {
  throw new Error(
    "Прямая загрузка файлов ещё не перенесена. Для Yandex Cloud сюда нужно подключить Object Storage."
  );
}
