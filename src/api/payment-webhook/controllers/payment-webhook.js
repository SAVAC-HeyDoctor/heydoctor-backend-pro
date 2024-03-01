"use strict";

/**
 * payment-webhook controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const axios = require("axios");
const PAYKU_URL = process.env.PAYKU_URL;
const TKPUB = process.env.PAYKU_TKPUB;

const Axios = axios.create({
  baseURL: PAYKU_URL,
  withCredentials: true,
  timeout: 3000,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TKPUB}`,
  },
});

const handlePaymentNotification = async (notification) => {
  const io = strapi.io;

  // Process payment notification
  if (notification) {
    const userID = +notification.payment.additional_parameters.userID;
    const userConnection = await strapi.db
      .query("api::connection.connection")
      .findOne({ where: { userID: userID } });
    io.to(userConnection.socketID).emit("paymentNotification", {
      notification: notification,
    });
  }
};

module.exports = createCoreController(
  "api::payment-webhook.payment-webhook",
  ({ strapi }) => ({
    async create(ctx) {
      const body = ctx.request.body;
      if (body) {
        try {
          const tx = await Axios.get(
            `/transaction/${body.data.transaction_id}`
          );
          const payment = await strapi.db.query("api::payment.payment").update({
            where: { order: +tx.data.order },
            data: {
              status: tx.data.status,
            },
          });

          ctx.request.body = {
            data: {
              notification: tx.data,
              payment: payment.id,
            },
          };
          const entry = await super.create(ctx);
          handlePaymentNotification(tx.data);
          return entry;
        } catch (e) {
          console.error("error on payment-webhook :>> ", e);
        }
      }
    },
  })
);
