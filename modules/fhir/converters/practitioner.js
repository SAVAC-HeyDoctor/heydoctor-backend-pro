"use strict";

/**
 * Strapi Doctor <-> FHIR Practitioner (R4)
 */
function strapiToFhir(strapiDoctor) {
  if (!strapiDoctor) return null;
  const id = strapiDoctor.id ?? strapiDoctor.attributes?.id;
  const attrs = strapiDoctor.attributes ?? strapiDoctor;
  const name = [attrs.firstname, attrs.lastname].filter(Boolean).join(" ");
  return {
    resourceType: "Practitioner",
    id: String(id),
    meta: { profile: ["http://hl7.org/fhir/StructureDefinition/Practitioner"] },
    identifier: attrs.registration_number
      ? [{ use: "official", value: attrs.registration_number, system: attrs.registration_issuer ? `urn:issuer:${attrs.registration_issuer}` : undefined }]
      : [],
    name: [{ use: "official", family: attrs.lastname || "", given: (attrs.firstname || "").split(" ") }],
    qualification: attrs.specialty_profiles?.length
      ? attrs.specialty_profiles.map((s) => ({
          code: { coding: [{ system: "http://snomed.info/sct", display: s.specialty || s }] },
        }))
      : [],
  };
}

function fhirToStrapi(fhirPractitioner) {
  if (!fhirPractitioner || fhirPractitioner.resourceType !== "Practitioner") return null;
  const name = fhirPractitioner.name?.[0];
  return {
    firstname: name?.given?.join(" ") || "",
    lastname: name?.family || "",
    registration_number: fhirPractitioner.identifier?.[0]?.value || null,
    registration_issuer: fhirPractitioner.identifier?.[0]?.system?.replace("urn:issuer:", "") || null,
  };
}

module.exports = { strapiToFhir, fhirToStrapi };
