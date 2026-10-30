// Weather episodes near Naples from NASA POWER daily data, for the season's
// weather weeks (META_VR_FIKIR.md §19, META_VR_AFET_ARASTIRMA.md §1.3).
// Rules follow the ETCCDI calendar-day percentiles against 1991–2020:
//
// - heat (June to September): at least 3 days in a row with the day's
//   highest temperature above that calendar day's 90th percentile and above 32 °C;
// - cold (November to March): at least 3 nights in a row below the 10th
//   percentile and below 3 °C;
// - storm (all year): a day with the strongest wind above the 99th
//   percentile of all days and above 60 km/h, or rain above the 99th
//   percentile and above 30 mm;
// - dry (April to October): the last 180 days' rain under 60% of the
//   1991–2020 average for the same 180 days.
//
// An episode's week is its first week over the line, not its most extreme.
import { readFile } from 'node:fs/promises';

const MS_TO_KMH = 3.6;
/** Naples' floors from the design: hotter than 32 °C by day, colder than 3 °C at night. */
export const HEAT_FLOOR = 32;
export const COLD_CEILING = 3;

/** Rows of { day: 'YYYY-MM-DD', tmax, tmin, rain, wind } from a POWER CSV, fill values dropped. */
export async function readPower(path) {
  const text = await readFile(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((line) => line.includes('-END HEADER-'));
  const header = lines[end + 1].split(',');
  const col = (name) => header.indexOf(name);
  const rows = [];
  for (const line of lines.slice(end + 2)) {
    const cells = line.split(',');
    if (cells.length < header.length) continue;
    const year = Number(cells[col('YEAR')]);
    const doy = Number(cells[col('DOY')]);
    const values = ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'WS10M_MAX'].map((name) => Number(cells[col(name)]));
    if (values.some((v) => !Number.isFinite(v) || v <= -998)) continue;
    const date = new Date(Date.UTC(year, 0, doy));
    rows.push({ day: date.toISOString().slice(0, 10), doy: dayOfYear(date), tmax: values[0], tmin: values[1], rain: values[2], wind: values[3] * MS_TO_KMH });
  }
  return rows;
}

/** Day of the year 1–365, with 29 February folded onto 28 February so the calendar lines up. */
function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  let doy = Math.floor((date.getTime() - start) / 864e5) + 1;
  const leap = new Date(Date.UTC(date.getUTCFullYear(), 1, 29)).getUTCMonth() === 1;
  if (leap && doy >= 60) doy -= 1;
  return doy;
}

function percentile(values, q) {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  return s[lo] + (s[Math.ceil(at)] - s[lo]) * (at - lo);
}

/** Calendar-day percentiles from the baseline, each over a window of ±7 days. */
function calendarPercentiles(baseline, field, q) {
  const byDoy = Array.from({ length: 366 }, () => []);
  for (const row of baseline) byDoy[row.doy].push(row[field]);
  const out = new Array(366).fill(NaN);
  for (let d = 1; d <= 365; d += 1) {
    const pool = [];
    for (let k = -7; k <= 7; k += 1) pool.push(...byDoy[((d - 1 + k + 365) % 365) + 1]);
    out[d] = percentile(pool, q);
  }
  return out;
}

const month = (day) => Number(day.slice(5, 7));

/** Runs of at least `length` consecutive days that pass `test`, each as its rows. */
function runs(rows, test, length) {
  const found = [];
  let current = [];
  for (const row of [...rows, null]) {
    if (row != null && test(row)) {
      current.push(row);
      continue;
    }
    if (current.length >= length) found.push(current);
    current = [];
  }
  return found;
}

/**
 * The episodes in `recent`, each { kind, day (first day over the line), label }.
 * Consecutive qualifying days merge into one episode.
 */
export function episodes(baseline, recent) {
  const p90max = calendarPercentiles(baseline, 'tmax', 0.9);
  const p10min = calendarPercentiles(baseline, 'tmin', 0.1);
  const wind99 = percentile(baseline.map((r) => r.wind), 0.99);
  const rain99 = percentile(baseline.map((r) => r.rain), 0.99);
  const found = [];

  for (const run of runs(recent, (r) => month(r.day) >= 6 && month(r.day) <= 9 && r.tmax > p90max[r.doy] && r.tmax > HEAT_FLOOR, 3)) {
    found.push({ kind: 'heat', day: run[0].day, days: run.length, peak: Math.round(Math.max(...run.map((r) => r.tmax))) });
  }
  for (const run of runs(recent, (r) => (month(r.day) >= 11 || month(r.day) <= 3) && r.tmin < p10min[r.doy] && r.tmin < COLD_CEILING, 3)) {
    found.push({ kind: 'cold', day: run[0].day, days: run.length, low: Math.round(Math.min(...run.map((r) => r.tmin))) });
  }
  let lastStorm = '';
  for (const r of recent) {
    const stormy = (r.wind > wind99 && r.wind > 60) || (r.rain > rain99 && r.rain > 30);
    if (!stormy) continue;
    // One storm per few days.
    if (lastStorm !== '' && (Date.parse(r.day) - Date.parse(lastStorm)) / 864e5 <= 3) {
      lastStorm = r.day;
      continue;
    }
    lastStorm = r.day;
    found.push({ kind: 'storm', day: r.day, wind: Math.round(r.wind), rain: Math.round(r.rain) });
  }

  // Dry spells: the 180-day rain total against the baseline's average for the same calendar window.
  const usual = new Array(366).fill(0);
  const years = new Set(baseline.map((r) => r.day.slice(0, 4))).size;
  for (const r of baseline) usual[r.doy] += r.rain / years;
  const window180 = (doy) => {
    let sum = 0;
    for (let k = 0; k < 180; k += 1) sum += usual[((doy - 1 - k + 365 * 2) % 365) + 1];
    return sum;
  };
  let inDry = false;
  recent.forEach((r, i) => {
    if (i < 179) return;
    let sum = 0;
    for (let k = 0; k < 180; k += 1) sum += recent[i - k].rain;
    const share = sum / window180(r.doy);
    const dry = month(r.day) >= 4 && month(r.day) <= 10 && share < 0.6;
    if (dry && !inDry) found.push({ kind: 'dry', day: r.day, share: Math.round(share * 100) });
    inDry = dry;
  });
  return found.sort((a, b) => a.day.localeCompare(b.day));
}
