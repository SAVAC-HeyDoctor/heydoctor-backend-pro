'use strict';

/**
 * diagnostic router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::diagnostic.diagnostic');
