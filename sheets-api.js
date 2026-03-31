/**
 * sheets-api.js — Google Sheets API wrapper using native fetch (zero dependencies)
 *
 * Provides read/write access to Google Sheets using an API key.
 * NOTE: Writing via API key requires the sheet to be publicly editable,
 * OR you can use a Service Account. For now, we use the API key for reading
 * and can extend to OAuth/Service Account for writing.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load .env ───
function loadEnv() {
  const vars = {};
  try {
    const content = readFileSync(resolve(__dirname, '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  } catch {
    console.error('⚠️  Could not load .env file');
  }
  return vars;
}

const env = loadEnv();

// Support both .env file AND environment variables (env vars take precedence)
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY || env.GOOGLE_SHEETS_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || env.SPREADSHEET_ID || '1FD4AzAhPr0XffnxgmcSkZ7J2AdsDsSq1xsBsf-3FYkc';
const SHEET_NAME = process.env.SHEET_NAME || env.SHEET_NAME || 'biweeklyReport';

const BASE_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

// ─── READ: Fetch a range of cells ───
export async function readRange(range) {
  const url = `${BASE_URL}/values/${encodeURIComponent(range)}?key=${API_KEY}&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API read error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.values || [];
}

// ─── READ: Fetch multiple ranges in one call ───
export async function batchRead(ranges) {
  const rangeParams = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `${BASE_URL}/values:batchGet?${rangeParams}&key=${API_KEY}&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API batchRead error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.valueRanges || [];
}

// ─── WRITE: Update a single range ───
export async function writeRange(range, values) {
  const url = `${BASE_URL}/values/${encodeURIComponent(range)}?valueInputOption=RAW&key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API write error (${res.status}): ${err}`);
  }
  return await res.json();
}

// ─── WRITE: Batch update multiple ranges ───
export async function batchWrite(data) {
  const url = `${BASE_URL}/values:batchUpdate?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API batchWrite error (${res.status}): ${err}`);
  }
  return await res.json();
}

// ─── Utility exports ───
export { API_KEY, SPREADSHEET_ID, SHEET_NAME };
