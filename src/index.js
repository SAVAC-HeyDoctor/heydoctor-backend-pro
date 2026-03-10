"use strict";

const { initialize } = require("../config/functions/websockets");
const { initSentry } = require("../config/functions/sentry");

module.exports = {
  register(/*{ strapi }*/) {},

  async bootstrap({ strapi }) {
    initSentry(strapi);
    await initialize(strapi);
  },
};
