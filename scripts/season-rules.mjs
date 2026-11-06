// The pure rules of the season bake (scripts/bake-season.mjs): dates, changes
// and tiers, the readers for each source's text, and the checks a slot must
// pass. Nothing here touches the disk, so tests/bake.test.mjs runs without
// data/raw/.

/** The data window: periods starting from this day count, for picking and for the tiers. */
export const WINDOW_START = '2023-01-01';

/** A week of wholesale power is picked only if it moved at most this much (%) ... */
export const WHOLESALE_MOVE_LIMIT = 30;
/** ... and its mean was at least this (EUR/MWh): "+268% this week" reads like a catastrophe. */
export const WHOLESALE_FLOOR = 30;
/** A calm week of German power: its own series calls moves up to ±11.6% calm, too big for a calm card. */
export const GERMAN_CALM_LIMIT = 4;
/** The hard weeks a season can hold: both ways of playing them stay even only up to here (META_VR_DEVIR2_TASLAK.md §5). */
export const MAX_HARD_WEEKS = 5;
/** A week is hard from this tier up (model.ts). */
export const HARD_TIER = 2;
/** FEMA declarations and incidents this close to a US period count against it. */
export const FEMA_DAYS = 7;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- dates

function toDate(isoDay) {
  return new Date(`${isoDay}T00:00:00Z`);
}
function iso(date) {
  return date.toISOString().slice(0, 10);
}
export function addDays(isoDay, days) {
  const d = toDate(isoDay);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
/** The Monday of the ISO week a day falls in. */
export function mondayOf(isoDay) {
  const d = toDate(isoDay);
  const weekday = (d.getUTCDay() + 6) % 7;
  return addDays(isoDay, -weekday);
}
/** "Mar 2024" for a day. */
export function monthLabel(isoDay) {
  const d = toDate(isoDay);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** The last day of the month a day falls in. */
export function monthEnd(isoDay) {
  const d = toDate(isoDay);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
/** The first day of the month after the one a day falls in. */
export function nextMonth(isoDay) {
  return addDays(monthEnd(isoDay), 1);
}
export const nextWeek = (isoDay) => addDays(isoDay, 7);
/** The last day of a period. */
export const periodEnd = (start, monthly) => (monthly ? monthEnd(start) : addDays(start, 6));

// ---------------------------------------------------------------- changes and tiers

/**
 * Adds each period's % change on the one before, one decimal. With `after`
 * (the start of the period that follows a given start), a period whose
 * predecessor is missing has no change: a hole in a series is not a move.
 */
export function withChanges(periods, after = null) {
  return periods.map((p, i) => {
    const previous = periods[i - 1];
    const follows = previous != null && (after == null || after(previous.start) === p.start);
    const change = follows ? Math.round(((p.value / previous.value - 1) * 100) * 10) / 10 : null;
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
 * `counts` narrows the periods the bounds are drawn from; every period
 * still gets a tier.
 */
export function tiered(periods, counts = () => true) {
  const inWindow = periods.filter((p) => p.change != null && p.start >= WINDOW_START && counts(p));
  const sizes = inWindow.map((p) => Math.abs(p.change)).sort((a, b) => a - b);
  const bounds = { calm: quantile(sizes, 0.4), small: quantile(sizes, 0.7), medium: quantile(sizes, 0.9) };
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

// ---------------------------------------------------------------- readers

/**
 * EIA's history page: a row for each month ("2023-Jan"), then pairs of
 * cells, "01/02" and "3.223". Each price is Monday morning's, so its change
 * is the week before that Monday, and the period starts seven days earlier,
 * as with the Italian ministry's survey.
 */
export function readEiaWeekly(html) {
  const rows = [];
  for (const [, row] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const year = row.match(/>(?:&nbsp;)*(\d{4})-[A-Z][a-z]{2}<\/td>/)?.[1];
    if (year == null) continue;
    for (const [, month, day, price] of row.matchAll(/>(\d{2})\/(\d{2})(?:&nbsp;)*<\/td>\s*<td[^>]*>(\d+\.\d+)(?:&nbsp;)*<\/td>/g)) {
      rows.push({ day: `${year}-${month}-${day}`, value: Number(price) });
    }
  }
  if (rows.length === 0) throw new Error('EIA weekly: no prices found on the page');
  return rows
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(({ day, value }) => {
      const start = addDays(mondayOf(day), -7);
      return { start, month: monthLabel(addDays(start, 3)), value, days: 1 };
    });
}

/** Splits one CSV line, keeping quoted fields whole. */
export function csvCells(line) {
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

/** Rows of a CSV with a header line, as objects. */
export function csvRows(text) {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const names = csvCells(header);
  return rows.map((row) => {
    const cells = csvCells(row);
    return Object.fromEntries(names.map((name, i) => [name, cells[i]]));
  });
}

const monthPeriod = (start, value) => ({ start, month: monthLabel(start), value });

/** A BLS API answer: months only (M13 is the year), and no month without a number (October 2025 was never collected). */
export function readBls(text) {
  const answer = JSON.parse(text);
  if (answer.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS: ${answer.status}`);
  const periods = [];
  for (const row of answer.Results.series[0].data) {
    const value = Number(row.value);
    if (!/^M(0[1-9]|1[0-2])$/.test(row.period) || !Number.isFinite(value)) continue;
    periods.push(monthPeriod(`${row.year}-${row.period.slice(1)}-01`, value));
  }
  return periods.sort((a, b) => a.start.localeCompare(b.start));
}

/** A Eurostat SDMX CSV of one series. Flagged values (estimated or provisional) are left out, as ISTAT's provisional months are. */
export function readEurostat(text) {
  const periods = [];
  for (const row of csvRows(text)) {
    const value = Number(row.OBS_VALUE);
    if (!/^\d{4}-\d{2}$/.test(row.TIME_PERIOD ?? '') || !Number.isFinite(value) || (row.OBS_FLAG ?? '') !== '') continue;
    periods.push(monthPeriod(`${row.TIME_PERIOD}-01`, value));
  }
  return periods.sort((a, b) => a.start.localeCompare(b.start));
}

/** OpenFEMA's declarations, one row each, dates as days. */
export function readFema(text) {
  const day = (stamp) => (stamp ?? '').slice(0, 10);
  return csvRows(text).map((row) => ({
    number: Number(row.disasterNumber),
    type: row.declarationType,
    state: row.stateCode,
    name: row.disasterName,
    incident: row.incidentType,
    declared: day(row.declarationDate),
    from: day(row.incidentBeginDate),
    to: day(row.incidentEndDate) || day(row.incidentBeginDate),
  }));
}

// ---------------------------------------------------------------- checks

/** The excluded window a period falls in, for its country, or null. A window without a country holds for every country. */
export function excludedBy(windows, start, monthly, country) {
  const end = periodEnd(start, monthly);
  return windows.find(([from, to, , where]) => (where == null || where === country) && !(end < from || start > to)) ?? null;
}

/** The first thing wrong with a slot's period by the rules, or null. */
export function ruleBreach(slot, period, series) {
  if (period.tier !== slot.tier) return `tier is now ${period.tier}, chosen as ${slot.tier}`;
  if (slot.kind === 'power') {
    if (Math.abs(period.change) > WHOLESALE_MOVE_LIMIT) return `wholesale power moved ${period.change}%, over the ${WHOLESALE_MOVE_LIMIT}% limit`;
    if (!(period.value >= WHOLESALE_FLOOR)) return `wholesale power averaged ${period.value}, under ${WHOLESALE_FLOOR} EUR/MWh`;
    if (series.country === 'Germany' && slot.tier === 0 && Math.abs(period.change) > GERMAN_CALM_LIMIT) return `a calm German week moved ${period.change}%, over ${GERMAN_CALM_LIMIT}%`;
  }
  return null;
}

export const wholesaleOk = (p) => p.change != null && Math.abs(p.change) <= WHOLESALE_MOVE_LIMIT && p.value >= WHOLESALE_FLOOR;

/** FEMA declarations made, or incidents running, within FEMA_DAYS of a period. `incidentNear` tells the two apart: many are declared months after their event. */
export function femaNear(declarations, start, monthly) {
  const from = addDays(start, -FEMA_DAYS);
  const to = addDays(periodEnd(start, monthly), FEMA_DAYS);
  return declarations
    .map((d) => ({ ...d, incidentNear: d.from <= to && d.to >= from }))
    .filter((d) => d.incidentNear || (d.declared >= from && d.declared <= to));
}

/**
 * The first thing wrong with a US period against FEMA, or null: an event near
 * it that stops the week (`stops`: the big ones with loss of life, as
 * numbers), or a declaration nobody has read (`seen`).
 */
export function femaBreach(near, seen, stops) {
  const stop = near.find((d) => d.incidentNear && stops.includes(d.number));
  if (stop != null) return `FEMA ${stop.number} (${stop.name}, ${stop.state}) is a big event with loss of life`;
  const unread = near.filter((d) => !seen.includes(d.number));
  return unread.length > 0 ? `FEMA declarations nobody has read: ${unread.map((d) => d.number).join(', ')}` : null;
}

/**
 * The first reason a slot cannot take the period at index `at` of its series,
 * or null. `rules` holds the excluded `windows`, FEMA's `declarations` and the
 * numbers that `stops` a US period; the slot names what it has read in `femaRead`.
 */
export function periodBreach(slot, s, at, rules) {
  const period = s.periods[at];
  const next = s.periods[at + 1];
  if (period == null || period.change == null || next == null || next.change == null) return 'period, its change or the next period is missing';
  const breach = ruleBreach(slot, period, s);
  if (breach != null) return breach;
  const hit = excludedBy(rules.windows, period.start, s.monthly, s.country);
  if (hit != null && !(slot.solidarity && hit[2].includes('solidarity'))) return `in an excluded window, ${hit[2]}`;
  if (s.country === 'US') return femaBreach(femaNear(rules.declarations, period.start, s.monthly), slot.femaRead ?? [], rules.stops);
  return null;
}

/**
 * Hard weeks as played: with solidarity weeks on, one of those presses on
 * nobody (replay in model.ts); off, or until reviewed, its calm stand-in
 * plays instead.
 */
export function hardWeeks(weeks, solidarityOn) {
  return weeks.filter((week) => {
    const aid = week.solidarity != null || week.solidarityPending != null;
    if (aid) return solidarityOn ? false : (week.calm?.tier ?? 0) >= HARD_TIER;
    return week.tier >= HARD_TIER;
  }).length;
}
