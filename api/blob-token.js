// CommonJS - avoids any ESM/subpath import issues
const {
  generateClientTokenFromReadWriteToken,
} = require("@vercel/blob/client");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const body = await readBody(req);
    const pathname = body?.payload?.pathname ?? "model.glb";

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });
    }

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname,
      allowedContentTypes: ["model/gltf-binary", "application/octet-stream"],
      maximumSizeInBytes: 200 * 1024 * 1024,
      validUntil: Date.now() + 60 * 60 * 1000,
    });

    return res.json({ type: "blob.generate-client-token", clientToken });
  } catch (err) {
    console.error("blob-token error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
