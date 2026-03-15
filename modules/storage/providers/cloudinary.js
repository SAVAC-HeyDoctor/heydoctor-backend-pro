"use strict";

const cloudinary = require("cloudinary").v2;

function create() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
  });

  return {
    async uploadFile({ buffer, filename, folder = "", contentType }) {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: folder || undefined,
            resource_type: "auto",
            public_id: filename?.replace(/\.[^.]+$/, "") || undefined,
          },
          (err, result) => {
            if (err) return reject(err);
            resolve({
              url: result.secure_url,
              key: result.public_id,
              provider: "cloudinary",
            });
          }
        );
        uploadStream.end(buffer);
      });
    },

    async downloadFile(keyOrUrl) {
      const isUrl = typeof keyOrUrl === "string" && keyOrUrl.startsWith("http");
      if (isUrl) {
        const res = await fetch(keyOrUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        return buf;
      }
      const url = cloudinary.url(keyOrUrl);
      const res = await fetch(url);
      return Buffer.from(await res.arrayBuffer());
    },

    async deleteFile(keyOrUrl) {
      const key = typeof keyOrUrl === "string" && keyOrUrl.startsWith("http")
        ? keyOrUrl.split("/").slice(-2).join("/").replace(/\.[^.]+$/, "")
        : keyOrUrl;
      return cloudinary.uploader.destroy(key);
    },
  };
}

module.exports = { create };
