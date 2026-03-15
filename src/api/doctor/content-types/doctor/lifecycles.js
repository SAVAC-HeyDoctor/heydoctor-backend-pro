"use strict";

const cache = require("../../../../../config/functions/redis-cache");
const { syncDoctor } = require("../../../../../modules/search/sync");

module.exports = {
  async afterCreate(event) {
    await cache.delPattern("doctors:*");
    await syncDoctor(global.strapi, event.result, "create");
  },
  async afterUpdate(event) {
    await cache.delPattern("doctors:*");
    await syncDoctor(global.strapi, event.result, "update");
  },
  async afterDelete(event) {
    await cache.delPattern("doctors:*");
    const entity = event.result?.id ? event.result : { id: event.params?.where?.id };
    await syncDoctor(global.strapi, entity, "delete");
  },
};
