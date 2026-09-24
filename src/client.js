import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const OPENFGA_URL = process.env.OPENFGA_API_URL || "http://localhost:8088";

let cachedStoreId = null;

export function setStoreId(id) {
  cachedStoreId = id;
  try {
    writeFileSync(".store_id", id, "utf-8");
  } catch {}
}

/**
 * Получает Store ID (из env, .store_id, API или создает новый)
 */
export async function getStoreId() {
  if (process.env.OPENFGA_STORE_ID) return process.env.OPENFGA_STORE_ID;
  if (cachedStoreId) return cachedStoreId;

  if (existsSync(".store_id")) {
    const saved = readFileSync(".store_id", "utf-8").trim();
    if (saved) {
      cachedStoreId = saved;
      return cachedStoreId;
    }
  }

  try {
    const res = await fetch(`${OPENFGA_URL}/stores`);
    if (res.ok) {
      const data = await res.json();
      if (data.stores && data.stores.length > 0) {
        cachedStoreId = data.stores[data.stores.length - 1].id;
        setStoreId(cachedStoreId);
        return cachedStoreId;
      }
    }
  } catch (err) {
    throw new Error(`OpenFGA недоступен на ${OPENFGA_URL}. Убедитесь, что запущен docker: docker compose up -d`);
  }

  // Создаем store если нет
  const createRes = await fetch(`${OPENFGA_URL}/stores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "kalifga" })
  });
  const newStore = await createRes.json();
  cachedStoreId = newStore.id;
  setStoreId(cachedStoreId);
  return cachedStoreId;
}

/**
 * Создает новое чистое хранилище
 */
export async function createFreshStore(name = "kalifga") {
  const res = await fetch(`${OPENFGA_URL}/stores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  const store = await res.json();
  setStoreId(store.id);
  return store.id;
}

/**
 * Проверка права доступа (Check)
 * @returns {Promise<boolean>}
 */
export async function check(user, relation, object, contextualTuples = null) {
  const storeId = await getStoreId();
  const payload = {
    tuple_key: { user, relation, object }
  };
  const ctxKeys = Array.isArray(contextualTuples)
    ? contextualTuples
    : (contextualTuples && Array.isArray(contextualTuples.tuple_keys) ? contextualTuples.tuple_keys : null);
  if (ctxKeys && ctxKeys.length > 0) {
    payload.contextual_tuples = { tuple_keys: ctxKeys };
  }
  const res = await fetch(`${OPENFGA_URL}/stores/${storeId}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ошибка check: ${errText}`);
  }
  const data = await res.json();
  return Boolean(data.allowed);
}

/**
 * Пакетная проверка пачки прав за один запрос (Batch Check)
 */
export async function batchCheck(checks) {
  const storeId = await getStoreId();
  const res = await fetch(`${OPENFGA_URL}/stores/${storeId}/batch-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checks })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ошибка batchCheck: ${errText}`);
  }
  const data = await res.json();
  return data.result || {};
}

/**
 * Получение массива объектов (ListObjects)
 * @returns {Promise<string[]>} массив ID объектов
 */
export async function listObjects(user, relation, type) {
  const storeId = await getStoreId();
  const res = await fetch(`${OPENFGA_URL}/stores/${storeId}/list-objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, relation, type })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ошибка listObjects: ${errText}`);
  }
  const data = await res.json();
  const objects = data.objects || [];
  return objects.map(o => o.includes(":") ? o.split(":")[1] : o).sort();
}

/**
 * Получение массива пользователей (ListUsers)
 * @returns {Promise<string[]>} массив ID пользователей
 */
export async function listUsers(objectStr, relation, userType) {
  const storeId = await getStoreId();
  const [objType, objId] = objectStr.includes(":") ? objectStr.split(":") : ["", objectStr];
  
  const res = await fetch(`${OPENFGA_URL}/stores/${storeId}/list-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object: { type: objType, id: objId },
      relation,
      user_filters: [{ type: userType }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ошибка listUsers: ${errText}`);
  }
  const data = await res.json();
  const users = data.users || [];
  return users
    .map(u => u.object?.id || (typeof u === "string" ? u.split(":")[1] : ""))
    .filter(Boolean)
    .sort();
}

/**
 * Запись кортежей пакетами по 100 (для импорта и массовой синхронизации)
 */
export async function writeTuples(tuples, targetStoreId = null) {
  const storeId = targetStoreId || await getStoreId();
  const batchSize = 100;
  let totalWritten = 0;

  for (let i = 0; i < tuples.length; i += batchSize) {
    const batch = tuples.slice(i, i + batchSize);
    const res = await fetch(`${OPENFGA_URL}/stores/${storeId}/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        writes: {
          tuple_keys: batch
        }
      })
    });
    if (!res.ok) {
      const err = await res.text();
      if (!err.includes("cannot write a tuple which already exists")) {
        console.warn(`Предупреждение при записи батча ${i}:`, err);
      }
    }
    totalWritten += batch.length;
  }
  return totalWritten;
}

/**
 * Чтение кортежей из OpenFGA (Read API)
 * @param {object|null} tupleKey { user, relation, object }
 * @param {number} pageSize
 * @param {string} continuationToken
 */
export async function readTuples(tupleKey = null, pageSize = 50, continuationToken = "") {
  const storeId = await getStoreId();
  const payload = {};
  if (tupleKey && (tupleKey.user || tupleKey.relation || tupleKey.object)) {
    payload.tuple_key = tupleKey;
  }
  if (pageSize) payload.page_size = pageSize;
  if (continuationToken) payload.continuation_token = continuationToken;

  const res = await fetch(`${OPENFGA_URL}/stores/${storeId}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ошибка read: ${errText}`);
  }
  return await res.json();
}

/**
 * Произвольная запись и удаление кортежей (Write API)
 * @param {Array} writes Массив объектов { user, relation, object }
 * @param {Array} deletes Массив объектов { user, relation, object }
 */
export async function write(writes = [], deletes = []) {
  const storeId = await getStoreId();
  const payload = {};
  if (writes && writes.length > 0) {
    payload.writes = { tuple_keys: writes };
  }
  if (deletes && deletes.length > 0) {
    payload.deletes = { tuple_keys: deletes };
  }

  const res = await fetch(`${OPENFGA_URL}/stores/${storeId}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ошибка write: ${errText}`);
  }
  return { success: true };
}

/**
 * Загрузка модели из model.fga
 */
export async function uploadModel(modelFilePath = "./model.fga", targetStoreId = null) {
  const storeId = targetStoreId || await getStoreId();
  const absPath = resolve(modelFilePath);
  try {
    const out = execSync(`fga model write --store-id=${storeId} --file="${absPath}" --api-url=${OPENFGA_URL}`, {
      encoding: "utf-8"
    });
    const parsed = JSON.parse(out.trim());
    return parsed.authorization_model_id;
  } catch (err) {
    console.error("Ошибка загрузки модели через fga CLI:", err.message);
    return null;
  }
}

