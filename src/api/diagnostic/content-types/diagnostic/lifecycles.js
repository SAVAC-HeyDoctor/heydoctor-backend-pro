"use strict";

const { syncDiagnostic } = require("../../../../../modules/search/sync");

module.exports = {
  async afterCreate(event) {
    await syncDiagnostic(global.strapi, event.result, "create");
  },
  async afterUpdate(event) {
    await syncDiagnostic(global.strapi, event.result, "update");
  },
  async afterDelete(event) {
    const entity = event.result?.id ? event.result : { id: event.params?.where?.id };
    await syncDiagnostic(global.strapi, entity, "delete");
  },
};
