'use strict';

/**
 * connection router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::connection.connection');
