"use strict";

/**
 * ClickHouse storage para Medical Knowledge Graph.
 * Tabla: medical_graph_edges
 */
const analytics = require("../analytics");

const TABLE_NAME = "medical_graph_edges";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
  source_node String,
  target_node String,
  relationship_type String,
  weight Float64,
  clinic_id Nullable(UInt64),
  timestamp DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (clinic_id, relationship_type, source_node, target_node)
`;

async function ensureTable() {
  const c = analytics.getClient();
  if (!c) return false;
  try {
    await c.command({ query: CREATE_TABLE_SQL });
    return true;
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Knowledge graph: create table failed", err?.message);
    return false;
  }
}

async function insertEdges(edges) {
  const c = analytics.getClient();
  if (!c || !edges?.length) return 0;

  const now = new Date().toISOString();
  const rows = edges.map((e) => ({
    source_node: String(e.source_node ?? ""),
    target_node: String(e.target_node ?? ""),
    relationship_type: String(e.relationship_type ?? ""),
    weight: Number(e.weight ?? 0),
    clinic_id: e.clinic_id != null ? Number(e.clinic_id) : null,
    timestamp: e.timestamp ?? now,
  }));

  try {
    await c.insert({
      table: TABLE_NAME,
      values: rows,
      format: "JSONEachRow",
    });
    return rows.length;
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.error("Knowledge graph: insert failed", err?.message);
    throw err;
  }
}

async function clearEdges(clinicId = null) {
  const c = analytics.getClient();
  if (!c) return;
  try {
    if (clinicId != null) {
      await c.command({ query: `ALTER TABLE ${TABLE_NAME} DELETE WHERE clinic_id = ${Number(clinicId)}` });
    } else {
      await c.command({ query: `TRUNCATE TABLE ${TABLE_NAME}` });
    }
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Knowledge graph: clear failed", err?.message);
  }
}

async function queryEdges(options = {}) {
  const c = analytics.getClient();
  if (!c) return [];

  const { sourceNode, targetNode, relationshipType, clinicId, limit = 100 } = options;
  const conditions = [];
  if (sourceNode) conditions.push(`source_node = '${String(sourceNode).replace(/'/g, "''")}'`);
  if (targetNode) conditions.push(`target_node = '${String(targetNode).replace(/'/g, "''")}'`);
  if (relationshipType) conditions.push(`relationship_type = '${String(relationshipType).replace(/'/g, "''")}'`);
  if (clinicId != null) conditions.push(`clinic_id = ${Number(clinicId)}`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const q = `SELECT source_node, target_node, relationship_type, weight, clinic_id
    FROM ${TABLE_NAME} ${where}
    ORDER BY weight DESC
    LIMIT ${Math.min(limit, 500)}`;

  try {
    const result = await c.query({ query: q, format: "JSONEachRow" });
    const rows = await result.json();
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Knowledge graph: query failed", err?.message);
    return [];
  }
}

async function aggregateByTarget(sourceNodes, relationshipType, clinicId = null, limit = 20) {
  const c = analytics.getClient();
  if (!c || !sourceNodes?.length) return [];

  const escaped = sourceNodes.map((n) => `'${String(n).replace(/'/g, "''")}'`).join(",");
  const clinicFilter = clinicId != null ? `AND clinic_id = ${Number(clinicId)}` : "";
  const q = `SELECT target_node, sum(weight) as total_weight
    FROM ${TABLE_NAME}
    WHERE source_node IN (${escaped}) AND relationship_type = '${String(relationshipType).replace(/'/g, "''")}' ${clinicFilter}
    GROUP BY target_node
    ORDER BY total_weight DESC
    LIMIT ${Math.min(limit, 50)}`;

  try {
    const result = await c.query({ query: q, format: "JSONEachRow" });
    const rows = await result.json();
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Knowledge graph: aggregate failed", err?.message);
    return [];
  }
}

module.exports = {
  TABLE_NAME,
  ensureTable,
  insertEdges,
  clearEdges,
  queryEdges,
  aggregateByTarget,
};
