import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Driver } from "@ydbjs/core";
import { query } from "@ydbjs/query";
import { ServiceAccountCredentialsProvider } from "@ydbjs/auth-yandex-cloud";

export const collectionNames = {
  clips: "clips",
  participants: "participants",
  awards: "awards",
  suggestions: "suggestions",
  tinderPosts: "tinderPosts",
  tinderResponses: "tinderResponses",
  achievementClaims: "achievementClaims",
  ladderPlayers: "ladderPlayers",
  trackedChannels: "trackedChannels",
};

const allowedCollections = new Set(Object.values(collectionNames));
const YDB_TABLE_NAME = "content_items";
const DEFAULT_COLLECTION_CACHE_TTL_MS = Number(
  process.env.CONTENT_COLLECTION_CACHE_TTL_MS || 10000
);
const publicCollectionNames = new Set([
  collectionNames.clips,
  collectionNames.participants,
  collectionNames.awards,
  collectionNames.tinderPosts,
  collectionNames.tinderResponses,
]);
const moderatedCollectionNames = new Set([
  collectionNames.suggestions,
  collectionNames.achievementClaims,
  collectionNames.ladderPlayers,
  collectionNames.trackedChannels,
]);

const defaultStore = {
  clips: [],
  participants: [],
  awards: [],
  suggestions: [],
  tinderPosts: [],
  tinderResponses: [],
  achievementClaims: [],
  ladderPlayers: [],
  trackedChannels: [],
};

let driverPromise = null;
let schemaPromise = null;
const collectionCache = new Map();
const pendingCollectionLoads = new Map();

function getStorePath() {
  return process.env.CONTENT_STORE_PATH || path.join(process.cwd(), ".data", "content-store.json");
}

function isYdbConfigured() {
  return Boolean(
    process.env.YDB_ENDPOINT &&
      process.env.YDB_DATABASE &&
      process.env.YDB_SERVICE_ACCOUNT_KEY_JSON
  );
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

function cloneItems(items = []) {
  return items.map((item) => ({ ...item }));
}

function getCollectionCacheTtlMs(name) {
  if (publicCollectionNames.has(name)) {
    return Number(process.env.CONTENT_PUBLIC_COLLECTION_CACHE_TTL_MS || 60000);
  }

  if (moderatedCollectionNames.has(name)) {
    return Number(process.env.CONTENT_MUTABLE_COLLECTION_CACHE_TTL_MS || 15000);
  }

  return DEFAULT_COLLECTION_CACHE_TTL_MS;
}

function getCachedCollection(name) {
  const entry = collectionCache.get(name);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    collectionCache.delete(name);
    return null;
  }

  return cloneItems(entry.items);
}

function setCachedCollection(name, items) {
  const ttlMs = getCollectionCacheTtlMs(name);

  if (ttlMs <= 0) {
    collectionCache.delete(name);
    return;
  }

  collectionCache.set(name, {
    expiresAt: Date.now() + ttlMs,
    items: cloneItems(items),
  });
}

function invalidateCollectionCache(name) {
  collectionCache.delete(name);
  pendingCollectionLoads.delete(name);
}

async function loadCollectionAndCache(name, loader) {
  const pendingLoad = pendingCollectionLoads.get(name);
  if (pendingLoad) {
    return cloneItems(await pendingLoad);
  }

  const loadPromise = (async () => {
    const items = await loader();
    setCachedCollection(name, items);
    return cloneItems(items);
  })();

  pendingCollectionLoads.set(name, loadPromise);

  try {
    return cloneItems(await loadPromise);
  } finally {
    pendingCollectionLoads.delete(name);
  }
}

function getDocumentIdCandidates(id) {
  const value = String(id || "").trim();

  if (!value) {
    return [];
  }

  const candidates = new Set([value]);
  candidates.add(value.replace(/__(\d+)$/, "_$1"));
  candidates.add(value.replace(/_(\d+)$/, "__$1"));

  return Array.from(candidates);
}

