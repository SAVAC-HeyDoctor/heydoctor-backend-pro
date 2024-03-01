'use strict';

/**
 * connection controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::connection.connection');
