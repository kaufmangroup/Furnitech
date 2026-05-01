import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { generateQR } = require("../lib/qr-generator.js");

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
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { name, sku, blobUrl } = await readBody(req);

    if (!name || !sku || !blobUrl) {
      return res
        .status(400)
        .json({ error: "name, sku and blobUrl are required" });
    }

    const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
    const arUrl = `${baseUrl}/ar?url=${encodeURIComponent(blobUrl)}`;

    const qrResult = await generateQR(arUrl, { format: "svg", size: 256 });
    if (!qrResult.success) {
      return res.status(500).json({ error: "QR generation failed" });
    }
    const qrSvg = qrResult.data.qr_code;

    const { sheetsClient } = await import("../lib/google-sheets.js");
    await sheetsClient.initialize();
    await sheetsClient.appendRows("Sheet1!A:D", [[name, sku, arUrl, qrSvg]]);

    return res.status(200).json({ success: true, arUrl, qrSvg });
  } catch (err) {
    console.error("finalize error:", err);
    return res.status(500).json({ error: err.message || "Failed" });
  }
}
