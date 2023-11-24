'use strict';

/**
 * diagnostic controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::diagnostic.diagnostic');
