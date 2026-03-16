"use strict";

/**
 * Strapi Medication / Treatment <-> FHIR MedicationRequest (R4)
 */
function strapiToFhir(strapiMedication, patientId, encounterId) {
  if (!strapiMedication) return null;
  const id = strapiMedication.id ?? strapiMedication.attributes?.id;
  const attrs = strapiMedication.attributes ?? strapiMedication;
  const name = attrs.name ?? "";
  return {
    resourceType: "MedicationRequest",
    id: String(id),
    meta: { profile: ["http://hl7.org/fhir/StructureDefinition/MedicationRequest"] },
    status: "active",
    intent: "order",
    medicationCodeableConcept: { text: name },
    subject: patientId ? { reference: `Patient/${patientId}` } : null,
    encounter: encounterId ? { reference: `Encounter/${encounterId}` } : null,
    authoredOn: attrs.createdAt ? new Date(attrs.createdAt).toISOString() : new Date().toISOString(),
  };
}

function treatmentToFhir(strapiTreatment, patientId, encounterId) {
  if (!strapiTreatment) return null;
  const id = strapiTreatment.id ?? strapiTreatment.attributes?.id;
  const attrs = strapiTreatment.attributes ?? strapiTreatment;
  const name = attrs.name ?? "";
  return {
    resourceType: "MedicationRequest",
    id: `trt-${id}`,
    meta: { profile: ["http://hl7.org/fhir/StructureDefinition/MedicationRequest"] },
    status: "active",
    intent: "order",
    medicationCodeableConcept: { text: name },
    subject: patientId ? { reference: `Patient/${patientId}` } : null,
    encounter: encounterId ? { reference: `Encounter/${encounterId}` } : null,
  };
}

function fhirToStrapi(fhirMedicationRequest) {
  if (!fhirMedicationRequest || fhirMedicationRequest.resourceType !== "MedicationRequest") return null;
  const med = fhirMedicationRequest.medicationCodeableConcept ?? fhirMedicationRequest.medicationReference;
  return {
    name: med?.text ?? med?.display ?? "",
  };
}

module.exports = { strapiToFhir: strapiToFhir, treatmentToFhir, fhirToStrapi };
