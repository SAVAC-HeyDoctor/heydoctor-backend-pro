"use strict";

const search = require("./index");

async function setupIndexes(strapi) {
  if (!search.isEnabled()) return;

  const c = search.getClient();
  if (!c) return;

  try {
    await search.ensureIndex(search.INDEX_NAMES.patients, ["clinic_id"]);
    await search.ensureIndex(search.INDEX_NAMES.doctors, ["clinic_id", "clinic_ids"]);
    await search.ensureIndex(search.INDEX_NAMES.diagnostics, ["clinic_id"]);
    strapi?.log?.info?.("Search: Meilisearch indexes configured (patients, doctors, diagnostics)");
  } catch (err) {
    strapi?.log?.warn?.("Search: index setup failed", err?.message);
  }
}

module.exports = { setupIndexes };
