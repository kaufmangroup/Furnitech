const { put } = require("@vercel/blob");
const multiparty = require("multiparty");
const fs = require("fs");
const { generateQR } = require("../lib/qr-generator.js");

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form({ maxFilesSize: 100 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { fields, files } = await parseForm(req);

    const name = fields.name?.[0]?.trim();
    const sku = fields.sku?.[0]?.trim();
    const file = files.file?.[0];

    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!sku) return res.status(400).json({ error: "SKU is required" });
    if (!file) return res.status(400).json({ error: "GLB file is required" });

    const fileBuffer = fs.readFileSync(file.path);

    // Upload to Vercel Blob (server-side — no CORS)
    const blob = await put(file.originalFilename || "model.glb", fileBuffer, {
      access: "public",
      contentType: "model/gltf-binary",
      addRandomSuffix: true,
    });

    const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
    const arUrl = `${baseUrl}/ar?url=${encodeURIComponent(blob.url)}`;

    // Generate QR SVG
    const qrResult = await generateQR(arUrl, { format: "svg", size: 256 });
    if (!qrResult.success)
      return res.status(500).json({ error: "QR generation failed" });
    const qrSvg = qrResult.data.qr_code;

    // Append to Google Sheets
    const { sheetsClient } = await import("../lib/google-sheets.js");
    await sheetsClient.initialize();
    const sheetsResult = await sheetsClient.appendRows("Sheet1!A:D", [
      [name, sku, arUrl, qrSvg],
    ]);
    if (!sheetsResult.success)
      throw new Error("Sheets append failed: " + sheetsResult.error);

    return res.status(200).json({ success: true, arUrl, qrSvg });
  } catch (err) {
    console.error("upload error:", err.message);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
};
