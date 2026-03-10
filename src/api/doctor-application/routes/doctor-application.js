'use strict';

/**
 * doctor-application router
 * create: público (formulario for-doctors). find/findOne/update/delete: requieren auth (admin).
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::doctor-application.doctor-application', {
  config: {
    create: { auth: false },
  },
});
