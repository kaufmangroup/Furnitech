import { handleUpload } from "@vercel/blob/client";

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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const body = await readBody(req);
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["model/gltf-binary", "application/octet-stream"],
        maximumSizeInBytes: 200 * 1024 * 1024,
      }),
    });
    return res.json(result);
  } catch (err) {
    console.error("blob-token error:", err);
    return res.status(400).json({ error: err.message });
  }
}
