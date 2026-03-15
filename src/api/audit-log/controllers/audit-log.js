'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { withClinicFilter, ensureClinicAccess } = require('../../../utils/tenant-scope');

module.exports = createCoreController('api::audit-log.audit-log', ({ strapi }) => ({
  async find(ctx) {
    ctx.query = ctx.query || {};
    ctx.query.filters = withClinicFilter(ctx, ctx.query.filters || {});
    return super.find(ctx);
  },
  async findOne(ctx) {
    const { id } = ctx.params;
    const entity = await strapi.entityService.findOne('api::audit-log.audit-log', id, { populate: ['clinic'] });
    if (!entity) return ctx.notFound();
    if (entity.clinic && !ensureClinicAccess(ctx, entity)) return ctx.forbidden('No tiene acceso a este registro de auditoría');
    return super.findOne(ctx);
  },
}));
