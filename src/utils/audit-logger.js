'use strict';

/**
 * Audit logger for medical record and file access.
 * Logs: user_id, patient_id, ip_address, user_agent, timestamp
 */
async function auditLogger(strapi, action, ctx, extra = {}) {
  try {
    const user = ctx?.state?.user;
    const ip = ctx?.request?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
      || ctx?.request?.headers?.['x-real-ip']
      || ctx?.request?.ip
      || 'unknown';
    const userAgent = ctx?.request?.headers?.['user-agent'] || '';

    await strapi.entityService.create('api::audit-log.audit-log', {
      data: {
        action,
        user_id: user?.id ?? null,
        patient_id: extra.patient_id ?? extra.patientId ?? null,
        ip_address: ip,
        user_agent: userAgent,
        metadata: { ...extra },
        clinic: extra.clinic_id ?? extra.clinicId ?? ctx?.state?.clinicId ?? null,
      },
    });
  } catch (err) {
    strapi.log.warn('auditLogger failed:', err.message);
  }
}

module.exports = { auditLogger };
