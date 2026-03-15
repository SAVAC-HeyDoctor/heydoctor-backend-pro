"use strict";

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

function create() {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  const region = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
  const endpoint = process.env.S3_ENDPOINT;
  const forcePathStyle = !!process.env.S3_FORCE_PATH_STYLE;

  const client = new S3Client({
    region,
    ...(endpoint && {
      endpoint,
      forcePathStyle,
    }),
  });

  return {
    async uploadFile({ buffer, filename, folder = "", contentType }) {
      const key = folder ? `${folder.replace(/\/$/, "")}/${filename}` : filename;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );
      const url = endpoint
        ? `${endpoint}/${bucket}/${key}`
        : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      return { url, key, provider: "s3" };
    },

    async downloadFile(keyOrUrl) {
      let key = keyOrUrl;
      if (typeof keyOrUrl === "string" && keyOrUrl.startsWith("http")) {
        const match = keyOrUrl.match(new RegExp(`/${bucket}/(.+)$`));
        key = match ? match[1] : keyOrUrl;
      }
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      const chunks = [];
      for await (const chunk of res.Body) chunks.push(chunk);
      return Buffer.concat(chunks);
    },

    async deleteFile(keyOrUrl) {
      let key = keyOrUrl;
      if (typeof keyOrUrl === "string" && keyOrUrl.startsWith("http")) {
        const match = keyOrUrl.match(new RegExp(`/${bucket}/(.+)$`));
        key = match ? match[1] : keyOrUrl;
      }
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return {};
    },
  };
}

module.exports = { create };
