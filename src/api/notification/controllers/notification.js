"use strict";

/**
 * notification controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

const createNotification = async (body) => {
  const entity = await strapi.services.notification.create(body);
  if (body.user) {
    const socket = await strapi
      .query("connection")
      .findOne({ userID: body.user.id });
    if (socket && socket.socketID != null) {
      strapi.io.to(socket.socketID).emit("message", {
        entity,
      });
    }
  }
};

module.exports = createCoreController(
  "api::notification.notification",
  ({ strapi }) => ({})
);
