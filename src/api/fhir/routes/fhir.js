"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/patient/:id",
      handler: "fhir.patient",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
    {
      method: "GET",
      path: "/encounter/:id",
      handler: "fhir.encounter",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
    {
      method: "GET",
      path: "/observation/:id",
      handler: "fhir.observation",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
  ],
};
