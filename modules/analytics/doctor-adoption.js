"use strict";

/**
 * Métricas de adopción clínica - Doctor Adoption Metrics.
 * Almacena y consulta en ClickHouse.
 */
const analytics = require("./index");

const CLINICAL_ACTIONS = [
  "consultation_started",
  "clinical_note_generated",
  "diagnostic_added",
  "treatment_added",
  "cdss_evaluated",
];

const AI_EVENTS = ["copilot_suggestions_used", "cdss_evaluated", "predictive_medicine_used"];

const CONSULTATION_LIFECYCLE = ["consultation_started", "clinical_note_generated", "consultation_completed"];

const ACTION_EVENTS = ["diagnostic_added", "treatment_added", "prescription_created", "test_ordered"];

function getClient() {
  return analytics.getClient();
}

function clinicFilter(clinicId) {
  return clinicId != null ? `AND clinic_id = ${Number(clinicId)}` : "";
}

function dateFilter(days = 1) {
  return `AND timestamp >= now() - INTERVAL ${Number(days)} DAY`;
}

/**
 * Daily Active Doctors (DAD)
 * Médicos que realizan al menos una acción clínica al día.
 */
async function calculateDailyActiveDoctors(clinicId = null, date = null) {
  const c = getClient();
  if (!c) return { daily_active_doctors: 0, date: date || new Date().toISOString().slice(0, 10) };

  const dateClause = date ? `AND toDate(timestamp) = '${date}'` : `AND toDate(timestamp) = today()`;
  const eventList = CLINICAL_ACTIONS.map((e) => `'${e}'`).join(", ");

  try {
    const q = `
      SELECT count(DISTINCT user_id) as cnt
      FROM events
      WHERE event_type IN (${eventList})
        AND user_id IS NOT NULL
        ${clinicFilter(clinicId)}
        ${dateClause}
    `;
    const result = await c.query({ query: q, format: "JSONEachRow" });
    const rows = await result.json();
    const cnt = rows?.[0]?.cnt ?? 0;
    return {
      daily_active_doctors: Number(cnt),
      date: date || new Date().toISOString().slice(0, 10),
    };
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Doctor adoption: DAD query failed", err?.message);
    return { daily_active_doctors: 0, date: date || new Date().toISOString().slice(0, 10) };
  }
}

/**
 * Tiempo promedio de completar una consulta (minutos).
 * consultation_started -> consultation_completed (o clinical_note_generated como proxy de fin).
 */
async function calculateAvgConsultationTime(clinicId = null, days = 7) {
  const c = getClient();
  if (!c) return { avg_consultation_minutes: 0 };

  try {
    const q = `
      WITH started AS (
        SELECT entity_id as apt_id, user_id, timestamp as start_ts
        FROM events
        WHERE event_type = 'consultation_started'
          AND entity_id IS NOT NULL
          ${clinicFilter(clinicId)}
          ${dateFilter(days)}
      ),
      completed AS (
        SELECT entity_id as apt_id, timestamp as end_ts
        FROM events
        WHERE event_type IN ('consultation_completed', 'consultation_ended', 'clinical_note_generated')
          AND entity_id IS NOT NULL
          ${clinicFilter(clinicId)}
          ${dateFilter(days)}
      )
      SELECT avg(dateDiff('minute', s.start_ts, c.end_ts)) as avg_mins
      FROM started s
      JOIN completed c ON s.apt_id = c.apt_id AND c.end_ts > s.start_ts
    `;
    const result = await c.query({ query: q, format: "JSONEachRow" });
    const rows = await result.json();
    const avgMins = rows?.[0]?.avg_mins ?? 0;
    return { avg_consultation_minutes: Math.round(Number(avgMins) || 0) };
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Doctor adoption: consultation time query failed", err?.message);
    return { avg_consultation_minutes: 0 };
  }
}

/**
 * AI Assistance Rate - % de consultas donde el médico usó AI.
 */
async function calculateAiUsageRate(clinicId = null, days = 7) {
  const c = getClient();
  if (!c) return { ai_usage_rate: 0 };

  try {
    const aiList = AI_EVENTS.map((e) => `'${e}'`).join(", ");
    const totalQ = `
      SELECT count(DISTINCT entity_id) as cnt
      FROM events
      WHERE event_type = 'consultation_started'
        AND entity_id IS NOT NULL
        ${clinicFilter(clinicId)}
        ${dateFilter(days)}
    `;
    const aiQ = `
      SELECT count(DISTINCT entity_id) as cnt
      FROM events
      WHERE event_type IN (${aiList})
        AND entity_id IS NOT NULL
        ${clinicFilter(clinicId)}
        ${dateFilter(days)}
    `;
    const [totalRes, aiRes] = await Promise.all([
      c.query({ query: totalQ, format: "JSONEachRow" }),
      c.query({ query: aiQ, format: "JSONEachRow" }),
    ]);
    const totalRows = await totalRes.json();
    const aiRows = await aiRes.json();
    const total = Number(totalRows?.[0]?.cnt ?? 0);
    const withAi = Number(aiRows?.[0]?.cnt ?? 0);
    const rate = total > 0 ? (withAi / total) * 100 : 0;
    return { ai_usage_rate: Math.round(rate * 100) / 100 };
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Doctor adoption: AI rate query failed", err?.message);
    return { ai_usage_rate: 0 };
  }
}

