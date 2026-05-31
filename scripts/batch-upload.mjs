/**
 * Batch upload all GLB files from FULL-CATALOG to Vercel Blob + Google Sheets.
 * Usage: node scripts/batch-upload.mjs
 *
 * Required env vars (put in .env.local):
 *   BLOB_READ_WRITE_TOKEN
 *   GOOGLE_PROJECT_ID, GOOGLE_PRIVATE_KEY_ID, GOOGLE_PRIVATE_KEY,
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_CLIENT_ID, GOOGLE_SHEET_ID
 *   BASE_URL  (optional, defaults to https://newfurniture.live)
 */

import { put } from '@vercel/blob';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env.local / .env into process.env
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(join(ROOT, '.env.local'));
loadEnvFile(join(ROOT, '.env'));

const BASE_URL = (process.env.BASE_URL || 'https://furnitech-alpha.vercel.app').replace(/\/+$/, '');
const CATALOG_DIR = join(ROOT, 'FULL-CATALOG');

// Recursively collect all .glb file paths
function collectGlb(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectGlb(full));
    } else if (extname(entry).toLowerCase() === '.glb') {
      results.push(full);
    }
  }
  return results;
}

const limitArg = process.argv.indexOf('--limit');
const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : null;

let files = collectGlb(CATALOG_DIR);
if (limit) files = files.slice(0, limit);
console.log(`\nFound ${files.length} GLB files${limit ? ` (limited to ${limit})` : ''} in FULL-CATALOG\n`);

const rows = [];
const errors = [];

for (let i = 0; i < files.length; i++) {
  const filePath = files[i];
  const filename = basename(filePath);
  const modelName = basename(filePath, extname(filename));

  process.stdout.write(`[${i + 1}/${files.length}] ${filename} ... `);

  try {
    const buffer = readFileSync(filePath);

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'model/gltf-binary',
      addRandomSuffix: true,
    });

    const arUrl  = `${BASE_URL}/ar?url=${encodeURIComponent(blob.url)}`;
    const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(arUrl)}&size=300x300`;

    rows.push([modelName, modelName, arUrl, qrUrl]);
    if (rows.length === 1) console.log(`    blob: ${blob.url}`)
    console.log('✓');
  } catch (err) {
    errors.push({ file: filename, error: err.message });
    console.log(`✗  ${err.message}`);
  }
}

console.log(`\n── Upload complete: ${rows.length} ok, ${errors.length} failed ──`);

if (rows.length === 0) {
  console.log('Nothing to write to Sheets.');
  process.exit(errors.length > 0 ? 1 : 0);
}

console.log(`\nWriting ${rows.length} rows to Google Sheets ...`);

const { sheetsClient } = await import('../lib/google-sheets.js');
await sheetsClient.initialize();
const result = await sheetsClient.appendRows('Sheet1!A:D', rows);

if (result.success) {
  console.log(`✓ Appended ${rows.length} rows (${result.updatedRows} rows updated)\n`);
} else {
  console.error('✗ Sheets error:', result.error);
  process.exit(1);
}

if (errors.length > 0) {
  console.log('Failed files:');
  for (const e of errors) console.log(`  ✗ ${e.file}: ${e.error}`);
}

console.log('\nDone.');
