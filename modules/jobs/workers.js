"use strict";

const jobs = require("./index");
const { getPdfQueue, getEmailQueue, getImageQueue, getWebhookQueue } = require("./queues");

async function processPdf(job) {
  const { appointmentId, patientId, format } = job.data;
  if (!jobs.isEnabled()) return { skipped: true, reason: "Redis not configured" };
  // Placeholder: integrar con pdfkit cuando se implemente generación real
  return { appointmentId, patientId, format, status: "queued" };
}

async function processEmail(job) {
  const { to, subject, template, data } = job.data;
  if (!jobs.isEnabled()) return { skipped: true };
  // Placeholder: integrar con Strapi email o nodemailer
  return { to, subject, status: "queued" };
}

async function processImage(job) {
  const { fileId, operation } = job.data;
  if (!jobs.isEnabled()) return { skipped: true };
  return { fileId, operation, status: "queued" };
}

async function processWebhook(job) {
  const { payload, source } = job.data;
  if (!jobs.isEnabled()) return { skipped: true };
  return { source, status: "queued" };
}

function startWorkers(strapi) {
  if (!jobs.isEnabled()) {
    strapi?.log?.info("Jobs: Redis not configured, workers disabled");
    return;
  }
  jobs.createWorker("clinical-pdf", processPdf);
  jobs.createWorker("email", processEmail);
  jobs.createWorker("medical-image", processImage);
  jobs.createWorker("payment-webhook", processWebhook);
  strapi?.log?.info("Jobs: workers started (pdf, email, image, webhook)");
}

module.exports = { startWorkers, processPdf, processEmail, processImage, processWebhook };
