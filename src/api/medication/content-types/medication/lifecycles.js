"use strict";

const analytics = require("../../../../../modules/analytics");

module.exports = {
  async afterCreate(event) {
    if (analytics.isEnabled()) {
      const r = event.result;
      const diagnosticId = r?.diagnostic?.id ?? r?.diagnostic;
      analytics.trackEvent("prescription_created", {
        clinicId: null,
        userId: null,
        entityId: diagnosticId ?? r?.id,
        metadata: { medicationId: r?.id, diagnosticId },
      });
    }
  },
};
