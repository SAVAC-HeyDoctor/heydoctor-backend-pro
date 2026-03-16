"use strict";

const doctorAdoption = require("../../../../modules/analytics/doctor-adoption");

module.exports = {
  async doctorAdoption(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const clinicId = ctx.state?.clinicId ?? ctx.query?.clinic_id ?? null;
    const days = Math.min(90, Math.max(1, parseInt(ctx.query?.days, 10) || 7));

    const analytics = require("../../../../modules/analytics");
    if (!analytics.isEnabled()) {
      return ctx.send({
        daily_active_doctors: 0,
        avg_consultation_minutes: 0,
        ai_usage_rate: 0,
        avg_actions_per_consultation: 0,
        stickiness_score: 0,
        adoption_level: "low",
        meta: { analytics_enabled: false, message: "ClickHouse no configurado" },
      });
    }

    const data = await doctorAdoption.getDoctorAdoptionDashboard(clinicId, days);
    return ctx.send({
      ...data,
      meta: { analytics_enabled: true, days, clinic_id: clinicId },
    });
  },
};
