"use strict";

const analytics = require("../../../../../modules/analytics");
const compliance = require("../../../../../modules/compliance");

module.exports = {
  async afterCreate(event) {
    const r = event.result;
    const cr = r?.clinical_record;
    compliance.logTreatmentApplied({
      treatmentId: r?.id,
      clinicId: cr?.clinic?.id ?? cr?.clinic,
      patientId: cr?.patient?.id ?? cr?.patient,
      clinicalRecordId: cr?.id ?? cr,
    });
    if (analytics.isEnabled()) {
      const clinicRef = cr?.clinic ?? r?.clinical_record;
      analytics.trackEvent("treatment_added", {
        clinicId: typeof clinicRef === "object" ? clinicRef?.id : clinicRef,
        userId: null,
        entityId: r?.clinical_record?.id ?? r?.clinical_record ?? r?.id,
        metadata: { treatmentId: r?.id },
      });
    }
  },
};