/**
 * Promedio de acciones clínicas por consulta.
 */
async function calculateAvgActionsPerConsultation(clinicId = null, days = 7) {
  const c = getClient();
  if (!c) return { avg_actions_per_consultation: 0 };

  try {
    const actionList = ACTION_EVENTS.map((e) => `'${e}'`).join(", ");
    const q = `
      WITH consultations AS (
        SELECT DISTINCT entity_id as apt_id
        FROM events
        WHERE event_type = 'consultation_started'
          AND entity_id IS NOT NULL
          ${clinicFilter(clinicId)}
          ${dateFilter(days)}
      ),
      actions AS (
        SELECT entity_id as apt_id, count() as action_cnt
        FROM events
        WHERE event_type IN (${actionList})
          AND entity_id IS NOT NULL
          ${clinicFilter(clinicId)}
          ${dateFilter(days)}
        GROUP BY entity_id
      )
      SELECT avg(coalesce(a.action_cnt, 0)) as avg_actions
      FROM consultations c
      LEFT JOIN actions a ON c.apt_id = a.apt_id
    `;
    const result = await c.query({ query: q, format: "JSONEachRow" });
    const rows = await result.json();
    const avg = rows?.[0]?.avg_actions ?? 0;
    return { avg_actions_per_consultation: Math.round((Number(avg) || 0) * 100) / 100 };
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Doctor adoption: actions query failed", err?.message);
    return { avg_actions_per_consultation: 0 };
  }
}

/**
 * Doctor Stickiness Score - métrica compuesta.
 */
async function calculateStickinessScore(clinicId = null, days = 7) {
  const c = getClient();
  if (!c) return { stickiness_score: 0, adoption_level: "low" };

  try {
    const [dadRes, aiRes, consRes, remRes] = await Promise.all([
      calculateDailyActiveDoctors(clinicId),
      calculateAiUsageRate(clinicId, days),
      c.query({
        query: `
          SELECT count() as total, count(DISTINCT user_id) as doctors
          FROM events
          WHERE event_type = 'consultation_started'
            AND user_id IS NOT NULL
            ${clinicFilter(clinicId)}
            ${dateFilter(days)}
        `,
        format: "JSONEachRow",
      }),
      c.query({
        query: `
          SELECT count() as cnt
          FROM events
          WHERE event_type = 'reminder_created'
            ${clinicFilter(clinicId)}
            ${dateFilter(days)}
        `,
        format: "JSONEachRow",
      }),
    ]);

    const consRows = await consRes.json();
    const remRows = await remRes.json();
    const totalCons = Number(consRows?.[0]?.total ?? 0);
    const totalDoctors = Number(consRows?.[0]?.doctors ?? 1);
    const remindersCreated = Number(remRows?.[0]?.cnt ?? 0);

    const consultationsPerDoctor = totalDoctors > 0 ? totalCons / totalDoctors : 0;
    const aiUsageRate = (aiRes.ai_usage_rate ?? 0) / 100;
    const remindersRate = totalCons > 0 ? Math.min(1, remindersCreated / totalCons) : 0;

    const stickiness_score =
      consultationsPerDoctor * 0.4 + aiUsageRate * 0.3 + remindersRate * 0.3;

    let adoption_level = "low";
    if (stickiness_score >= 0.6) adoption_level = "high";
    else if (stickiness_score >= 0.3) adoption_level = "medium";

    return {
      stickiness_score: Math.round(stickiness_score * 100) / 100,
      adoption_level,
    };
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Doctor adoption: stickiness query failed", err?.message);
    return { stickiness_score: 0, adoption_level: "low" };
  }
}

/**
 * Dashboard completo de adopción.
 */
async function getDoctorAdoptionDashboard(clinicId = null, days = 7) {
  const [dad, consultationTime, aiRate, actions, stickiness] = await Promise.all([
    calculateDailyActiveDoctors(clinicId),
    calculateAvgConsultationTime(clinicId, days),
    calculateAiUsageRate(clinicId, days),
    calculateAvgActionsPerConsultation(clinicId, days),
    calculateStickinessScore(clinicId, days),
  ]);

  return {
    daily_active_doctors: dad.daily_active_doctors,
    date: dad.date,
    avg_consultation_minutes: consultationTime.avg_consultation_minutes,
    ai_usage_rate: aiRate.ai_usage_rate,
    avg_actions_per_consultation: actions.avg_actions_per_consultation,
    stickiness_score: stickiness.stickiness_score,
    adoption_level: stickiness.adoption_level,
  };
}

module.exports = {
  calculateDailyActiveDoctors,
  calculateAvgConsultationTime,
  calculateAiUsageRate,
  calculateAvgActionsPerConsultation,
  calculateStickinessScore,
  getDoctorAdoptionDashboard,
};
