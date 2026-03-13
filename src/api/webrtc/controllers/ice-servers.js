"use strict";

const HEYDOCTOR_TURN_HOST = "turn.heydoctor.health";

module.exports = {
  async getIceServers(ctx) {
    const iceServers = [
      { urls: ["stun:stun.l.google.com:19302"] },
      { urls: [`stun:${HEYDOCTOR_TURN_HOST}:3478`] },
    ];

    const heydoctorUser = process.env.TURN_HEYDOCTOR_USERNAME;
    const heydoctorCred = process.env.TURN_HEYDOCTOR_CREDENTIAL;
    const twilioUser = process.env.TURN_USERNAME;
    const twilioPass = process.env.TURN_PASSWORD;

    if (heydoctorUser && heydoctorCred) {
      iceServers.push(
        { urls: `turn:${HEYDOCTOR_TURN_HOST}:3478?transport=udp`, username: heydoctorUser, credential: heydoctorCred },
        { urls: `turn:${HEYDOCTOR_TURN_HOST}:3478?transport=tcp`, username: heydoctorUser, credential: heydoctorCred },
        { urls: `turns:${HEYDOCTOR_TURN_HOST}:5349`, username: heydoctorUser, credential: heydoctorCred }
      );
    }

    if (twilioUser && twilioPass) {
      iceServers.push({
        urls: [
          "turn:global.turn.twilio.com:3478?transport=udp",
          "turn:global.turn.twilio.com:3478?transport=tcp",
          "turns:global.turn.twilio.com:5349?transport=tcp",
        ],
        username: twilioUser,
        credential: twilioPass,
      });
    }

    ctx.send({ iceServers });
  },
};
