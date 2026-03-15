"use strict";

const search = require("../../../../modules/search");

async function searchPatientsSQL(strapi, q, clinicId) {
  const filters = {
    $or: [
      { firstname: { $containsi: q } },
      { lastname: { $containsi: q } },
      { phone: { $containsi: q } },
    ],
  };
  if (clinicId) filters.clinic = clinicId;
  const rows = await strapi.entityService.findMany("api::patient.patient", {
    filters,
    fields: ["id", "firstname", "lastname", "phone"],
    limit: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    name: [r.firstname, r.lastname].filter(Boolean).join(" "),
    phone: r.phone,
    clinic_id: clinicId,
  }));
}

async function searchDoctorsSQL(strapi, q, clinicId) {
  const filters = {
    $or: [
      { firstname: { $containsi: q } },
      { lastname: { $containsi: q } },
    ],
  };
  const doctors = await strapi.entityService.findMany("api::doctor.doctor", {
    filters,
    fields: ["id", "firstname", "lastname"],
    populate: { specialty_profiles: { fields: ["specialty"] } },
    limit: 50,
  });
  let result = doctors;
  if (clinicId) {
    const withClinic = [];
    for (const d of doctors) {
      const apts = await strapi.entityService.findMany("api::appointment.appointment", {
        filters: { doctor: d.id, clinic: clinicId },
        limit: 1,
      });
      if (apts.length > 0) withClinic.push(d);
    }
    result = withClinic;
  }
  return result.map((r) => ({
    id: r.id,
    name: [r.firstname, r.lastname].filter(Boolean).join(" "),
    specialty: r.specialty_profiles?.map((s) => s.specialty).filter(Boolean).join(", ") || "",
    clinic_id: clinicId,
  }));
}

async function searchDiagnosticsSQL(strapi, q, clinicId) {
  const cieCodes = await strapi.entityService.findMany("api::cie-10-code.cie-10-code", {
    filters: {
      $or: [
        { code: { $containsi: q } },
        { description: { $containsi: q } },
      ],
    },
    fields: ["id"],
    limit: 20,
  });
  const cieIds = cieCodes.map((c) => c.id);
  if (cieIds.length === 0) return [];
  const filters = { cie_10_code: { id: { $in: cieIds } } };
  if (clinicId) filters.clinic = clinicId;
  const diag = await strapi.entityService.findMany("api::diagnostic.diagnostic", {
    filters,
    populate: { cie_10_code: { fields: ["code", "description", "level"] } },
    limit: 50,
  });
  return diag.map((d) => ({
    id: d.id,
    code: d.cie_10_code?.code || "",
    description: d.cie_10_code?.description || "",
    category: String(d.cie_10_code?.level ?? ""),
    clinic_id: d.clinic?.id ?? d.clinic ?? clinicId,
  }));
}

module.exports = {
  async find(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const q = ctx.query?.q ?? ctx.query?.query ?? "";
    const type = ctx.query?.type ?? "patient";
    const clinicId = ctx.state?.clinicId;

    if (!["patient", "doctor", "diagnostic"].includes(type)) {
      return ctx.badRequest("type debe ser: patient, doctor o diagnostic");
    }

    if (!clinicId) {
      return ctx.forbidden("Se requiere contexto de clínica para buscar");
    }

    let hits = [];
    let source = "sql";
    const indexName = type === "patient" ? "patients" : type === "doctor" ? "doctors" : "diagnostics";

    if (search.isEnabled()) {
      const filters = type === "doctor" ? { clinic_ids: clinicId } : { clinic_id: clinicId };
      const result = await search.search(indexName, q, filters);
      if (result !== null) {
        hits = result?.hits ?? [];
        source = "meilisearch";
      }
    }

    if (source === "sql") {
      if (type === "patient") hits = await searchPatientsSQL(strapi, q, clinicId);
      else if (type === "doctor") hits = await searchDoctorsSQL(strapi, q, clinicId);
      else hits = await searchDiagnosticsSQL(strapi, q, clinicId);
    }

    return { data: hits, meta: { source } };
  },
};
