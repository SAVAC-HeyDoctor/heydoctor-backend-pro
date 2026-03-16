"use strict";

const fhir = require("../../../../modules/fhir");
const { ensureClinicAccess } = require("../../../utils/tenant-scope");

module.exports = {
  async patient(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const { id } = ctx.params;
    const strapi = global.strapi;
    if (!strapi) return ctx.internalServerError("Servicio no disponible");

    const entity = await strapi.entityService.findOne("api::patient.patient", id, { populate: ["clinic"] });
    if (!entity) return ctx.notFound("Paciente no encontrado");
    if (!ensureClinicAccess(ctx, entity)) return ctx.forbidden("No tiene acceso a este paciente");

    const fhirResource = fhir.patient.strapiToFhir(entity);
    return ctx.send(fhirResource);
  },

  async encounter(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const { id } = ctx.params;
    const strapi = global.strapi;
    if (!strapi) return ctx.internalServerError("Servicio no disponible");

    const entity = await strapi.entityService.findOne("api::appointment.appointment", id, {
      populate: ["patient", "doctor", "clinic"],
    });
    if (!entity) return ctx.notFound("Consulta no encontrada");
    if (!ensureClinicAccess(ctx, entity)) return ctx.forbidden("No tiene acceso a esta consulta");

    const fhirResource = fhir.encounter.strapiToFhir(entity);
    return ctx.send(fhirResource);
  },

  async observation(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const { id } = ctx.params;
    const type = ctx.query?.type || "clinical_record";
    const strapi = global.strapi;
    if (!strapi) return ctx.internalServerError("Servicio no disponible");

    if (type === "clinical_record") {
      const entity = await strapi.entityService.findOne("api::clinical-record.clinical-record", id, {
        populate: ["patient", "clinic"],
      });
      if (!entity) return ctx.notFound("Registro clínico no encontrado");
      if (!ensureClinicAccess(ctx, entity)) return ctx.forbidden("No tiene acceso");
      const patientId = entity.patient?.id ?? entity.patient;
      const fhirResource = fhir.observation.clinicalRecordToObservation(entity, patientId);
      return ctx.send(fhirResource);
    }

    if (type === "diagnostic") {
      const entity = await strapi.entityService.findOne("api::diagnostic.diagnostic", id, {
        populate: ["patient", "cie_10_code", "clinic"],
      });
      if (!entity) return ctx.notFound("Diagnóstico no encontrado");
      if (!ensureClinicAccess(ctx, entity)) return ctx.forbidden("No tiene acceso");
      const patientId = entity.patient?.id ?? entity.patient;
      const fhirResource = fhir.observation.diagnosticToObservation(entity, patientId);
      return ctx.send(fhirResource);
    }

    return ctx.badRequest("type debe ser clinical_record o diagnostic");
  },
};
