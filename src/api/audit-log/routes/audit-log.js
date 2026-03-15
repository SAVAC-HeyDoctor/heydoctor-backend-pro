'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::audit-log.audit-log', {
  config: {
    find: { policies: ['global::tenant-resolver'] },
    findOne: { policies: ['global::tenant-resolver'] },
  },
});
