"use strict";

const search = require("./index");

async function toPatientDoc(strapi, patient) {
  let email = "";
  if (patient.user?.id) {
    const user = await strapi.entityService.findOne("plugin::users-permissions.user", patient.user.id);
    email = user?.email || "";
  }
  const name = [patient.firstname, patient.lastname].filter(Boolean).join(" ").trim();
  return {
    id: patient.id,
    name,
    email,
    phone: patient.phone || "",
    clinic_id: patient.clinic?.id ?? patient.clinic ?? null,
  };
}

async function toDoctorDoc(strapi, doctor) {
  const name = [doctor.firstname, doctor.lastname].filter(Boolean).join(" ").trim();
  let specialty = "";
  if (doctor.specialty_profiles?.length) {
    specialty = doctor.specialty_profiles.map((s) => s.specialty || s.id).filter(Boolean).join(", ");
  } else if (doctor.specialty_profiles) {
    const profiles = await strapi.entityService.findMany("api::specialty-profile.specialty-profile", {
      filters: { doctors: { id: doctor.id } },
    });
    specialty = profiles.map((p) => p.specialty).filter(Boolean).join(", ");
  }
  const clinicIds = await getDoctorClinicIds(strapi, doctor.id);
  return {
    id: doctor.id,
    name,
    specialty,
    clinic_id: clinicIds[0] ?? null,
    clinic_ids: clinicIds,
  };
}

async function getDoctorClinicIds(strapi, doctorId) {
  const appointments = await strapi.entityService.findMany("api::appointment.appointment", {
    filters: { doctor: { id: doctorId } },
    fields: ["id"],
    populate: { clinic: { fields: ["id"] } },
  });
  const ids = [...new Set(appointments.map((a) => a.clinic?.id ?? a.clinic).filter(Boolean))];
  return ids;
}

async function toDiagnosticDoc(strapi, diagnostic) {
  const cie = diagnostic.cie_10_code
    ? await strapi.entityService.findOne("api::cie-10-code.cie-10-code", diagnostic.cie_10_code.id ?? diagnostic.cie_10_code)
    : null;
  return {
    id: diagnostic.id,
    code: cie?.code || "",
    description: cie?.description || "",
    category: String(cie?.level ?? cie?.source ?? ""),
    clinic_id: diagnostic.clinic?.id ?? diagnostic.clinic ?? null,
  };
}

async function syncPatient(strapi, patient, action) {
  if (!search.isEnabled()) return;
  const id = patient?.id ?? patient;
  if (action === "delete") {
    await search.deleteDocument(search.INDEX_NAMES.patients, id);
  } else {
    const full = await strapi.entityService.findOne("api::patient.patient", id, {
      populate: ["user", "clinic"],
    });
    if (full) {
      const doc = await toPatientDoc(strapi, full);
      await search.indexDocument(search.INDEX_NAMES.patients, doc);
    }
  }
}

async function syncDoctor(strapi, doctor, action) {
  if (!search.isEnabled()) return;
  const id = doctor?.id ?? doctor;
  if (action === "delete") {
    await search.deleteDocument(search.INDEX_NAMES.doctors, id);
  } else {
    const full = await strapi.entityService.findOne("api::doctor.doctor", id, {
      populate: ["specialty_profiles"],
    });
    if (full) {
      const doc = await toDoctorDoc(strapi, full);
      await search.indexDocument(search.INDEX_NAMES.doctors, doc);
    }
  }
}

async function syncDiagnostic(strapi, diagnostic, action) {
  if (!search.isEnabled()) return;
  const id = diagnostic?.id ?? diagnostic;
  if (action === "delete") {
    await search.deleteDocument(search.INDEX_NAMES.diagnostics, id);
  } else {
    const full = await strapi.entityService.findOne("api::diagnostic.diagnostic", id, {
      populate: ["cie_10_code", "clinic"],
    });
    if (full) {
      const doc = await toDiagnosticDoc(strapi, full);
      await search.indexDocument(search.INDEX_NAMES.diagnostics, doc);
    }
  }
}

module.exports = {
  toPatientDoc,
  toDoctorDoc,
  toDiagnosticDoc,
  syncPatient,
  syncDoctor,
  syncDiagnostic,
};
