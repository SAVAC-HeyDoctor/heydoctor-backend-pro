"use strict";

const jobs = require("./index");

const QUEUE_NAMES = {
  PDF: "clinical-pdf",
  EMAIL: "email",
  IMAGE: "medical-image",
  WEBHOOK: "payment-webhook",
};

function getPdfQueue() {
  return jobs.createQueue(QUEUE_NAMES.PDF);
}

function getEmailQueue() {
  return jobs.createQueue(QUEUE_NAMES.EMAIL);
}

function getImageQueue() {
  return jobs.createQueue(QUEUE_NAMES.IMAGE);
}

function getWebhookQueue() {
  return jobs.createQueue(QUEUE_NAMES.WEBHOOK);
}

async function enqueuePdf(data) {
  const q = getPdfQueue();
  return q.add("generate", data);
}

async function enqueueEmail(data) {
  const q = getEmailQueue();
  return q.add("send", data);
}

async function enqueueImageProcessing(data) {
  const q = getImageQueue();
  return q.add("process", data);
}

async function enqueueWebhook(data) {
  const q = getWebhookQueue();
  return q.add("process", data);
}

module.exports = {
  QUEUE_NAMES,
  getPdfQueue,
  getEmailQueue,
  getImageQueue,
  getWebhookQueue,
  enqueuePdf,
  enqueueEmail,
  enqueueImageProcessing,
  enqueueWebhook,
};
