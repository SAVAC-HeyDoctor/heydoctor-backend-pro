"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/suggestions",
      handler: "copilot.suggestions",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
    {
      method: "POST",
      path: "/generate-clinical-note",
      handler: "copilot.generateClinicalNote",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
  ],
};
