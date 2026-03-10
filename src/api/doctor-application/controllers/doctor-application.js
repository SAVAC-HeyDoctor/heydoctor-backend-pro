'use strict';

/**
 * doctor-application controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::doctor-application.doctor-application');
