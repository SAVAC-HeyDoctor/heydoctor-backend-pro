"use strict";

/**
 * Medical Knowledge Graph - grafo de conocimiento médico basado en datos agregados.
 * Nodos: symptom, diagnosis, treatment
 * Relaciones: symptom_diagnosis, diagnosis_treatment, symptom_treatment, diagnosis_diagnosis
 */
const kgClickhouse = require("./clickhouse");
const analytics = require("../analytics");

const REL = {
  SYMPTOM_DIAGNOSIS: "symptom_diagnosis",
  DIAGNOSIS_TREATMENT: "diagnosis_treatment",
  SYMPTOM_TREATMENT: "symptom_treatment",
  DIAGNOSIS_DIAGNOSIS: "diagnosis_diagnosis",
};

function isEnabled() {
  return analytics.isEnabled();
}

/**
 * Extrae términos de síntomas desde admission_reason y observations.
 */
function extractSymptomTerms(admissionReason, observations) {
  const text = [admissionReason, observations].filter(Boolean).join(" ");
  if (!text.trim()) return [];
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  return [...new Set(terms)].map((t) => `symptom:${t}`);
}

/**
 * Construye el grafo desde datos clínicos agregados.
 */
async function buildKnowledgeGraph(options = {}) {
  if (!isEnabled() || !global.strapi) return { edges: 0, error: "Not configured" };

  await kgClickhouse.ensureTable();
  if (options.clear !== false) await kgClickhouse.clearEdges(options.clinicId);

  const strapi = global.strapi;
  const clinicId = options.clinicId ?? null;
  const filters = clinicId ? { clinic: clinicId } : {};

  const records = await strapi.db.query("api::clinical-record.clinical-record").findMany({
    where: filters,
    select: ["id", "admission_reason", "observations", "clinic"],
    populate: { diagnostics: { populate: ["cie_10_code"] }, treatments: true },
    limit: 5000,
  });

  const edges = [];

  for (const rec of records || []) {
    const recClinicId = rec.clinic?.id ?? rec.clinic ?? clinicId;
    const symptomTerms = extractSymptomTerms(rec.admission_reason, rec.observations);

    const diagnostics = rec.diagnostics ?? [];
    const diagNodes = [];
    for (const d of diagnostics) {
      const diag = typeof d === "object" && d !== null ? d : await strapi.entityService.findOne("api::diagnostic.diagnostic", d, { populate: ["cie_10_code"] });
      let cie = diag?.cie_10_code;
      if (cie != null && !cie.code) {
        const cieId = typeof cie === "object" ? cie.id ?? cie : cie;
        cie = await strapi.entityService.findOne("api::cie-10-code.cie-10-code", cieId);
      }
      const code = cie?.code ?? "";
      if (!code) continue;
      const node = `diagnosis:${code}`;
      diagNodes.push(node);

      for (const sym of symptomTerms) {
        edges.push({ source_node: sym, target_node: node, relationship_type: REL.SYMPTOM_DIAGNOSIS, weight: 1, clinic_id: recClinicId });
      }

      for (const other of diagNodes) {
        if (other !== node) {
          edges.push({ source_node: node, target_node: other, relationship_type: REL.DIAGNOSIS_DIAGNOSIS, weight: 1, clinic_id: recClinicId });
        }
      }
    }

    const treatments = rec.treatments ?? [];
    for (const t of treatments) {
      const treat = typeof t === "object" && t !== null ? t : await strapi.entityService.findOne("api::treatment.treatment", t);
      const name = (treat?.name || "").trim();
      if (!name) continue;
      const treatNode = `treatment:${name.toLowerCase().replace(/\s+/g, "_")}`;

      for (const sym of symptomTerms) {
        edges.push({ source_node: sym, target_node: treatNode, relationship_type: REL.SYMPTOM_TREATMENT, weight: 1, clinic_id: recClinicId });
      }

      for (const diagNode of diagNodes) {
        edges.push({ source_node: diagNode, target_node: treatNode, relationship_type: REL.DIAGNOSIS_TREATMENT, weight: 1, clinic_id: recClinicId });
      }
    }
  }

  const uniqueEdges = aggregateEdgeWeights(edges);
  if (uniqueEdges.length > 0) {
    await kgClickhouse.insertEdges(uniqueEdges);
  }

  return { edges: uniqueEdges.length };
}

function aggregateEdgeWeights(edges) {
  const byKey = {};
  for (const e of edges) {
    const key = `${e.source_node}|${e.target_node}|${e.relationship_type}|${e.clinic_id ?? "null"}`;
    if (!byKey[key]) byKey[key] = { ...e, weight: 0 };
    byKey[key].weight += e.weight;
  }
  return Object.values(byKey);
}

/**
 * Actualiza el grafo (rebuild para una clínica o completo).
 */
async function updateKnowledgeGraph(options = {}) {
  return buildKnowledgeGraph({ ...options, clear: true });
}

/**
 * Consulta el grafo: dado síntomas, devuelve diagnósticos, tratamientos y condiciones relacionadas.
 */
