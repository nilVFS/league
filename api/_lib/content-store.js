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
  achievementClaims: "achievementClaims",
};

const allowedCollections = new Set(Object.values(collectionNames));
const YDB_TABLE_NAME = "content_items";

const defaultStore = {
  clips: [],
  participants: [],
  awards: [],
  suggestions: [],
  achievementClaims: [],
};

let driverPromise = null;
let schemaPromise = null;

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
        createdAt: payload.createdAt || row.created_at || "",
        updatedAt: payload.updatedAt || row.updated_at || "",
      };
    })
    .sort(compareByCreatedAtDesc);
}

async function getDocumentFromYdb(name, id) {
  const items = await listCollectionFromYdb(name);
  return items.find((item) => item.id === id) || null;
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
  return [...(store[name] || [])].sort(compareByCreatedAtDesc);
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

  store[name] = [...(store[name] || []), document];
  await writeStore(store);

  return document;
}

async function updateDocumentInFile(name, id, payload) {
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

async function deleteDocumentFromFile(name, id) {
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

export async function listCollection(name) {
  assertCollection(name);
  if (isYdbConfigured()) {
    return listCollectionFromYdb(name);
  }

  return listCollectionFromFile(name);
}

export async function getCollectionCount(name) {
  assertCollection(name);
  const items = await listCollection(name);
  return items.length;
}

export async function createDocument(name, payload) {
  assertCollection(name);

  if (!isYdbConfigured()) {
    return createDocumentInFile(name, payload);
  }

  const nowIso = new Date().toISOString();
  const document = {
    id: crypto.randomUUID(),
    ...payload,
    createdAt: normalizeTimestamp(payload.createdAt, nowIso),
    updatedAt: normalizeTimestamp(payload.updatedAt, nowIso),
  };

  await upsertDocumentToYdb(name, document);
  return document;
}

export async function updateDocument(name, id, payload) {
  assertCollection(name);

  if (!isYdbConfigured()) {
    return updateDocumentInFile(name, id, payload);
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
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await upsertDocumentToYdb(name, next);
  return next;
}

export async function deleteDocument(name, id) {
  assertCollection(name);

  if (!isYdbConfigured()) {
    return deleteDocumentFromFile(name, id);
  }

  const current = await getDocumentFromYdb(name, id);
  if (!current) {
    const error = new Error("Документ не найден.");
    error.statusCode = 404;
    throw error;
  }

  await deleteDocumentFromYdb(name, id);
}
