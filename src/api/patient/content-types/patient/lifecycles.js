"use strict";

const eventBus = require("../../../../../modules/events/eventBus");
const { syncPatient } = require("../../../../../modules/search/sync");
const fieldEncryption = require("../../../../utils/field-encryption");

function encryptSensitive(data) {
  if (!fieldEncryption.isFieldEncryptionEnabled() || !data) return;
  if (data.phone && !fieldEncryption.isEncrypted(data.phone)) {
    data.phone = fieldEncryption.encryptField(data.phone);
  }
}

function decryptSensitive(result) {
  if (!fieldEncryption.isFieldEncryptionEnabled() || !result) return;
  if (result.phone && fieldEncryption.isEncrypted(result.phone)) {
    result.phone = fieldEncryption.decryptField(result.phone);
  }
  if (result.attributes?.phone && fieldEncryption.isEncrypted(result.attributes.phone)) {
    result.attributes.phone = fieldEncryption.decryptField(result.attributes.phone);
  }
}

module.exports = {
  async beforeCreate(event) {
    if (event.params?.data) encryptSensitive(event.params.data);
  },
  async beforeUpdate(event) {
    if (event.params?.data) encryptSensitive(event.params.data);
  },
  async afterCreate(event) {
    decryptSensitive(event.result);
    await syncPatient(global.strapi, event.result, "create");
    const r = event.result;
    eventBus.emit("patient_created", {
      patientId: r?.id,
      clinicId: r?.clinic?.id ?? r?.clinic,
      metadata: { patientId: r?.id },
    });
  },
  async afterUpdate(event) {
    decryptSensitive(event.result);
    await syncPatient(global.strapi, event.result, "update");
  },
  async afterDelete(event) {
    const entity = event.result?.id ? event.result : { id: event.params?.where?.id };
    await syncPatient(global.strapi, entity, "delete");
  },
};
