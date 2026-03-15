"use strict";

/**
 * Módulo de búsqueda con Meilisearch.
 * Si MEILI_HOST no está definido, búsqueda avanzada desactivada.
 */
const MEILI_HOST = process.env.MEILI_HOST;
const MEILI_API_KEY = process.env.MEILI_API_KEY || "";

let client = null;

function isEnabled() {
  return !!MEILI_HOST;
}

function getClient() {
  if (!isEnabled()) return null;
  if (client) return client;
  try {
    const { MeiliSearch } = require("meilisearch");
    client = new MeiliSearch({
      host: MEILI_HOST,
      apiKey: MEILI_API_KEY,
    });
    return client;
  } catch (err) {
    return null;
  }
}

const INDEX_NAMES = {
  patients: "patients",
  doctors: "doctors",
  diagnostics: "diagnostics",
};

async function ensureIndex(indexName, filterableAttributes) {
  const c = getClient();
  if (!c) return null;
  try {
    const index = c.index(indexName);
    await index.updateFilterableAttributes(filterableAttributes);
    return index;
  } catch (err) {
    return null;
  }
}

async function indexDocument(indexName, document) {
  const c = getClient();
  if (!c) return;
  try {
    const index = c.index(indexName);
    await index.addDocuments([document]);
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Meilisearch index error:", err?.message);
  }
}

async function updateDocument(indexName, document) {
  return indexDocument(indexName, document);
}

async function deleteDocument(indexName, id) {
  const c = getClient();
  if (!c) return;
  try {
    const index = c.index(indexName);
    await index.deleteDocument(String(id));
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Meilisearch delete error:", err?.message);
  }
}

async function search(indexName, q, filters = {}) {
  const c = getClient();
  if (!c) return null;
  try {
    const index = c.index(indexName);
    const filterParts = Object.entries(filters)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
    const filterStr = filterParts.length ? filterParts.join(" AND ") : undefined;
    const result = await index.search(q || "", { filter: filterStr });
    return result;
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Meilisearch search error:", err?.message);
    return null;
  }
}

module.exports = {
  isEnabled,
  getClient,
  INDEX_NAMES,
  ensureIndex,
  indexDocument,
  updateDocument,
  deleteDocument,
  search,
};
