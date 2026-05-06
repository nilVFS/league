import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const collectionNames = {
  clips: "clips",
  participants: "participants",
  awards: "awards",
  suggestions: "suggestions",
};

const allowedCollections = new Set(Object.values(collectionNames));

const defaultStore = {
  clips: [],
  participants: [],
  awards: [],
  suggestions: [],
};

function getStorePath() {
  return process.env.CONTENT_STORE_PATH || path.join(process.cwd(), ".data", "content-store.json");
}

async function ensureStoreFile() {
  const storePath = getStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch {
    await writeFile(storePath, JSON.stringify(defaultStore, null, 2), "utf8");
  }

  return storePath;
}

async function readStore() {
  const storePath = await ensureStoreFile();
  const raw = await readFile(storePath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    ...defaultStore,
    ...parsed,
  };
}

async function writeStore(store) {
  const storePath = await ensureStoreFile();
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

function assertCollection(name) {
  if (!allowedCollections.has(name)) {
    const error = new Error(`Неизвестная коллекция: ${name}`);
    error.statusCode = 400;
    throw error;
  }
}

function normalizeTimestamp(value, fallbackValue) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallbackValue;
}

function compareByCreatedAtDesc(left, right) {
  const leftTime = Date.parse(left.createdAt || left.updatedAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || right.updatedAt || "") || 0;

  return rightTime - leftTime;
}

export async function listCollection(name) {
  assertCollection(name);
  const store = await readStore();
  return [...(store[name] || [])].sort(compareByCreatedAtDesc);
}

export async function getCollectionCount(name) {
  assertCollection(name);
  const store = await readStore();
  return (store[name] || []).length;
}

export async function createDocument(name, payload) {
  assertCollection(name);
  const store = await readStore();
  const nowIso = new Date().toISOString();
  const document = {
    id: crypto.randomUUID(),
    ...payload,
    createdAt: normalizeTimestamp(payload.createdAt, nowIso),
    updatedAt: normalizeTimestamp(payload.updatedAt, nowIso),
  };

  store[name] = [...(store[name] || []), document];
  await writeStore(store);

  return document;
}

export async function updateDocument(name, id, payload) {
  assertCollection(name);
  const store = await readStore();
  const items = store[name] || [];
  const index = items.findIndex((item) => item.id === id);

  if (index < 0) {
    const error = new Error("Документ не найден.");
    error.statusCode = 404;
    throw error;
  }

  const current = items[index];
  const next = {
    ...current,
    ...payload,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  items[index] = next;
  store[name] = items;
  await writeStore(store);

  return next;
}

export async function deleteDocument(name, id) {
  assertCollection(name);
  const store = await readStore();
  const items = store[name] || [];
  const nextItems = items.filter((item) => item.id !== id);

  if (nextItems.length === items.length) {
    const error = new Error("Документ не найден.");
    error.statusCode = 404;
    throw error;
  }

  store[name] = nextItems;
  await writeStore(store);
}
