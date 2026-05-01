const { handleUpload } = require("@vercel/blob/client");

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
    const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;

    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["model/gltf-binary", "application/octet-stream"],
        maximumSizeInBytes: 200 * 1024 * 1024,
        // explicit callbackUrl — required for a valid token
        callbackUrl: `${baseUrl}/api/blob-token`,
      }),
      onUploadCompleted: async () => {
        // Vercel calls this after upload — just ack, finalize handles QR+Sheets
      },
    });

    return res.json(result);
  } catch (err) {
    console.error("blob-token error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
