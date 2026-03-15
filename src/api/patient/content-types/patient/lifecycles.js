"use strict";

const { syncPatient } = require("../../../../../modules/search/sync");

module.exports = {
  async afterCreate(event) {
    await syncPatient(global.strapi, event.result, "create");
  },
  async afterUpdate(event) {
    await syncPatient(global.strapi, event.result, "update");
  },
  async afterDelete(event) {
    const entity = event.result?.id ? event.result : { id: event.params?.where?.id };
    await syncPatient(global.strapi, entity, "delete");
  },
};
