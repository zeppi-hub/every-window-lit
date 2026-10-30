// Bakes Season 1 from the raw public data in data/raw/ (scripts/fetch-data.mjs)
// into src/season/season.json, the only data the game ships, and writes
// data/season-report.md for a person to read the chosen weeks before they ship.
//
//   node scripts/bake-season.mjs
//
// Each series becomes a list of periods (ISO weeks, or months for a monthly
// series) with the real % change on the previous period. Each change gets a
// tier against the series' own spread of changes since January 2023. Twelve
// periods, chosen by hand in the slot table below, become the season.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'src', 'season', 'season.json');
const REPORT = join(ROOT, 'data', 'season-report.md');

/** The data window: periods starting from this day count, for picking and for the tiers. */
const WINDOW_START = '2023-01-01';
/** Read this far before the window too, so its first periods have changes and a few before them. */
const LEAD_IN = addDays(WINDOW_START, -56);

/**
 * Weeks never picked as ordinary price weeks: real disasters with loss of
 * life on the mainland and the weeks around them, and price shocks tied to
 * wars. The May 2023 floods come back only as the solidarity week
 * (META_VR_FIKIR.md §19), never as prices.
 */
const EXCLUDE = [
  ['2023-04-24', '2023-05-28', 'Emilia-Romagna floods, May 2023 (only as the solidarity week)'],
  ['2023-07-17', '2023-07-30', 'July 2023 heat and storms in the north, with deaths'],
  ['2023-10-30', '2023-11-12', 'Tuscany floods, 2-3 Nov 2023'],
  ['2024-09-16', '2024-09-29', 'Storm Boris, Emilia-Romagna, Sep 2024'],
  ['2024-10-14', '2024-10-27', 'Emilia-Romagna floods, Oct 2024 (never picked)'],
  ['2026-09-07', '2026-09-20', 'Storms of 10 Sep 2026, with deaths'],
  // Price shocks around wars or a cause not yet checked: left out until a person has looked.
  ['2025-06-09', '2025-06-29', 'Oil spike during the June 2025 Israel-Iran war'],
  ['2026-03-01', '2026-05-31', 'Spring 2026 fuel shock, cause not checked'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- dates

function toDate(iso) {
  return new Date(`${iso}T00:00:00Z`);
}
function iso(date) {
  return date.toISOString().slice(0, 10);
}
function addDays(isoDay, days) {
  const d = toDate(isoDay);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
/** The Monday of the ISO week a day falls in. */
function mondayOf(isoDay) {
  const d = toDate(isoDay);
  const weekday = (d.getUTCDay() + 6) % 7;
  return addDays(isoDay, -weekday);
}
/** "Mar 2024" for a day. */
function monthLabel(isoDay) {
  const d = toDate(isoDay);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------- series

/**
 * Daily values to ISO weeks, Monday to Sunday: the mean of the days present.
 * A week needs at least five days; the last week counts only when complete.
 * The week's month is its Thursday's, as ISO weeks are numbered.
 */
function weeklyFromDaily(days) {
  const byWeek = new Map();
  for (const { day, value } of days) {
    const monday = mondayOf(day);
    const week = byWeek.get(monday) ?? { start: monday, sum: 0, n: 0 };
    week.sum += value;
    week.n += 1;
    byWeek.set(monday, week);
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.start.localeCompare(b.start));
  const last = weeks.at(-1);
  if (last != null && last.n < 7) weeks.pop();
  return weeks
    .filter((w) => w.n >= 5)
    .map((w) => ({ start: w.start, month: monthLabel(addDays(w.start, 3)), value: w.sum / w.n, days: w.n }));
}

/** Adds each period's % change on the one before, one decimal. */
function withChanges(periods) {
  return periods.map((p, i) => {
    const previous = periods[i - 1];
    const change = previous == null ? null : Math.round(((p.value / previous.value - 1) * 100) * 10) / 10;
    return { ...p, change };
  });
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/**
 * Tiers against the series' own spread since the window start: by the size
 * of the change, calm below the 40th percentile; rises small to the 70th,
 * medium to the 90th, large beyond; falls past calm ease the town (-1).
 */
function tiered(periods) {
  const inWindow = periods.filter((p) => p.change != null && p.start >= WINDOW_START);
  const sizes = inWindow.map((p) => Math.abs(p.change)).sort((a, b) => a - b);
  const bounds = { calm: quantile(sorted(sizes), 0.4), small: quantile(sizes, 0.7), medium: quantile(sizes, 0.9) };
  const tierOf = (change) => {
    const size = Math.abs(change);
    if (size < bounds.calm || change === 0) return 0;
    if (change < 0) return -1;
    if (size < bounds.small) return 1;
    if (size < bounds.medium) return 2;
    return 3;
  };
  return { bounds, periods: periods.map((p) => ({ ...p, tier: p.change == null ? null : tierOf(p.change) })) };
}
function sorted(values) {
  return [...values].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- sources

async function raw(name, file) {
  return readFile(join(RAW, name, file), 'utf8');
}

/** Ember daily day-ahead wholesale prices, Italy, EUR/MWh. */
async function powerSeries() {
  const text = await raw('power', 'ember-daily.csv');
  const days = [];
  for (const line of text.split('\n').slice(1)) {
    const [, code, day, price] = line.split(',');
    if (code !== 'ITA' || day == null || price == null || price === '') continue;
    if (day < LEAD_IN) continue;
    days.push({ day, value: Number(price) });
  }
  return { kind: 'power', monthly: false, unit: 'EUR/MWh', periods: withChanges(weeklyFromDaily(days)) };
}

/** Splits one CSV line, keeping quoted fields (with their thousands commas) whole. */
function csvCells(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/**
 * The ministry's weekly national average pump prices, with taxes, in euro
 * per 1,000 litres: Euro-super 95 petrol and diesel. Each survey date is a
 * Monday reporting the week before it (Monday to Sunday), so the period
 * starts seven days earlier. The game's "pump prices" are the plain mean
 * of the two fuels. Tax rates are those in force on the survey day, so a
 * tax change can show in the week before it took effect.
 */
async function fuelSeries() {
  const text = await raw('fuel', 'weekly-fuel-prices.csv');
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const names = csvCells(header);
  const at = (name) => names.indexOf(name);
  const date = at('SURVEY_DATE');
  const petrol = at('EURO-SUPER_95');
  const diesel = at('AUTOMOTIVE_GAS_OIL');
  if (date < 0 || petrol < 0 || diesel < 0) throw new Error(`fuel: unexpected header ${header}`);
  const number = (cell) => Number(cell.replace(/,/g, ''));
  const weeks = [];
  for (const row of rows) {
    const cells = csvCells(row);
    const day = cells[date];
    const value = (number(cells[petrol]) + number(cells[diesel])) / 2;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(value) || day < LEAD_IN) continue;
    // The Monday-to-Sunday week that ends before the survey day (one survey is dated Sunday 1 Jan 2023).
    const start = mondayOf(addDays(day, -1));
    if (weeks.length > 0 && weeks[weeks.length - 1].start === start) weeks.pop();
    weeks.push({ start, month: monthLabel(addDays(start, 3)), value, days: 1 });
  }
  weeks.sort((a, b) => a.start.localeCompare(b.start));
  return { kind: 'fuel', monthly: false, unit: 'EUR per 1,000 litres', periods: withChanges(weeks) };
}

/**
 * ISTAT NIC "carrello della spesa" (food, home and personal-care goods),
 * Italy: the published % change on the previous month (MEASURE 6), which
 * ISTAT links across the January 2026 base change. Provisional months
 * (OBS_STATUS p, the flash) are left out until they are final.
 */
async function foodSeries() {
  const text = await raw('food', 'istat-nic-foodhpc.csv');
  const [header, ...rows] = text.trim().split('\n');
  const col = Object.fromEntries(header.split(',').map((name, i) => [name.trim(), i]));
  const periods = [];
  for (const row of rows) {
    const cells = row.split(',');
    if (cells[col.MEASURE] !== '6' || cells[col.REF_AREA] !== 'IT' || cells[col.ECOICOP_2] !== 'FOODHPC') continue;
    if (cells[col.OBS_STATUS] === 'p') continue;
    const month = cells[col.TIME_PERIOD];
    const change = Number(cells[col.OBS_VALUE]);
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(change)) continue;
    const start = `${month}-01`;
    periods.push({ start, month: monthLabel(start), change: Math.round(change * 10) / 10 });
  }
  periods.sort((a, b) => a.start.localeCompare(b.start));
  return { kind: 'food', monthly: true, unit: '% on the previous month', periods };
}

// ---------------------------------------------------------------- picking

/**
 * The season, chosen by hand from the tiered periods (data/raw/season-candidates.json):
 * the kind of week, the real period and the tier it was chosen for. About
 * five fuel, four power and three food weeks; the first is a big rise at
 * the pumps, the same for everyone. The years are mixed so the season is
 * not one long trend, and the tiers rise and fall so the town breathes.
 * The bake stops if a period is missing, has moved tier on a re-bake, or
 * falls in an excluded window.
 */
const SLOTS = [
  { kind: 'fuel', start: '2023-01-02', tier: 3 },
  { kind: 'power', start: '2024-03-25', tier: 0 },
  { kind: 'fuel', start: '2023-11-13', tier: -1 },
  { kind: 'food', start: '2025-08-01', tier: 1 },
  { kind: 'power', start: '2024-04-15', tier: 3 },
  { kind: 'fuel', start: '2024-02-12', tier: 2 },
  { kind: 'power', start: '2024-06-10', tier: -1 },
  { kind: 'food', start: '2023-03-01', tier: 2 },
  { kind: 'fuel', start: '2024-07-01', tier: 1 },
  { kind: 'power', start: '2026-01-05', tier: 2 },
  { kind: 'fuel', start: '2023-07-31', tier: 3 },
  { kind: 'food', start: '2025-12-01', tier: 0 },
];

/** The last day of the month a day falls in. */
function monthEnd(isoDay) {
  const d = toDate(isoDay);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

function excluded(start, monthly) {
  const end = monthly ? monthEnd(start) : addDays(start, 6);
  return EXCLUDE.find(([from, to]) => !(end < from || start > to)) ?? null;
}

function pick(series) {
  return SLOTS.map((slot, index) => {
    const s = series[slot.kind];
    if (s == null) return null;
    const at = s.periods.findIndex((p) => p.start === slot.start);
    const period = s.periods[at];
    const next = s.periods[at + 1];
    const where = `slot ${index + 1} (${slot.kind} ${slot.start})`;
    if (period == null || period.change == null || next == null) throw new Error(`${where}: period, its change or the next period is missing`);
    if (period.tier !== slot.tier) throw new Error(`${where}: tier is now ${period.tier}, chosen as ${slot.tier}`);
    const hit = excluded(period.start, s.monthly);
    if (hit != null) throw new Error(`${where}: in an excluded window, ${hit[2]}`);
    return {
      kind: slot.kind,
      start: period.start,
      month: period.month,
      monthly: s.monthly,
      change: period.change,
      tier: period.tier,
      next: next.change,
      before: s.periods.slice(Math.max(0, at - 4), at).filter((p) => p.change != null).map((p) => p.change),
    };
  });
}

// ---------------------------------------------------------------- main

const series = {};
for (const make of [fuelSeries, powerSeries, foodSeries]) {
  const s = await make();
  const { bounds, periods } = tiered(s.periods);
  series[s.kind] = { ...s, bounds, periods };
}
// Every period with its tier, for choosing the slots by hand (not committed).
await writeFile(join(RAW, 'season-candidates.json'), JSON.stringify(series));
const weeks = pick(series);
if (weeks.some((w) => w == null)) {
  console.log('Not every kind is baked yet; season.json not written.');
  for (const [kind, s] of Object.entries(series)) {
    console.log(kind, s.periods.length, 'periods', s.periods[0]?.start, '…', s.periods.at(-1)?.start, 'bounds', s.bounds);
  }
  process.exit(0);
}

let manifest = {};
try {
  manifest = JSON.parse(await readFile(join(RAW, 'manifest.json'), 'utf8'));
} catch {
  manifest = {};
}
const season = { country: 'Italy', weeks };
const json = `${JSON.stringify(season, null, 1)}\n`;
await writeFile(OUT, json);

const lines = [
  '# Season 1 weeks (baked)',
  '',
  'Written by scripts/bake-season.mjs. Read before shipping: no week should sit on a real tragedy.',
  '',
  '| Week | Kind | Real period | Change | Tier | Next | Before |',
  '|---|---|---|---|---|---|---|',
  ...weeks.map((w, i) => `| ${i + 1} | ${w.kind} | ${w.monthly ? w.month : `${w.start} (${w.month})`} | ${w.change}% | ${w.tier} | ${w.next}% | ${w.before.join(', ')} |`),
  '',
  '## Tiers per series',
  '',
  ...Object.values(series).map((s) => `- ${s.kind}: calm below ${s.bounds.calm.toFixed(2)}%, small below ${s.bounds.small.toFixed(2)}%, medium below ${s.bounds.medium.toFixed(2)}%, large above (${s.periods.filter((p) => p.start >= WINDOW_START).length} periods since ${WINDOW_START}).`),
  '',
  '## Never picked as price weeks',
  '',
  ...EXCLUDE.map(([from, to, why]) => `- ${from} to ${to}: ${why}`),
  '',
  '## Raw files',
  '',
  ...Object.values(manifest).map((m) => `- ${m.file}: ${m.bytes} bytes, sha256 ${m.sha256}, fetched ${m.fetched}, ${m.url}`),
  '',
  `season.json sha256 ${createHash('sha256').update(json).digest('hex')}`,
  '',
];
await writeFile(REPORT, lines.join('\n'));
console.log(`Wrote ${OUT} (${json.length} bytes) and ${REPORT}.`);
