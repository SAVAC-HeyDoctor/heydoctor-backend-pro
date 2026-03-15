module.exports = ({ env }) => {
  const baseConnection = {
    host: env("DATABASE_HOST"),
    port: env.int("DATABASE_PORT", 5432),
    database: env("DATABASE_NAME"),
    user: env("DATABASE_USERNAME"),
    password: env("DATABASE_PASSWORD"),
    ssl: env.bool("DATABASE_SSL") ? { rejectUnauthorized: false } : false,
  };

  return {
    connection: {
      client: "postgres",
      connection: baseConnection,
      pool: {
        min: 2,
        max: parseInt(env("DATABASE_POOL_MAX") || "20", 10),
        idleTimeoutMillis: parseInt(env("DATABASE_POOL_IDLE_TIMEOUT") || "30000", 10),
        createTimeoutMillis: parseInt(env("DATABASE_POOL_CONNECT_TIMEOUT") || "10000", 10),
      },
      acquireConnectionTimeout: parseInt(env("DATABASE_CONNECTION_TIMEOUT") || "10000", 10),
    },
  };
};
