'use strict';

const eventBus = require('../../../../../modules/events/eventBus');

module.exports = {
  async afterUpdate(event) {
    const { result, params } = event;
    if (!params?.data?.files) return;
    const files = result?.files;
    if (files && Array.isArray(files) && files.length > 0) {
      const lastFile = files[files.length - 1];
      const imageId = lastFile?.id ?? lastFile;
      eventBus.emit('IMAGE_CAPTURED', {
        consultationId: result.id,
        appointmentId: result.id,
        imageId,
      });
      eventBus.emit('document_uploaded', {
        appointmentId: result.id,
        consultationId: result.id,
        fileId: imageId,
        clinicId: result.clinic?.id ?? result.clinic,
      });
    }
  },
};
