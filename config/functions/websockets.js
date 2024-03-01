"use strict";

const { Server } = require("socket.io");
const { verify } = require("jsonwebtoken");

const Redis = require("ioredis");
const redisClient = new Redis();

const verifyApiToken = async (apiToken) => {
  try {
    // Query Strapi's database to verify the API token
    const tokenRecord = await strapi.db
      .query("api-token")
      .findOne({ token: apiToken });

    // If a token record is found and it's active, return true
    return tokenRecord && tokenRecord.active;
  } catch (error) {
    console.error("Error verifying API token:", error);
    return false;
  }
};

const findSocketConnection = async (userID) => {
  try {
    const user = await strapi.db
      .query("api::connection.connection")
      .findOne({ where: { userID: userID } });
    return [user, null];
  } catch (error) {
    console.log(error);
    return [null, error];
  }
};

const createSocketConnection = async (userID, socketID) => {
  try {
    await strapi.db.query("api::connection.connection").create({
      data: {
        userID: userID,
        socketID: socketID,
        isConnected: true,
      },
    });
  } catch (error) {
    console.log(error);
  }
};

const disconnectSocketConnection = async (socketID) => {
  try {
    const connection = await strapi.db
      .query("api::connection.connection")
      .findOne({ where: { socketID: socketID } });
    if (connection && connection.isConnected) {
      await strapi.db.query("api::connection.connection").update({
        where: { socketID: socketID },
        data: { socketID: null, isConnected: false },
      });
    }
  } catch (error) {
    console.log(error);
  }
};

const connectSocketConnection = async (userID, socketID) => {
  try {
    await strapi.db.query("api::connection.connection").update({
      where: { userID: userID },
      data: { socketID: socketID, isConnected: true },
    });
  } catch (error) {
    console.log(error);
  }
};

const socketHandler = async (socket) => {
  const socketID = socket.id;
  socket.on("disconnect", async () => {
    try {
      await disconnectSocketConnection(socketID);
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("join", async (data) => {
    const userID = data.userID;
    try {
      const [user, errorUser] = await findSocketConnection(userID);
      if (errorUser !== null) {
        console.log(errorUser);
        return;
      }
      if (user) await connectSocketConnection(userID, socketID);
      else await createSocketConnection(userID, socketID);
      return;
    } catch (error) {
      console.log(error);
      return;
    }
  });
};

const initialize = async (strapi) => {
  const httpServer = strapi.server.httpServer;
  let io;
  if (process.env.NODE_ENV === "production") {
    io = new Server(httpServer, {
      cors: {
        // cors setup
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true,
      },
    });
  } else {
    io = new Server(httpServer, {
      cors: {
        // cors setup
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true,
      },
      adapter: require("socket.io-redis")({
        pubClient: redisClient,
        subClient: redisClient.duplicate(),
      }),
    });
  }

  io.on("connection", socketHandler);

  // Logic to handle WebSocket connections
  // io.use(async (socket, next) => {
  //   try {
  //     // Extract API token from query parameter or Authorization header
  //     const apiToken =
  //       socket.handshake.query.api_token ||
  //       socket.handshake.headers.authorization;

  //     // Verify API token
  //     const isValidToken = await verifyApiToken(apiToken);

  //     if (isValidToken) {
  //       next();
  //     } else {
  //       throw new Error("Unauthorized");
  //     }
  //   } catch (error) {
  //     next(new Error("Unauthorized"));
  //   }
  // });

  // Attach the io instance to Strapi for global access
  strapi.io = io;

  console.info("WebSocket server initialized");
};

module.exports = {
  initialize,
  findSocketConnection,
};
