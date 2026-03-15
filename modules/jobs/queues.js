"use strict";

const jobs = require("./index");

const QUEUE_NAMES = {
  PDF: "clinical-pdf",
  EMAIL: "email",
  IMAGE: "medical-image",
  WEBHOOK: "payment-webhook",
  ANALYTICS: "analytics-worker",
  AI_SUMMARY: "ai-consultation-summary",
  AI_INSIGHTS: "ai-weekly-insights",
  AI_COPILOT: "ai-copilot",
  KNOWLEDGE_GRAPH: "knowledge-graph-build",
  AI_MODEL_REFRESH: "ai-model-refresh",
  PREDICTIVE_MODEL_REFRESH: "predictive-model-refresh",
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

function getAnalyticsQueue() {
  return jobs.createQueue(QUEUE_NAMES.ANALYTICS);
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

async function enqueueAnalytics(data) {
  const q = getAnalyticsQueue();
  return q.add("track", data);
}

function getAiSummaryQueue() {
  return jobs.createQueue(QUEUE_NAMES.AI_SUMMARY);
}

function getAiInsightsQueue() {
  return jobs.createQueue(QUEUE_NAMES.AI_INSIGHTS);
}

async function enqueueAiSummary(data) {
  const q = getAiSummaryQueue();
  return q.add("generate", data);
}

async function enqueueAiInsights(data) {
  const q = getAiInsightsQueue();
  return q.add("generate", data);
}

function getAiCopilotQueue() {
  return jobs.createQueue(QUEUE_NAMES.AI_COPILOT);
}

async function enqueueCopilotAnalysis(data) {
  const q = getAiCopilotQueue();
  return q.add("analyze", data);
}

async function startCopilotScheduler() {
  const q = getAiCopilotQueue();
  await q.add("scheduler", {}, { repeat: { every: 30000, key: "copilot-scheduler" } }).catch(() => {});
}

function getKnowledgeGraphQueue() {
  return jobs.createQueue(QUEUE_NAMES.KNOWLEDGE_GRAPH);
}

async function enqueueKnowledgeGraphBuild(data = {}) {
  const q = getKnowledgeGraphQueue();
  return q.add("build", data);
}

function getAiModelRefreshQueue() {
  return jobs.createQueue(QUEUE_NAMES.AI_MODEL_REFRESH);
}

async function enqueueAiModelRefresh(data = {}) {
  const q = getAiModelRefreshQueue();
  return q.add("refresh", data);
}

module.exports = {
  QUEUE_NAMES,
  getPdfQueue,
  getEmailQueue,
  getImageQueue,
  getWebhookQueue,
  getAnalyticsQueue,
  getAiSummaryQueue,
  getAiInsightsQueue,
  enqueuePdf,
  enqueueEmail,
  enqueueImageProcessing,
  enqueueWebhook,
  enqueueAnalytics,
  enqueueAiSummary,
  enqueueAiInsights,
  getAiCopilotQueue,
  enqueueCopilotAnalysis,
  startCopilotScheduler,
  getKnowledgeGraphQueue,
  enqueueKnowledgeGraphBuild,
  getAiModelRefreshQueue,
  enqueueAiModelRefresh,
  getPredictiveModelRefreshQueue,
  enqueuePredictiveModelRefresh,
};
