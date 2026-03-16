"use strict";

const { syncDiagnostic } = require("../../../../../modules/search/sync");
const analytics = require("../../../../../modules/analytics");
const compliance = require("../../../../../modules/compliance");

module.exports = {
  async afterCreate(event) {
    const r = event.result;
    compliance.logDiagnosticConfirmed({
      diagnosticId: r?.id,
      doctorId: r?.doctor?.id ?? r?.doctor,
      patientId: r?.patient?.id ?? r?.patient,
      clinicId: r?.clinic?.id ?? r?.clinic,
      consultationId: r?.appointment?.id ?? r?.appointment,
    });
    await syncDiagnostic(global.strapi, r, "create");
    if (analytics.isEnabled()) {
      const r = event.result;
      const clinicId = r?.clinic?.id ?? r?.clinic;
      const doctorId = r?.doctor?.id ?? r?.doctor;
      analytics.trackEvent("diagnostic_added", {
        clinicId,
        userId: doctorId,
        entityId: r?.appointment?.id ?? r?.appointment ?? r?.id,
        metadata: { diagnosticId: r?.id, appointmentId: r?.appointment?.id ?? r?.appointment },
      });
    }
  },
  async afterUpdate(event) {
    await syncDiagnostic(global.strapi, event.result, "update");
  },
  async afterDelete(event) {
    const entity = event.result?.id ? event.result : { id: event.params?.where?.id };
    await syncDiagnostic(global.strapi, entity, "delete");
  },
};
