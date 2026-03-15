"use strict";

/**
 * Storage abstraction - provider pattern.
 * Soportar: Cloudinary (actual), S3 compatible.
 * API: uploadFile(), downloadFile(), deleteFile()
 */

const PROVIDERS = {
  cloudinary: "./providers/cloudinary",
  s3: "./providers/s3",
};

let providerInstance = null;

function getProvider() {
  if (providerInstance) return providerInstance;
  const name = process.env.STORAGE_PROVIDER || "cloudinary";
  const Provider = require(PROVIDERS[name] || PROVIDERS.cloudinary);
  providerInstance = Provider.create();
  return providerInstance;
}

async function uploadFile(options) {
  const { buffer, filename, folder, contentType } = options;
  return getProvider().uploadFile({ buffer, filename, folder, contentType });
}

async function downloadFile(keyOrUrl) {
  return getProvider().downloadFile(keyOrUrl);
}

async function deleteFile(keyOrUrl) {
  return getProvider().deleteFile(keyOrUrl);
}

module.exports = {
  getProvider,
  uploadFile,
  downloadFile,
  deleteFile,
};
