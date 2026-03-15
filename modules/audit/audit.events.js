'use strict';

const eventBus = require('../events/eventBus');

/**
 * Audit event listeners - create audit logs for domain events.
 */
function registerAuditListeners(strapi) {
  eventBus.on('DOCUMENT_SIGNED', (payload) => {
    strapi.log.info('DOCUMENT_SIGNED', payload);
    strapi.entityService.create('api::audit-log.audit-log', {
      data: {
        action: 'DOCUMENT_SIGNED',
        user_id: payload.doctorId,
        patient_id: payload.patientId ?? null,
        ip_address: null,
        user_agent: null,
        metadata: payload,
        clinic: payload.clinicId ?? null,
      },
    }).catch((err) => strapi.log.warn('audit DOCUMENT_SIGNED failed:', err.message));
  });

  eventBus.on('CONSULTATION_STARTED', (payload) => {
    strapi.log.info('CONSULTATION_STARTED', payload);
    strapi.entityService.create('api::audit-log.audit-log', {
      data: {
        action: 'CONSULTATION_STARTED',
        user_id: null,
        patient_id: null,
        ip_address: null,
        user_agent: null,
        metadata: payload,
        clinic: payload.clinicId ?? null,
      },
    }).catch((err) => strapi.log.warn('audit CONSULTATION_STARTED failed:', err.message));
  });

  eventBus.on('IMAGE_CAPTURED', (payload) => {
    strapi.log.info('IMAGE_CAPTURED', payload);
    strapi.entityService.create('api::audit-log.audit-log', {
      data: {
        action: 'IMAGE_CAPTURED',
        user_id: null,
        patient_id: null,
        ip_address: null,
        user_agent: null,
        metadata: payload,
        clinic: payload.clinicId ?? null,
      },
    }).catch((err) => strapi.log.warn('audit IMAGE_CAPTURED failed:', err.message));
  });
}

module.exports = { registerAuditListeners };
