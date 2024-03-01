"use strict";

// const { generateDiffieHellmanKeys } = require("./api/utils/encryption");
const {initialize} = require("../config/functions/websockets")

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
  *
  * This gives you an opportunity to extend code.
  */
 register(/*{ strapi }*/) {},
 
 /**
  * An asynchronous bootstrap function that runs before
  * your application gets started.
 *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    
    // const serverKeys = await generateDiffieHellmanKeys();

    // global.serverPrivateKey = serverKeys.privateKey;
    // global.serverPublicKey = serverKeys.publicKey;
    await initialize(strapi);
  },
};
