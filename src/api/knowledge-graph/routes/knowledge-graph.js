"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/build",
      handler: "knowledge-graph.build",
      config: {
        policies: [{ name: "global::tenant-resolver" }],
      },
    },
    {
      method: "GET",
      path: "/query",
      handler: "knowledge-graph.query",
      config: {
        policies: [{ name: "global::tenant-resolver", config: { requireClinic: true } }],
      },
    },
  ],
};
