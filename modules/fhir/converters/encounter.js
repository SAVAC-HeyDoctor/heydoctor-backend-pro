"use strict";

/**
 * Strapi Appointment/Consultation <-> FHIR Encounter (R4)
 */
function strapiToFhir(strapiAppointment) {
  if (!strapiAppointment) return null;
  const id = strapiAppointment.id ?? strapiAppointment.attributes?.id;
  const attrs = strapiAppointment.attributes ?? strapiAppointment;
  const date = attrs.date ? new Date(attrs.date) : null;
  const duration = attrs.duration ?? 45;
  const endDate = date ? new Date(date.getTime() + duration * 60000) : null;
  const statusMap = { scheduled: "planned", in_progress: "in-progress", completed: "finished", cancelled: "cancelled", no_show: "cancelled" };
  const status = statusMap[attrs.status] || "planned";
  return {
    resourceType: "Encounter",
    id: String(id),
    meta: { profile: ["http://hl7.org/fhir/StructureDefinition/Encounter"] },
    status,
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
    type: [{ coding: [{ system: "http://snomed.info/sct", code: "185349003", display: "Encounter for check up" }] }],
    subject: attrs.patient?.id ? { reference: `Patient/${attrs.patient.id}` } : null,
    participant: attrs.doctor?.id
      ? [{ individual: { reference: `Practitioner/${attrs.doctor.id}` }, type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType", code: "PPRF" }] }] }]
      : [],
    period: date
      ? { start: date.toISOString(), end: endDate?.toISOString() }
      : null,
    reasonCode: attrs.appointment_reason ? [{ text: attrs.appointment_reason }] : [],
  };
}

function fhirToStrapi(fhirEncounter) {
  if (!fhirEncounter || fhirEncounter.resourceType !== "Encounter") return null;
  const statusMap = { planned: "scheduled", "in-progress": "in_progress", finished: "completed", cancelled: "cancelled" };
  const period = fhirEncounter.period;
  const start = period?.start ? new Date(period.start) : null;
  const end = period?.end ? new Date(period.end) : null;
  const duration = start && end ? Math.round((end - start) / 60000) : 45;
  return {
    date: start?.toISOString() || null,
    duration,
    status: statusMap[fhirEncounter.status] || "scheduled",
    appointment_reason: fhirEncounter.reasonCode?.[0]?.text || null,
  };
}

module.exports = { strapiToFhir, fhirToStrapi };
