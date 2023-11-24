'use strict';

/**
 * diagnostic service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::diagnostic.diagnostic');
