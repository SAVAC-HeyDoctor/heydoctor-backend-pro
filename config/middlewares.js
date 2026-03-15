const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "https://heydoctor.health,https://www.heydoctor.health").split(",").map(s => s.trim());

module.exports = [
  "global::health",
  "global::sentry",
  "global::rate-limit",
  "global::tenant-resolver",
  "strapi::errors",
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'", "https:"],
          "img-src": ["'self'", "data:", "blob:", "https:"],
          "media-src": ["'self'", "data:", "blob:", "https:"],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  {
    name: "strapi::cors",
    config: {
      origin: process.env.NODE_ENV === "production" ? ALLOWED_ORIGINS : ["http://localhost:3000", "http://localhost:1337"],
      credentials: true,
    },
  },
  {
    name: "strapi::poweredBy",
    config: {
      poweredBy: "SAVAC MedTech LLC",
    },
  },
  "strapi::logger",
  "strapi::query",
  "strapi::body",
  {
    name: "strapi::session",
    config: {
      rolling: true,
      renew: true,
    },
  },
  "strapi::favicon",
  "strapi::public",
];
