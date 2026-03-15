"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/evaluate",
      handler: "cdss.evaluate",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
  ],
};
