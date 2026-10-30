// Downloads the public data the season is baked from into data/raw/ (not
// committed), one folder per source, and records each file's URL, size,
// sha256 and download time in data/raw/manifest.json.
//
//   node scripts/fetch-data.mjs            all sources
//   node scripts/fetch-data.mjs power      just one
//
// Then: node scripts/bake-season.mjs
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');

/** Every file the bake reads. Licences and attribution are in CREDITS.md. */
export const SOURCES = [
  {
    name: 'fuel',
    file: 'weekly-fuel-prices.csv',
    // MASE (Ministry of the Environment and Energy Security), weekly national average prices since 2005, English CSV.
    url: 'https://sisen.mase.gov.it/dgsaie/api/v1/weekly-prices/report/export?format=CSV&lang=en',
  },
  {
    name: 'power',
    file: 'ember-daily.csv',
    url: 'https://files.ember-energy.org/public-downloads/price/outputs/european_wholesale_electricity_price_data_daily.csv',
  },
  {
    name: 'food',
    file: 'istat-nic-foodhpc.csv',
    // ISTAT NIC, all bases, ECOICOP 2: the "carrello della spesa" (FOODHPC), Italy, monthly. One request: the service is slow and rate-limited.
    url: 'https://esploradati.istat.it/SDMXWS/rest/data/167_745_DF_DCSP_NIC1B2025_6/M.IT...FOODHPC?startPeriod=2022-12',
    headers: { Accept: 'application/vnd.sdmx.data+csv;version=1.0.0' },
  },
  {
    name: 'weather',
    file: 'nasa-power-naples.csv',
    // NASA POWER daily point data near Naples: highest and lowest temperature, rain, strongest wind.
    url: 'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,WS10M_MAX&community=AG&longitude=14.291&latitude=40.884&start=20230101&end=20261031&format=CSV',
  },
];

async function fetchOne(source) {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'every-window-lit season bake (data reuse with attribution)', ...(source.headers ?? {}) },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status} for ${source.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const folder = join(RAW, source.name);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, source.file), bytes);
  return {
    name: source.name,
    file: `${source.name}/${source.file}`,
    url: source.url,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fetched: new Date().toISOString(),
  };
}

const only = process.argv[2];
const manifestPath = join(RAW, 'manifest.json');
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  manifest = {};
}
await mkdir(RAW, { recursive: true });
// The manifest is written after each file, so it always matches what is on disk even if a later source fails.
for (const source of SOURCES) {
  if (only != null && source.name !== only) continue;
  const entry = await fetchOne(source);
  manifest[source.name] = entry;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${entry.file}: ${entry.bytes} bytes, sha256 ${entry.sha256.slice(0, 12)}…`);
}