function parseAchievementClaimIdentity(id) {
  const value = String(id || "").trim();
  const match = value.match(/^(.*?)(?:__|_)(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    playerTagNormalized: match[1],
    achievementCode: Number(match[2]),
  };
}

function matchesAchievementClaimIdentity(item, identity) {
  if (!identity) {
    return false;
  }

  return (
    String(item.playerTagNormalized || "") === identity.playerTagNormalized &&
    Number(item.achievementCode || 0) === identity.achievementCode
  );
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

function parseServiceAccountKey() {
  const rawValue = process.env.YDB_SERVICE_ACCOUNT_KEY_JSON || "";
  let parsed = null;

  try {
    parsed = JSON.parse(rawValue || "{}");
  } catch {
    const error = new Error("YDB_SERVICE_ACCOUNT_KEY_JSON содержит невалидный JSON.");
    error.statusCode = 500;
    throw error;
  }

  if (!parsed?.id || !parsed?.service_account_id || !parsed?.private_key) {
    const error = new Error(
      "YDB_SERVICE_ACCOUNT_KEY_JSON не содержит обязательные поля id, service_account_id, private_key."
    );
    error.statusCode = 500;
    throw error;
  }

  return parsed;
}

function getYdbConnectionString() {
  const endpoint = String(process.env.YDB_ENDPOINT || "").trim().replace(/\/+$/, "");
  const database = String(process.env.YDB_DATABASE || "").trim();

  return `${endpoint}?database=${database}`;
}

async function getYdbSql() {
  if (!driverPromise) {
    driverPromise = (async () => {
      try {
        const keyData = parseServiceAccountKey();
        const credentialsProvider = new ServiceAccountCredentialsProvider(keyData);
        const driver = new Driver(getYdbConnectionString(), {
          credentialsProvider,
          "ydb.sdk.enable_discovery": false,
        });

        await driver.ready();

        return {
          driver,
          sql: query(driver),
        };
      } catch (error) {
        console.error("[content-store] ydb init failed", {
          endpoint: process.env.YDB_ENDPOINT || "",
          database: process.env.YDB_DATABASE || "",
          hasServiceAccountKeyJson: Boolean(process.env.YDB_SERVICE_ACCOUNT_KEY_JSON),
          message: error.message,
          stack: error.stack,
        });
        throw error;
      }
    })();
  }

  return driverPromise;
}

async function ensureYdbSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      try {
        const { sql } = await getYdbSql();

        await sql`
          CREATE TABLE IF NOT EXISTS ${sql.identifier(YDB_TABLE_NAME)} (
            collection_name Utf8 NOT NULL,
            id Utf8 NOT NULL,
            created_at Utf8,
            updated_at Utf8,
            data_json Utf8,
            PRIMARY KEY (collection_name, id)
          );
        `;
      } catch (error) {
        console.error("[content-store] schema ensure failed", {
          tableName: YDB_TABLE_NAME,
          message: error.message,
          stack: error.stack,
        });
        throw error;
      }
    })();
  }

  return schemaPromise;
}

async function listCollectionFromYdb(name) {
  await ensureYdbSchema();
  const { sql } = await getYdbSql();
  const [rows = []] = await sql`
    SELECT id, created_at, updated_at, data_json
    FROM ${sql.identifier(YDB_TABLE_NAME)}
    WHERE collection_name = ${name};
  `;

  return rows
    .map((row) => {
      const payload = JSON.parse(row.data_json || "{}");
      return {
        ...payload,
        id: payload.id || row.id,
        _storageId: row.id,
        createdAt: payload.createdAt || row.created_at || "",
        updatedAt: payload.updatedAt || row.updated_at || "",
      };
    })
    .sort(compareByCreatedAtDesc);
}

