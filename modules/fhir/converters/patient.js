"use strict";

/**
 * Strapi Patient <-> FHIR Patient (R4)
 */
const FHIR_BASE = "https://heydoctor.example/fhir";

function strapiToFhir(strapiPatient) {
  if (!strapiPatient) return null;
  const id = strapiPatient.id ?? strapiPatient.attributes?.id;
  const attrs = strapiPatient.attributes ?? strapiPatient;
  const name = [attrs.firstname, attrs.lastname].filter(Boolean).join(" ");
  return {
    resourceType: "Patient",
    id: String(id),
    meta: { profile: ["http://hl7.org/fhir/StructureDefinition/Patient"] },
    identifier: attrs.identification
      ? [{ use: "official", value: attrs.identification, type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: attrs.identification_type || "NN" }] } }]
      : [],
    name: [{ use: "official", family: attrs.lastname || "", given: (attrs.firstname || "").split(" ") }],
    gender: attrs.gender === "M" ? "male" : attrs.gender === "F" ? "female" : "unknown",
    birthDate: attrs.birth_date || null,
    telecom: attrs.phone ? [{ system: "phone", value: attrs.phone }] : [],
    address: attrs.city || attrs.province ? [{ city: attrs.city, state: attrs.province }] : [],
  };
}

function fhirToStrapi(fhirPatient) {
  if (!fhirPatient || fhirPatient.resourceType !== "Patient") return null;
  const name = fhirPatient.name?.[0];
  const given = name?.given?.join(" ") || "";
  const family = name?.family || "";
  const telecom = fhirPatient.telecom?.[0];
  return {
    firstname: given || family,
    lastname: family || given,
    identification: fhirPatient.identifier?.[0]?.value || "",
    identification_type: "id card",
    gender: fhirPatient.gender === "male" ? "M" : fhirPatient.gender === "female" ? "F" : "Other",
    birth_date: fhirPatient.birthDate || null,
    phone: telecom?.value || null,
    city: fhirPatient.address?.[0]?.city || null,
    province: fhirPatient.address?.[0]?.state || null,
  };
}

module.exports = { strapiToFhir, fhirToStrapi };
