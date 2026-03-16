"use strict";

/**
 * Strapi Clinical Record / Diagnostic <-> FHIR Observation (R4)
 */
function clinicalRecordToObservation(strapiRecord, patientId) {
  if (!strapiRecord) return null;
  const id = strapiRecord.id ?? strapiRecord.attributes?.id;
  const attrs = strapiRecord.attributes ?? strapiRecord;
  const parts = [];
  if (attrs.admission_reason) parts.push({ code: "admission_reason", value: attrs.admission_reason });
  if (attrs.observations) parts.push({ code: "observations", value: attrs.observations });
  if (attrs.clinical_judgement) parts.push({ code: "clinical_judgement", value: attrs.clinical_judgement });
  if (attrs.personal_background) parts.push({ code: "personal_background", value: attrs.personal_background });
  if (attrs.family_background) parts.push({ code: "family_background", value: attrs.family_background });
  if (attrs.allergies) parts.push({ code: "allergies", value: attrs.allergies });
  if (parts.length === 0) return null;
  const value = parts.map((p) => `${p.code}: ${p.value}`).join(" | ");
  return {
    resourceType: "Observation",
    id: String(id),
    meta: { profile: ["http://hl7.org/fhir/StructureDefinition/Observation"] },
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "34117-2", display: "History of illness" }] },
    subject: patientId ? { reference: `Patient/${patientId}` } : null,
    effectiveDateTime: attrs.date ? new Date(attrs.date).toISOString() : new Date().toISOString(),
    valueString: value,
  };
}

function diagnosticToObservation(strapiDiagnostic, patientId) {
  if (!strapiDiagnostic) return null;
  const id = strapiDiagnostic.id ?? strapiDiagnostic.attributes?.id;
  const attrs = strapiDiagnostic.attributes ?? strapiDiagnostic;
  const cie = attrs.cie_10_code ?? attrs.attributes?.cie_10_code ?? {};
  const code = cie.code ?? "";
  const description = cie.description ?? "";
  return {
    resourceType: "Observation",
    id: `diag-${id}`,
    meta: { profile: ["http://hl7.org/fhir/StructureDefinition/Observation"] },
    status: "final",
    code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code, display: description }] },
    subject: patientId ? { reference: `Patient/${patientId}` } : null,
    effectiveDateTime: attrs.diagnostic_date ? new Date(attrs.diagnostic_date).toISOString() : new Date().toISOString(),
    valueString: `${code} - ${description}`,
  };
}

function fhirToStrapi(fhirObservation) {
  if (!fhirObservation || fhirObservation.resourceType !== "Observation") return null;
  return {
    observations: fhirObservation.valueString || null,
    date: fhirObservation.effectiveDateTime ? new Date(fhirObservation.effectiveDateTime).toISOString().slice(0, 10) : null,
  };
}

module.exports = { clinicalRecordToObservation, diagnosticToObservation, fhirToStrapi };
