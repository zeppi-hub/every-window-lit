// Downloads the public data the season is baked from into data/raw/ (not
// committed), one folder per source, and records each file's URL, size,
// sha256 and download time in data/raw/manifest.json.
//
//   node scripts/fetch-data.mjs power      one source, by name
//   node scripts/fetch-data.mjs            all sources; the bake's tier checks
//                                          can stop on refreshed series, and
//                                          ISTAT has answered HTTP 500 to it
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
  {
    name: 'weather-baseline',
    file: 'nasa-power-naples-1991-2020.csv',
    // The same point, 1991–2020: the calendar-day percentiles the weather weeks are measured against.
    url: 'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,WS10M_MAX&community=AG&longitude=14.291&latitude=40.884&start=19910101&end=20201231&format=CSV',
  },
  {
    name: 'ems',
    file: 'copernicus-ems-activations.json',
    // Copernicus Emergency Management Service rapid-mapping activations: a weather week is never within 7 days of one in Italy.
    url: 'https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=1000',
  },
  {
    name: 'fuel-us',
    file: 'eia-weekly-regular-gasoline.html',
    // EIA, weekly U.S. regular all formulations retail gasoline prices, $/gal: the page with the full history (series EMM_EPMR_PTE_NUS_DPG).
    url: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EMM_EPMR_PTE_NUS_DPG&f=W',
  },
  {
    name: 'power-us',
    file: 'eia-mer-t09-08.csv',
    // EIA Monthly Energy Review, table 9.8: average electricity prices; the residential series is ESRCUUS, cents per kWh with taxes.
    url: 'https://www.eia.gov/totalenergy/data/browser/csv.php?tbl=T09.08',
  },
  {
    name: 'food-us',
    file: 'bls-cuur0000saf11.json',
    // BLS CPI-U, food at home, U.S. city average, not seasonally adjusted. The API takes the years only by POST; by GET it answers the last three.
    url: 'https://api.bls.gov/publicAPI/v1/timeseries/data/',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesid: ['CUUR0000SAF11'], startyear: '2022', endyear: '2026' }),
  },
  {
    name: 'food-es',
    file: 'eurostat-hicp-cp01-es.csv',
    // Eurostat HICP monthly index (prc_hicp_minr, 2015 = 100), food and non-alcoholic beverages, Spain, not seasonally adjusted.
    url: 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/3.0/data/dataflow/ESTAT/prc_hicp_minr/1.0/M.I15.CP01.ES?format=csvdata&compress=false&startPeriod=2022-01',
  },
  {
    name: 'fema',
    file: 'fema-declarations.csv',
    // OpenFEMA, one row per federal declaration since November 2022: a US week is checked against these before it is picked.
    url: `https://www.fema.gov/api/open/v1/FemaWebDisasterDeclarations?${new URLSearchParams({ $filter: "declarationDate ge '2022-11-01T00:00:00.000z'", $format: 'csv', $top: '2000' })}`,
  },
];

async function fetchOne(source) {
  const response = await fetch(source.url, {
    method: source.method ?? 'GET',
    body: source.body,
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
