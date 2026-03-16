"use strict";

/**
 * FHIR Interoperability Layer - R4 JSON.
 * Conversores Strapi <-> FHIR para Patient, Practitioner, Encounter, Observation, MedicationRequest.
 */
const patientConv = require("./converters/patient");
const practitionerConv = require("./converters/practitioner");
const encounterConv = require("./converters/encounter");
const observationConv = require("./converters/observation");
const medicationConv = require("./converters/medication-request");

module.exports = {
  patient: patientConv,
  practitioner: practitionerConv,
  encounter: encounterConv,
  observation: observationConv,
  medicationRequest: medicationConv,
};
