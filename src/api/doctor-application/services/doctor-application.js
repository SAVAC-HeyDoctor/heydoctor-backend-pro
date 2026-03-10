'use strict';

/**
 * doctor-application service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::doctor-application.doctor-application');
