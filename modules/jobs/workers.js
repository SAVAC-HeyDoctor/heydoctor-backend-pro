"use strict";

const jobs = require("./index");
const { getPdfQueue, getEmailQueue, getImageQueue, getWebhookQueue, enqueueCopilotAnalysis } = require("./queues");
const { insertEvent } = require("../analytics/clickhouse");

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

async function processAnalytics(job) {
  const analytics = require("../analytics");
  if (!analytics.isEnabled()) return { skipped: true, reason: "ClickHouse not configured" };
  await insertEvent(job.data);
  return { ok: true };
}

async function processAiSummary(job) {
  const ai = require("../ai");
  if (!ai.isEnabled()) return { skipped: true, reason: "AI not configured" };
  const { appointmentId } = job.data;
  let transcript = "";
  let messages = [];
  let clinicalNotes = null;
  if (appointmentId && global.strapi) {
    try {
      const apt = await global.strapi.entityService.findOne("api::appointment.appointment", appointmentId, {
        populate: ["messages", "clinical_record"],
      });
      messages = apt?.messages ?? [];
      if (apt?.clinical_record) {
        clinicalNotes = await global.strapi.entityService.findOne("api::clinical-record.clinical-record", apt.clinical_record.id ?? apt.clinical_record);
      }
    } catch (_) {}
  }
  const summary = await ai.generateConsultationSummary({ transcript, messages, clinicalNotes });
  return { ok: !!summary, summary };
}

async function processAiInsights(job) {
  const aiInsights = require("../analytics/ai-insights");
  if (!aiInsights.canRun()) return { skipped: true, reason: "AI or ClickHouse not configured" };
  const result = await aiInsights.generateWeeklyInsights(job.data);
  return result;
}

async function processCopilotScheduler(job) {
  if (!jobs.isEnabled() || !global.strapi) return { skipped: true };
  const copilot = require("../ai/copilot");
  if (!copilot.isEnabled()) return { skipped: true, reason: "AI not configured" };
  const appointments = await global.strapi.entityService.findMany("api::appointment.appointment", {
    filters: { status: "in_progress" },
    fields: ["id"],
  });
  for (const apt of appointments || []) {
    await enqueueCopilotAnalysis({ consultationId: apt.id, appointmentId: apt.id }).catch(() => {});
  }
  return { processed: (appointments || []).length };
}

async function processKnowledgeGraphBuild(job) {
  const kg = require("../knowledge-graph");
  const { enqueueAiModelRefresh } = require("./queues");
  if (!kg.isEnabled()) return { skipped: true, reason: "ClickHouse not configured" };
  const { clinicId } = job.data || {};
  const result = await kg.buildKnowledgeGraph({ clinicId, clear: true });
  await enqueueAiModelRefresh({ clinicId }).catch(() => {});
  return result;
}

async function processAiModelRefresh(job) {
  const engine = require("../medical-ai-engine");
  if (!engine.isEnabled()) return { skipped: true, reason: "Medical AI Engine not configured" };
  const { clinicId } = job.data || {};
  const result = await engine.updateClinicalModels(clinicId);
  return result;
}

async function processPredictiveModelRefresh(job) {
  const pm = require("../predictive-medicine");
  if (!pm.isEnabled()) return { skipped: true, reason: "Predictive Medicine not configured" };
  const { clinicId } = job.data || {};
  const patterns = await pm.detectClinicalPatterns(clinicId, { days: 30 });
  return { ok: true, patterns_detected: patterns.symptom_clusters?.length ?? 0 };
}

async function processCopilotAnalysis(job) {
  const copilot = require("../ai/copilot");
  const cache = require("../ai/copilot/cache");
  if (!copilot.isEnabled()) return { skipped: true, reason: "AI not configured" };
  const { consultationId, appointmentId } = job.data;
  const aptId = appointmentId ?? consultationId;
  if (!aptId || !global.strapi) return { skipped: true };
  let messages = [];
  let clinicalNotes = null;
  let patientHistory = null;
  try {
    const apt = await global.strapi.entityService.findOne("api::appointment.appointment", aptId, {
      populate: ["messages", "clinical_record", { patient: { populate: ["clinical_record"] } }],
    });
    messages = apt?.messages ?? [];
    if (apt?.clinical_record) {
      clinicalNotes = await global.strapi.entityService.findOne("api::clinical-record.clinical-record", apt.clinical_record.id ?? apt.clinical_record);
    }
    const patient = apt?.patient;
    if (patient?.clinical_record) {
      patientHistory = await global.strapi.entityService.findOne("api::clinical-record.clinical-record", patient.clinical_record.id ?? patient.clinical_record);
    }
  } catch (_) {}
  const suggestions = await copilot.generateSuggestions({ messages, clinicalNotes, patientHistory });
  if (suggestions) await cache.setSuggestions(aptId, suggestions);
  return { ok: !!suggestions, consultationId: aptId };
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
  jobs.createWorker("analytics-worker", processAnalytics);
  jobs.createWorker("ai-consultation-summary", processAiSummary);
  jobs.createWorker("ai-weekly-insights", processAiInsights);
  jobs.createWorker("ai-copilot", async (job) => {
    if (job.name === "scheduler") return processCopilotScheduler(job);
    return processCopilotAnalysis(job);
  });
  jobs.createWorker("knowledge-graph-build", processKnowledgeGraphBuild);
  jobs.createWorker("ai-model-refresh", processAiModelRefresh);
  jobs.createWorker("predictive-model-refresh", processPredictiveModelRefresh);
  strapi?.log?.info("Jobs: workers started (pdf, email, image, webhook, analytics, ai-summary, ai-insights, ai-copilot, knowledge-graph, ai-model-refresh, predictive-model-refresh)");
}

module.exports = { startWorkers, processPdf, processEmail, processImage, processWebhook, processAnalytics, processAiSummary, processAiInsights, processCopilotAnalysis, processCopilotScheduler, processKnowledgeGraphBuild };
