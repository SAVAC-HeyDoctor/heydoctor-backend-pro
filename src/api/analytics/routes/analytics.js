"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/doctor-adoption",
      handler: "analytics.doctorAdoption",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
  ],
};
