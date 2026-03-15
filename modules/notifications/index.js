"use strict";

/**
 * Event-driven notifications.
 * Canales: email, push, sms (estructura preparada).
 * Eventos: consultation_started, consultation_joined, document_uploaded, appointment_created.
 */

const eventBus = require("../events/eventBus");
const { enqueueEmail } = require("../jobs/queues");
const observability = require("../observability");

const EVENTS = {
  CONSULTATION_STARTED: "CONSULTATION_STARTED",
  CONSULTATION_JOINED: "consultation_joined",
  DOCUMENT_UPLOADED: "document_uploaded",
  APPOINTMENT_CREATED: "appointment_created",
};

async function sendEmail(payload) {
  try {
    await enqueueEmail({
      to: payload.to,
      subject: payload.subject,
      template: payload.template || "default",
      data: payload.data || {},
    });
  } catch (err) {
    observability.captureError(err, { channel: "email", payload });
  }
}

async function sendPush(payload) {
  // Estructura preparada: integrar con @surunnuage/strapi-plugin-expo-notifications
  observability.log("debug", "Push notification (placeholder)", { payload });
}

async function sendSms(payload) {
  // Estructura preparada para futuro proveedor SMS
  observability.log("debug", "SMS notification (placeholder)", { payload });
}

function registerListeners(strapi) {
  eventBus.on(EVENTS.CONSULTATION_STARTED, async (payload) => {
    try {
      observability.log("info", "notification: consultation_started", payload);
      await sendEmail({
        to: payload.patientEmail,
        subject: "Tu consulta ha comenzado",
        template: "consultation_started",
        data: payload,
      });
      await sendPush({ type: "consultation_started", ...payload });
    } catch (err) {
      observability.captureError(err, { event: "consultation_started", payload });
    }
  });

  eventBus.on(EVENTS.CONSULTATION_JOINED, async (payload) => {
    try {
      observability.log("info", "notification: consultation_joined", payload);
      await sendPush({ type: "consultation_joined", ...payload });
    } catch (err) {
      observability.captureError(err, { event: "consultation_joined", payload });
    }
  });

  eventBus.on(EVENTS.DOCUMENT_UPLOADED, async (payload) => {
    try {
      observability.log("info", "notification: document_uploaded", payload);
      await sendEmail({
        to: payload.recipientEmail,
        subject: "Nuevo documento subido",
        template: "document_uploaded",
        data: payload,
      });
      await sendPush({ type: "document_uploaded", ...payload });
    } catch (err) {
      observability.captureError(err, { event: "document_uploaded", payload });
    }
  });

  eventBus.on(EVENTS.APPOINTMENT_CREATED, async (payload) => {
    try {
      observability.log("info", "notification: appointment_created", payload);
      await sendEmail({
        to: payload.patientEmail,
        subject: "Cita programada",
        template: "appointment_created",
        data: payload,
      });
      await sendPush({ type: "appointment_created", ...payload });
      if (payload.patientPhone) {
        await sendSms({ to: payload.patientPhone, template: "appointment_created", data: payload });
      }
    } catch (err) {
      observability.captureError(err, { event: "appointment_created", payload });
    }
  });

  strapi?.log?.info("Notifications: listeners registered (consultation_started, consultation_joined, document_uploaded, appointment_created)");
}

module.exports = {
  EVENTS,
  registerListeners,
  sendEmail,
  sendPush,
  sendSms,
};
