"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/risk",
      handler: "predictive-medicine.risk",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
  ],
};
