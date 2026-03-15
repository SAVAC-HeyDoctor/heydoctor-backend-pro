"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/",
      handler: "search.find",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
  ],
};