async function getDocumentByExactIdFromYdb(name, id) {
  const value = String(id || "").trim();

  if (!value) {
    return null;
  }

  await ensureYdbSchema();
  const { sql } = await getYdbSql();
  const [rows = []] = await sql`
    SELECT id, created_at, updated_at, data_json
    FROM ${sql.identifier(YDB_TABLE_NAME)}
    WHERE collection_name = ${name} AND id = ${value};
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  const payload = JSON.parse(row.data_json || "{}");
  return {
    ...payload,
    id: payload.id || row.id,
    _storageId: row.id,
    createdAt: payload.createdAt || row.created_at || "",
    updatedAt: payload.updatedAt || row.updated_at || "",
  };
}

async function getDocumentFromYdb(name, id) {
  const candidates = getDocumentIdCandidates(id);

  for (const candidateId of candidates) {
    const document = await getDocumentByExactIdFromYdb(name, candidateId);
    if (document) {
      return document;
    }
  }

  if (name === collectionNames.achievementClaims) {
    const identity = parseAchievementClaimIdentity(id);
    const items = await listCollectionFromYdb(name);
    return items.find((item) => matchesAchievementClaimIdentity(item, identity)) || null;
  }

  return null;
}

async function upsertDocumentToYdb(name, document) {
  await ensureYdbSchema();
  const { sql } = await getYdbSql();

  await sql`
    UPSERT INTO ${sql.identifier(YDB_TABLE_NAME)}
      (collection_name, id, created_at, updated_at, data_json)
    VALUES
      (
        ${name},
        ${document.id},
        ${document.createdAt},
        ${document.updatedAt},
        ${JSON.stringify(document)}
      );
  `;
}

async function deleteDocumentFromYdb(name, id) {
  await ensureYdbSchema();
  const { sql } = await getYdbSql();

  await sql`
    DELETE FROM ${sql.identifier(YDB_TABLE_NAME)}
    WHERE collection_name = ${name} AND id = ${id};
  `;
}

async function listCollectionFromFile(name) {
  const store = await readStore();
  return [...(store[name] || [])]
    .map((item) => ({
      ...item,
      _storageId: item._storageId || item.id,
    }))
    .sort(compareByCreatedAtDesc);
}

async function createDocumentInFile(name, payload) {
  const store = await readStore();
  const nowIso = new Date().toISOString();
  const document = {
    id: crypto.randomUUID(),
    ...payload,
    createdAt: normalizeTimestamp(payload.createdAt, nowIso),
    updatedAt: normalizeTimestamp(payload.updatedAt, nowIso),
  };

  document._storageId = document.id;

  store[name] = [...(store[name] || []), document];
  await writeStore(store);

  return document;
}

async function updateDocumentInFile(name, id, payload) {
  const store = await readStore();
  const items = store[name] || [];
  const candidates = getDocumentIdCandidates(id);
  let index = items.findIndex(
    (item) =>
      candidates.includes(String(item.id || "")) ||
      candidates.includes(String(item._storageId || ""))
  );

  if (index < 0 && name === collectionNames.achievementClaims) {
    const identity = parseAchievementClaimIdentity(id);
    index = items.findIndex((item) => matchesAchievementClaimIdentity(item, identity));
  }

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
    _storageId: current._storageId || current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  items[index] = next;
  store[name] = items;
  await writeStore(store);

  return next;
}

async function deleteDocumentFromFile(name, id) {
  const store = await readStore();
  const items = store[name] || [];
  const candidates = getDocumentIdCandidates(id);
  let nextItems = items.filter(
    (item) =>
      !candidates.includes(String(item.id || "")) &&
      !candidates.includes(String(item._storageId || ""))
  );

  if (nextItems.length === items.length && name === collectionNames.achievementClaims) {
    const identity = parseAchievementClaimIdentity(id);
    nextItems = items.filter((item) => !matchesAchievementClaimIdentity(item, identity));
  }

  if (nextItems.length === items.length) {
    const error = new Error("Документ не найден.");
    error.statusCode = 404;
    throw error;
  }

  store[name] = nextItems;
  await writeStore(store);
}

export async function listCollection(name) {
  assertCollection(name);
  const cachedItems = getCachedCollection(name);

  if (cachedItems) {
    return cachedItems;
  }

  return loadCollectionAndCache(
    name,
    isYdbConfigured()
      ? () => listCollectionFromYdb(name)
      : () => listCollectionFromFile(name)
  );
}

export async function getCollectionCount(name) {
  assertCollection(name);

  const cachedItems = getCachedCollection(name);
  if (cachedItems) {
    return cachedItems.length;
  }

  if (!isYdbConfigured()) {
    const items = await listCollectionFromFile(name);
    setCachedCollection(name, items);
    return items.length;
  }

  await ensureYdbSchema();
  const { sql } = await getYdbSql();
  const [rows = []] = await sql`
    SELECT COUNT(*) AS total
    FROM ${sql.identifier(YDB_TABLE_NAME)}
    WHERE collection_name = ${name};
  `;

  return Number(rows[0]?.total || 0);
}

export async function createDocument(name, payload) {
  assertCollection(name);

  if (!isYdbConfigured()) {
    const document = await createDocumentInFile(name, payload);
    invalidateCollectionCache(name);
    return document;
  }

  const nowIso = new Date().toISOString();
  const document = {
    id: crypto.randomUUID(),
    ...payload,
    createdAt: normalizeTimestamp(payload.createdAt, nowIso),
    updatedAt: normalizeTimestamp(payload.updatedAt, nowIso),
  };

  document._storageId = document.id;

  await upsertDocumentToYdb(name, document);
  invalidateCollectionCache(name);
  return document;
}

export async function updateDocument(name, id, payload) {
  assertCollection(name);

  if (!isYdbConfigured()) {
    const document = await updateDocumentInFile(name, id, payload);
    invalidateCollectionCache(name);
    return document;
  }

  const current = await getDocumentFromYdb(name, id);
  if (!current) {
    const error = new Error("Документ не найден.");
    error.statusCode = 404;
    throw error;
  }

  const next = {
    ...current,
    ...payload,
    id: current.id,
    _storageId: current._storageId || current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await upsertDocumentToYdb(name, next);
  invalidateCollectionCache(name);
  return next;
}

export async function deleteDocument(name, id) {
  assertCollection(name);

  if (!isYdbConfigured()) {
    await deleteDocumentFromFile(name, id);
    invalidateCollectionCache(name);
    return;
  }

  const current = await getDocumentFromYdb(name, id);
  if (!current) {
    const error = new Error("Документ не найден.");
    error.statusCode = 404;
    throw error;
  }

  await deleteDocumentFromYdb(name, current._storageId || current.id || id);
  invalidateCollectionCache(name);
}
