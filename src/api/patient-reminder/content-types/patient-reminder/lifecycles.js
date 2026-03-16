"use strict";

const analytics = require("../../../../../modules/analytics");

module.exports = {
  async afterCreate(event) {
    if (analytics.isEnabled()) {
      const r = event.result;
      const clinicId = r?.clinic?.id ?? r?.clinic;
      const doctorId = r?.created_by?.id ?? r?.created_by;
      analytics.trackEvent("reminder_created", {
        clinicId,
        userId: doctorId,
        entityId: r?.patient?.id ?? r?.patient ?? r?.id,
        metadata: { reminderId: r?.id, patientId: r?.patient?.id ?? r?.patient },
      });
    }
  },
};
