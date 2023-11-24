'use strict';

/**
 * service-setting service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::service-setting.service-setting');
