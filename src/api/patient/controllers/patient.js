'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { withClinicFilter, ensureClinicAccess } = require('../../../utils/tenant-scope');
const { auditLogger } = require('../../../utils/audit-logger');

module.exports = createCoreController('api::patient.patient', ({ strapi }) => ({
  async find(ctx) {
    ctx.query = ctx.query || {};
    ctx.query.filters = withClinicFilter(ctx, ctx.query.filters || {});
    return super.find(ctx);
  },
  async findOne(ctx) {
    const { id } = ctx.params;
    const entity = await strapi.entityService.findOne('api::patient.patient', id, { populate: ['clinic'] });
    if (!entity) return ctx.notFound();
    if (!ensureClinicAccess(ctx, entity)) return ctx.forbidden('No tiene acceso a este paciente');
    await auditLogger(strapi, 'VIEW_MEDICAL_RECORD', ctx, { patient_id: entity.id });
    return super.findOne(ctx);
  },
  async create(ctx) {
    const clinicId = ctx.state?.clinicId;
    if (clinicId) ctx.request.body.data = { ...(ctx.request.body.data || {}), clinic: clinicId };
    return super.create(ctx);
  },
  async update(ctx) {
    const { id } = ctx.params;
    const entity = await strapi.entityService.findOne('api::patient.patient', id, { populate: ['clinic'] });
    if (!entity) return ctx.notFound();
    if (!ensureClinicAccess(ctx, entity)) return ctx.forbidden('No tiene acceso a este paciente');
    return super.update(ctx);
  },
  async delete(ctx) {
    const { id } = ctx.params;
    const entity = await strapi.entityService.findOne('api::patient.patient', id, { populate: ['clinic'] });
    if (!entity) return ctx.notFound();
    if (!ensureClinicAccess(ctx, entity)) return ctx.forbidden('No tiene acceso a este paciente');
    return super.delete(ctx);
  },

  async medicalRecord(ctx) {
    const { id } = ctx.params;
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized('Autenticación requerida');

    const patient = await strapi.entityService.findOne('api::patient.patient', id, {
      populate: ['clinical_record', 'user', 'clinic'],
    });
    if (!patient) return ctx.notFound();

    const doctor = await strapi.db.query('api::doctor.doctor').findOne({ where: { user: user.id } });
    const patientUser = await strapi.db.query('api::patient.patient').findOne({ where: { user: user.id } });

    const isPatientOwner = patientUser && patientUser.id === parseInt(id, 10);
    const isDoctor = doctor && (await strapi.db.query('api::appointment.appointment').findOne({
      where: { patient: id, doctor: doctor.id },
    }));

    if (!isPatientOwner && !isDoctor) return ctx.forbidden('No tiene permiso para exportar esta historia clínica');

    await auditLogger(strapi, 'EXPORT_MEDICAL_RECORD', ctx, { patient_id: parseInt(id, 10) });

    const clinicalRecord = patient.clinical_record
      ? await strapi.entityService.findOne('api::clinical-record.clinical-record', patient.clinical_record.id ?? patient.clinical_record, {
          populate: {
            appointments: true,
            diagnostics: { populate: { cie_10_code: true } },
            treatments: true,
          },
        })
      : null;

    const appointments = clinicalRecord?.appointments
      ? await Promise.all(
          (Array.isArray(clinicalRecord.appointments) ? clinicalRecord.appointments : [clinicalRecord.appointments]).map(
            (a) => strapi.entityService.findOne('api::appointment.appointment', a.id ?? a, {
              populate: ['doctor', 'specialty_profile', 'diagnostic', 'files'],
            })
          )
        )
      : [];

    const data = {
      patient: { id: patient.id, firstname: patient.firstname, lastname: patient.lastname, birth_date: patient.birth_date, gender: patient.gender },
      clinical_record: clinicalRecord
        ? {
            date: clinicalRecord.date,
            observations: clinicalRecord.observations,
            personal_background: clinicalRecord.personal_background,
            family_background: clinicalRecord.family_background,
            clinical_judgement: clinicalRecord.clinical_judgement,
            habits: clinicalRecord.habits,
            admission_reason: clinicalRecord.admission_reason,
            allergies: clinicalRecord.allergies,
            diagnostics: clinicalRecord.diagnostics ?? [],
            treatments: clinicalRecord.treatments ?? [],
          }
        : null,
      appointments,
    };

    return ctx.send({ data });
  },
}));