async function queryKnowledgeGraph(symptoms, clinicId = null, options = {}) {
  if (!isEnabled()) return { diagnoses: [], treatments: [], related_conditions: [] };

  const terms = (symptoms || "")
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .map((t) => `symptom:${t}`);

  if (terms.length === 0) return { diagnoses: [], treatments: [], related_conditions: [] };

  const limit = options.limit ?? 15;

  const [diagRows, treatRows, relatedRows] = await Promise.all([
    kgClickhouse.aggregateByTarget(terms, REL.SYMPTOM_DIAGNOSIS, clinicId, limit),
    kgClickhouse.aggregateByTarget(terms, REL.SYMPTOM_TREATMENT, clinicId, limit),
    getRelatedConditions(terms, clinicId, limit),
  ]);

  const diagnoses = diagRows.map((r) => ({
    code: r.target_node?.replace("diagnosis:", "") ?? "",
    weight: Number(r.total_weight ?? 0),
  }));

  const treatments = treatRows.map((r) => ({
    name: (r.target_node?.replace("treatment:", "") ?? "").replace(/_/g, " "),
    weight: Number(r.total_weight ?? 0),
  }));

  const related_conditions = relatedRows;

  return { diagnoses, treatments, related_conditions };
}

async function getRelatedConditions(symptomNodes, clinicId, limit) {
  const diagRows = await kgClickhouse.aggregateByTarget(symptomNodes, REL.SYMPTOM_DIAGNOSIS, clinicId, limit * 2);
  const diagCodes = diagRows.map((r) => r.target_node).filter(Boolean);
  if (diagCodes.length === 0) return [];

  const c = analytics.getClient();
  if (!c) return [];

  const escaped = diagCodes.map((n) => `'${String(n).replace(/'/g, "''")}'`).join(",");
  const clinicFilter = clinicId != null ? `AND clinic_id = ${Number(clinicId)}` : "";
  const q = `SELECT target_node, sum(weight) as total_weight
    FROM ${kgClickhouse.TABLE_NAME}
    WHERE source_node IN (${escaped}) AND relationship_type = '${REL.DIAGNOSIS_DIAGNOSIS}' ${clinicFilter}
    GROUP BY target_node
    ORDER BY total_weight DESC
    LIMIT ${limit}`;

  try {
    const result = await c.query({ query: q, format: "JSONEachRow" });
    const rows = await result.json();
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      code: (r.target_node ?? "").replace("diagnosis:", ""),
      weight: Number(r.total_weight ?? 0),
    }));
  } catch {
    return [];
  }
}

/**
 * Enriquecer sugerencias de Clinical Intelligence con datos del knowledge graph.
 */
async function enrichClinicalSuggestions(symptoms, clinicId, baseSuggestions = {}) {
  if (!isEnabled()) return baseSuggestions;

  const kgResult = await queryKnowledgeGraph(symptoms, clinicId, { limit: 10 });
  const kgDiagnoses = kgResult.diagnoses || [];
  const kgTreatments = kgResult.treatments || [];
  const kgRelated = kgResult.related_conditions || [];

  const existingCodes = new Set((baseSuggestions.suggested_diagnoses || []).map((d) => d.code));
  const existingTreatments = new Set((baseSuggestions.suggested_treatments || []).map((t) => String(t.name || "").toLowerCase()));

  const newCodes = kgDiagnoses.filter((d) => d.code && !existingCodes.has(d.code)).map((d) => d.code);
  let codeToDesc = {};
  if (newCodes.length > 0 && global.strapi) {
    const cieCodes = await global.strapi.db.query("api::cie-10-code.cie-10-code").findMany({
      where: { code: { $in: newCodes } },
      select: ["code", "description"],
    });
    for (const c of cieCodes || []) codeToDesc[c.code] = c.description ?? "";
  }

  for (const d of kgDiagnoses) {
    if (d.code && !existingCodes.has(d.code)) {
      baseSuggestions.suggested_diagnoses = baseSuggestions.suggested_diagnoses || [];
      baseSuggestions.suggested_diagnoses.push({
        code: d.code,
        description: codeToDesc[d.code] ?? "",
        frequency: d.weight,
        source: "knowledge_graph",
      });
      existingCodes.add(d.code);
    }
  }

  for (const t of kgTreatments) {
    const name = (t.name || "").trim().replace(/_/g, " ");
    const key = name.toLowerCase();
    if (name && !existingTreatments.has(key)) {
      baseSuggestions.suggested_treatments = baseSuggestions.suggested_treatments || [];
      baseSuggestions.suggested_treatments.push({ name, frequency: t.weight, source: "knowledge_graph" });
      existingTreatments.add(key);
    }
  }

  if (kgRelated.length > 0) {
    baseSuggestions.related_conditions = kgRelated.map((r) => ({ code: r.code, weight: r.weight }));
  }

  return baseSuggestions;
}

module.exports = {
  isEnabled,
  buildKnowledgeGraph,
  updateKnowledgeGraph,
  queryKnowledgeGraph,
  enrichClinicalSuggestions,
  REL,
};
