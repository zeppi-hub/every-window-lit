// Bakes Season 1 from the raw public data in data/raw/ (scripts/fetch-data.mjs)
// into src/season/season.json, the only data the game ships, and writes
// data/season-report.md for a person to read the chosen weeks before they ship.
//
//   node scripts/bake-season.mjs
//
// Each series, one kind in one country, becomes a list of periods (ISO weeks,
// or months for a monthly series) with the real % change on the previous
// period. Each change gets a tier against the series' own spread of changes
// since January 2023. Twelve periods, chosen by hand in the slot table below,
// become the season; each keeps its country, so one season mixes four. The
// rules a slot must pass are in scripts/season-rules.mjs.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  csvCells,
  excludedBy,
  FEMA_DAYS,
  femaNear,
  HARD_TIER,
  hardWeeks,
  MAX_HARD_WEEKS,
  mondayOf,
  monthLabel,
  nextMonth,
  nextWeek,
  periodBreach,
  periodEnd,
  readBls,
  readEiaMonthly,
  readEiaWeekly,
  readEurostat,
  readFema,
  ruleBreach,
  tiered,
  wholesaleOk,
  WINDOW_START,
  withChanges,
} from './season-rules.mjs';
import { COLD_CEILING, episodes, HEAT_FLOOR, readPower } from './weather.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'src', 'season', 'season.json');
const REPORT = join(ROOT, 'data', 'season-report.md');

/** Read this far before the window too, so its first periods have changes and a few before them. */
const LEAD_IN = addDays(WINDOW_START, -56);
/** The same for the series of months. */
const MONTHS_FROM = '2022-01-01';
/** Every US series ends here: the US is a party to the Iran war from 28 February 2026 (META_VR_HIKAYE_v2_EKLER.md, Kapı 2). */
const US_LAST_DAY = '2026-02-27';
/** Food at home: October 2025 was never collected and November is disturbed, so these months are not read at all. */
const BLS_HOLE = ['2025-09-01', '2025-12-31'];

/**
 * Periods never picked as ordinary price weeks: real disasters with loss of
 * life and the weeks around them, and price shocks tied to wars. A window
 * with a country holds there alone; one without holds everywhere. The May
 * 2023 floods come back only as the solidarity week (META_VR_FIKIR.md §19),
 * never as prices.
 */
const EXCLUDE = [
  // Wars, everywhere.
  ['2023-10-09', '2023-10-22', 'First weeks of the Gaza war, Oct 2023'],
  ['2024-04-08', '2024-04-21', 'Iran and Israel exchange strikes, Apr 2024'],
  ['2024-09-30', '2024-10-13', 'Iran and Israel exchange strikes, Oct 2024'],
  ['2025-06-09', '2025-06-29', 'Oil spike during the June 2025 Israel-Iran war'],
  ['2026-02-26', '2026-12-31', 'The Iran war and its fuel crisis, from 28 Feb 2026'],
  // Italy.
  ['2023-04-24', '2023-05-28', 'Emilia-Romagna floods, May 2023 (only as the solidarity week)', 'Italy'],
  ['2023-07-17', '2023-07-30', 'July 2023 heat and storms in the north, with deaths', 'Italy'],
  ['2023-10-30', '2023-11-12', 'Tuscany floods, 2-3 Nov 2023', 'Italy'],
  ['2024-09-16', '2024-09-29', 'Storm Boris, Emilia-Romagna, Sep 2024', 'Italy'],
  ['2024-10-14', '2024-10-27', 'Emilia-Romagna floods, Oct 2024 (never picked)', 'Italy'],
  ['2026-09-07', '2026-09-20', 'Storms of 10 Sep 2026, with deaths', 'Italy'],
  // Spain.
  ['2023-07-01', '2023-07-31', 'General election, 23 Jul 2023', 'Spain'],
  ['2024-10-29', '2024-11-16', 'Valencia floods (DANA), Oct-Nov 2024', 'Spain'],
  ['2025-04-28', '2025-04-29', 'Iberian blackout, 28-29 Apr 2025', 'Spain'],
  ['2025-08-01', '2025-08-31', 'Wildfires, Aug 2025', 'Spain'],
  ['2026-01-01', '2026-01-31', 'Adamuz train crash, Jan 2026', 'Spain'],
  // Germany.
  ['2024-05-01', '2024-06-30', 'Floods in the south, May-Jun 2024', 'Germany'],
  ['2024-11-01', '2025-02-28', 'Election period, Nov 2024 to Feb 2025', 'Germany'],
  ['2024-12-01', '2024-12-31', 'Magdeburg market attack, Dec 2024', 'Germany'],
  // The US.
  ['2023-08-01', '2023-08-31', 'Maui wildfire, Aug 2023', 'US'],
  ['2023-08-24', '2023-09-07', 'Hurricane Idalia', 'US'],
  ['2024-07-07', '2024-07-21', 'Hurricane Beryl', 'US'],
  ['2024-09-23', '2024-10-20', 'Hurricanes Helene and Milton', 'US'],
  ['2024-11-01', '2024-11-30', 'Presidential election, Nov 2024', 'US'],
  ['2024-12-30', '2025-01-05', 'New Orleans attack', 'US'],
  ['2025-01-07', '2025-01-31', 'Los Angeles wildfires, Jan 2025', 'US'],
  ['2025-07-01', '2025-07-31', 'Texas floods, Jul 2025', 'US'],
  ['2026-01-01', '2026-01-31', 'Venezuela operation and Winter Storm Fern, Jan 2026', 'US'],
];

/**
 * FEMA declares too often for "any declaration within seven days" to leave a
 * US week: nearly every candidate has one, every month does. So a declaration
 * stops a period only when its event was big and killed people (D8 in
 * META_VR_DEVIR2_TASLAK.md): here, at least ten deaths in the one event, with
 * a source. The others near a slot are read and listed in the report, and the
 * slot names them in `femaRead`, so a new declaration stops the bake until a
 * person has read it too.
 */
const FEMA_STOPS = [
  { numbers: [4683], event: 'California storms, Dec 2022 to Jan 2023', deaths: '21', source: 'https://foxweather.com/weather-news/california-atmospheric-rivers-32-trillion-gallons-rain-water' },
  { numbers: [4700, 4705], event: 'Ice storm in Texas and Arkansas, 30 Jan to 2 Feb 2023', deaths: 'at least 10', source: 'https://watchers.news/2023/02/02/widespread-ice-storm-leaves-at-least-10-people-dead-more-than-550-000-without-power-u-s/' },
  { numbers: [4788, 4791, 4804], event: 'Memorial Day weekend storms, 25-27 May 2024', deaths: 'at least 26', source: 'https://www.foxweather.com/weather-news/memorial-day-weekend-severe-weather-forecast' },
  { numbers: [4798], event: 'Hurricane Beryl, Jul 2024', deaths: 'at least 36', source: 'https://abc13.com/15096054' },
  { numbers: [4860, 3624], event: 'Kentucky floods, Feb 2025', deaths: '23', source: 'https://www.yahoo.com/news/kentucky-severe-weather-deaths-rise-230000684.html' },
  { numbers: [4864, 3626, 4873, 3627, 4878, 3625], event: 'Tornadoes and floods, 2-7 Apr 2025', deaths: 'at least 18', source: 'https://kansaspublicradio.org/npr-news/2025-04-06/severe-storms-and-floods-batter-south-and-midwest-as-death-toll-rises-to-at-least-18' },
];
const FEMA_STOP_NUMBERS = FEMA_STOPS.flatMap((stop) => stop.numbers);

const EMBER = { name: 'Ember, European wholesale electricity prices, daily day-ahead, weekly means', licence: 'CC BY 4.0', url: 'https://ember-energy.org/data/european-wholesale-electricity-price-data/' };
/** Each series' public source, for the report; attribution is in CREDITS.md. */
const DATASETS = {
  'fuel:Italy': { name: 'MASE, weekly national average pump prices, mean of Euro-super 95 and diesel', licence: 'CC BY 4.0', url: 'https://sisen.mase.gov.it/dgsaie/' },
  'fuel:US': { name: 'EIA, weekly U.S. regular all formulations retail gasoline prices (EMM_EPMR_PTE_NUS_DPG)', licence: 'public domain', url: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EMM_EPMR_PTE_NUS_DPG&f=W' },
  'power:Italy': EMBER,
  'power:Spain': EMBER,
  'power:Germany': EMBER,
  'power:US': { name: 'EIA, Monthly Energy Review table 9.8, average residential electricity price (ESRCUUS)', licence: 'public domain', url: 'https://www.eia.gov/totalenergy/data/browser/?tbl=T09.08' },
  'food:Italy': { name: 'ISTAT, NIC "carrello della spesa", published change on the previous month', licence: 'CC BY 4.0', url: 'https://esploradati.istat.it/' },
  'food:Spain': { name: 'Eurostat, HICP monthly index prc_hicp_minr, CP01 food and non-alcoholic beverages', licence: 'CC BY 4.0', url: 'https://doi.org/10.2908/PRC_HICP_MINR' },
  'food:US': { name: 'BLS, CPI-U food at home, U.S. city average, not seasonally adjusted (CUUR0000SAF11)', licence: 'public domain', url: 'https://data.bls.gov/timeseries/CUUR0000SAF11' },
};

/** A slot's or a series' key. */
const keyOf = (item) => `${item.kind}:${item.country}`;

// ---------------------------------------------------------------- sources

async function raw(name, file) {
  return readFile(join(RAW, name, file), 'utf8');
}

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

/** Ember daily day-ahead wholesale prices, one country, EUR/MWh. */
async function powerSeries(code, country, boundsFrom) {
  const text = await raw('power', 'ember-daily.csv');
  const days = [];
  for (const line of text.split('\n').slice(1)) {
    const [, iso3, day, price] = line.split(',');
    if (iso3 !== code || day == null || price == null || price === '') continue;
    if (day < LEAD_IN) continue;
    days.push({ day, value: Number(price) });
  }
  return { kind: 'power', country, monthly: false, unit: 'EUR/MWh', periods: withChanges(weeklyFromDaily(days)), boundsFrom };
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
  return { kind: 'fuel', country: 'Italy', monthly: false, unit: 'EUR per 1,000 litres', periods: withChanges(weeks) };
}

/** Whether a US period ends in time. */
const beforeUsEnd = (p, monthly) => periodEnd(p.start, monthly) <= US_LAST_DAY;

/** EIA's weekly regular gasoline, dollars per gallon, with taxes. */
async function fuelUsSeries() {
  const weeks = readEiaWeekly(await raw('fuel-us', 'eia-weekly-regular-gasoline.html')).filter((p) => p.start >= LEAD_IN && beforeUsEnd(p, false));
  return { kind: 'fuel', country: 'US', monthly: false, unit: 'USD per gallon', periods: withChanges(weeks, nextWeek) };
}

/** EIA's average residential electricity price by month: what the card calls power bills. */
async function powerUsSeries() {
  const months = readEiaMonthly(await raw('power-us', 'eia-mer-t09-08.csv'), 'ESRCUUS').filter((p) => p.start >= MONTHS_FROM && beforeUsEnd(p, true));
  return { kind: 'power', country: 'US', monthly: true, unit: 'cents per kWh', periods: withChanges(months, nextMonth) };
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
  return { kind: 'food', country: 'Italy', monthly: true, unit: '% on the previous month', periods };
}

/** Eurostat's HICP for Spain: the index itself, so the change is computed here. */
async function foodSpainSeries() {
  const months = readEurostat(await raw('food-es', 'eurostat-hicp-cp01-es.csv')).filter((p) => p.start >= MONTHS_FROM);
  return { kind: 'food', country: 'Spain', monthly: true, unit: 'index, 2015 = 100', periods: withChanges(months, nextMonth) };
}

/** BLS food at home, the index itself. The month after the hole has no change, and the month before it no next. */
async function foodUsSeries() {
  const months = readBls(await raw('food-us', 'bls-cuur0000saf11.json')).filter(
    (p) => p.start >= MONTHS_FROM && beforeUsEnd(p, true) && !(p.start >= BLS_HOLE[0] && p.start <= BLS_HOLE[1]),
  );
  return { kind: 'food', country: 'US', monthly: true, unit: 'index, 1982-84 = 100', periods: withChanges(months, nextMonth) };
}

// ---------------------------------------------------------------- picking

const YEAR_PAGE = (year, place) => `https://en.wikipedia.org/wiki/${year}_in_${place}`;

/**
 * The season, chosen by hand from the tiered periods (data/raw/season-candidates.json):
 * the kind of week, its country, the real period and the tier it was chosen
 * for. Five fuel, four power and three food weeks, in the order the story
 * needs; the tiers are fixed (3, 0, -1, 1, 3, 2, -1, S, 1, 2, 3, 0) so the
 * town breathes and the hard weeks stay five; the years are mixed so the
 * season is not one long trend. `why` and `checked` go to the report: what
 * the week is for, and where its tragedy check was read (EMS never shows
 * deaths, and a year page does not list every one). `flag` is what a person
 * should weigh. Weather weeks: every candidate checked so far failed the rule
 * for loss of life (META_VR_FIKIR.md §23), so Season 1 has none; the bake
 * still looks for matches among the Italian weeks and lists them in the
 * report. The bake stops if a period is missing, has moved tier on a re-bake,
 * breaks a rule, falls in an excluded window, or has an unread declaration.
 */
const SLOTS = [
  {
    kind: 'fuel',
    country: 'Italy',
    start: '2023-01-02',
    tier: 3,
    why: 'The opening: the same big rise at the pumps for everyone. Kept from the old list.',
    checked: [YEAR_PAGE(2023, 'Italy')],
    found: 'Nothing with deaths on the scale of a disaster in the week. The Copernicus EMS list starts in March 2023, so it cannot speak for this week.',
  },
  {
    kind: 'power',
    country: 'Germany',
    start: '2024-03-11',
    tier: 0,
    why: 'A calm week after the first big one, and the only German week (D6 a). Moved 0.9%, inside the 4% limit for calm German weeks.',
    checked: [YEAR_PAGE(2024, 'Germany')],
    found: 'Nothing listed in the week. The Bedburg-Hau nursing-home fire (4 dead) was on 4 Mar and the Scheessel shootings (4 dead) on 1 Mar, both before it. No EMS activation in Germany within 7 days.',
  },
  {
    kind: 'fuel',
    country: 'US',
    start: '2023-11-06',
    tier: -1,
    why: 'A week of falling prices, when the basket can come early. Among the falls with the fewest declarations near them.',
    checked: [YEAR_PAGE(2023, 'the_United_States')],
    found: 'Nothing with deaths listed in the week. The Lewiston shootings (18 dead) were on 25 Oct, 12 days before it. No FEMA declaration near it is for an event in that window with deaths.',
    femaRead: [3600, 3603, 4748],
  },
  {
    kind: 'food',
    country: 'Spain',
    start: '2023-04-01',
    tier: 1,
    why: 'A small rise in the shop, for the family week. The cleanest of the small Spanish months.',
    checked: [YEAR_PAGE(2023, 'Spain'), 'https://euroweeklynews.com/2023/04/22/at-least-two-dead-and-10-injured-after-a-fire-in-an-italian-restaurant-in-madrid/', 'https://theolivepress.es/spain-news/2023/04/12/34-road-deaths-in-easter'],
    found: 'A restaurant fire in Madrid on 21 Apr (2 dead reported) and 34 road deaths over Easter: ordinary news, no national disaster. No EMS activation in Spain within 7 days of the month.',
  },
  {
    kind: 'power',
    country: 'Spain',
    start: '2025-12-08',
    tier: 3,
    why: 'The row goes dark. D4 a: +27.1%, tier 3 against bounds drawn only from the 78 Spanish weeks that pass the wholesale rule and sit in no excluded window.',
    checked: [YEAR_PAGE(2025, 'Spain')],
    found: 'Nothing with deaths listed in the week. A wave at a seawater pool in Los Gigantes, Tenerife, killed 4 on 7 Dec, the day before. No EMS activation in Spain within 7 days.',
  },
  {
    kind: 'fuel',
    country: 'Italy',
    start: '2025-01-13',
    tier: 2,
    why: 'The turning week. Kept from the old list.',
    checked: [YEAR_PAGE(2025, 'Italy'), 'https://polaris.irpi.cnr.it/wp-content/uploads/Report_2025_sem.pdf'],
    found: 'Nothing with deaths listed in the week. An avalanche at Punta Valgrande killed 3 skiers on 12 Jan, the day before. Red alert in Calabria on 17 Jan, no deaths found. No EMS activation in Italy within 7 days.',
  },
  {
    kind: 'power',
    country: 'Italy',
    start: '2024-06-10',
    tier: -1,
    why: 'Power falls, a breath before the solidarity week. Kept from the old list.',
    checked: [YEAR_PAGE(2024, 'Italy'), 'https://www.ksat.com/news/world/2024/06/22/italian-coast-guard-recovers-14-more-bodies-of-shipwreck-victims-off-calabria-dozens-still-missing'],
    found: 'Nothing with deaths listed in the week (European elections just before it, G7 in Puglia in it). No EMS activation in Italy within 7 days.',
    flag: 'The Ionian shipwreck off Calabria was on 17 Jun, the day after the week ends: at least 34 dead, dozens missing. The week itself is clear; it is the next period, shown only as next.',
  },
  // The solidarity week (SOLIDARITY below): May 2023's grocery prices, the month of the Emilia-Romagna floods.
  {
    kind: 'food',
    country: 'Italy',
    start: '2023-05-01',
    tier: 3,
    solidarity: true,
    why: 'The solidarity week, as before: the month of the Emilia-Romagna floods. Its stand-in is the calm week below.',
    checked: [YEAR_PAGE(2024, 'Italy')],
    found: 'The stand-in month, Mar 2024: nothing with deaths listed, no EMS activation in Italy within 7 days.',
  },
  {
    kind: 'fuel',
    country: 'Italy',
    start: '2025-05-12',
    tier: 1,
    why: 'A small rise (D6 a: Italy or the US, no Oil Bulletin). Italy, because the US candidates near the top of the tier fail: 3-9 Nov 2025 has the UPS crash in Louisville (15 dead).',
    checked: [YEAR_PAGE(2025, 'Italy'), 'https://www.nbcnews.com/news/us-news/death-toll-rises-15-ups-plane-crash-kentucky-rcna251012'],
    found: 'Nothing with deaths listed in the week. No EMS activation in Italy within 7 days.',
  },
  {
    kind: 'power',
    country: 'US',
    start: '2025-09-01',
    tier: 2,
    why: 'Bills up before the festival. Only four US months sit in this tier; the other three have a big event with deaths (see below).',
    checked: [YEAR_PAGE(2025, 'the_United_States')],
    found: 'All 13 FEMA declarations near the month read. The six made on 11 Sep are for storms from May to August, outside the window. In the window: wildfires, and New Mexico storms on 28-29 Sep with no deaths found. None is a big event with deaths.',
    flag: 'Not a FEMA matter, but a person should weigh it: Charlie Kirk was assassinated on 10 Sep, and the Grand Blanc church attack (4 dead) was on 28 Sep. The Annunciation church shooting (2 children killed) was on 27 Aug, inside the 7 days before.',
    femaRead: [4887, 4888, 4889, 4890, 4891, 4892, 4918, 5607, 5610, 5611, 5612, 5613, 5614],
  },
  {
    kind: 'fuel',
    country: 'US',
    start: '2023-07-24',
    tier: 3,
    why: 'The climax (D5 a), the largest rise in the US series up to the cut. It is not larger than week 1: no US week through February 2026 is, so the story says "one of its hardest weeks".',
    checked: [YEAR_PAGE(2023, 'the_United_States'), 'https://en.wikipedia.org/wiki/July_2023_Northeastern_United_States_floods', 'https://laist.com/news/npr-news/phoenix-ends-31-day-streak-of-highs-at-or-above-110-degrees-by-reaching-108', 'https://foxweather.com/extreme-weather/phoenix-deadly-summer-heat-killed-645'],
    found: 'Nothing with deaths listed in the week. All 14 FEMA declarations near it read; none has ten deaths of its own in the window.',
    flag: 'Two tolls around the week, neither in it by date. The Northeast floods killed 11 across the region, 7 of them in Pennsylvania on 15 Jul, which has no declaration; 1 or 2 in each declared state, and no death dated after 16 Jul. Phoenix was in its 31-day run above 110 F, which ended on 31 Jul; Maricopa County counted 645 heat deaths over 2023, with no declaration.',
    femaRead: [3595, 4720, 4721, 4722, 4723, 4735, 4740, 4741, 4744, 4747, 5470, 5471, 5472, 5473],
  },
  {
    kind: 'food',
    country: 'US',
    start: '2024-03-01',
    tier: 0,
    why: 'A calm month for the festival week. The tier holds only flat months (0.0%): March, May and June 2024; the other two have the big storms of late May in their window. D9: August 2025 is not picked.',
    checked: [YEAR_PAGE(2024, 'the_United_States'), 'https://en.wikipedia.com/wiki/Tornado_outbreak_of_April_1-3,_2024', 'https://www.cleveland19.com/2024/03/15/several-homes-damaged-by-possible-tornado-richland-county'],
    found: 'All 19 FEMA declarations near the month read: tornadoes on 14 Mar (3 dead in Ohio), storms of 1-3 Apr (5 dead), Smokehouse Creek Fire; none of ten deaths or more.',
    flag: 'Not FEMA: the Francis Scott Key Bridge in Baltimore fell on 26 Mar (6 dead), inside the month.',
    femaRead: [4761, 4762, 4763, 4764, 4765, 4766, 4767, 4777, 4782, 4783, 4785, 4786, 4799, 4802, 5487, 5488, 5489, 5490, 5491],
  },
];

/**
 * Weather weeks: real weather near Naples laid over a season week as a
 * fictional island event (META_VR_FIKIR.md §19). A slot gets one only if an
 * episode's first day falls in its real week, the kinds pair (heat and cold
 * with power, a dry spell with food, a storm with fuel or food), and the
 * entry below records zero deaths with two sources and Zeynep's review
 * date. Until then the week ships without it; the dev build can preview
 * it (weatherPending).
 */
const WEATHER = [
  // { slot: 3, start: '2025-10-13', day: '2025-10-14', kind: 'storm', deathsVerified: 0, sources: ['…', '…'], reviewed: 'YYYY-MM-DD' },
  // An entry clears only the exact episode (its first day) in the exact real period it was checked for.
  // Checked on 31 Oct 2026 and failed (deaths in Italy, an EMS activation within 7 days, or a named
  // storm): storm 26 Feb 2024; cold 30 Jan 2023; heat 17 Jun, 8 Jul, 5 Aug, 19 and 26 Aug 2024,
  // 11 Sep 2023, 6 Jul 2026. Unclear (zero deaths not shown by two sources): storm 13 Oct 2025.
];
const PAIRS = { heat: ['power'], cold: ['power'], dry: ['food'], storm: ['fuel', 'food'] };
/** No weather week after August 2026, and at most three in a season. */
const WEATHER_UNTIL = '2026-08-31';
/**
 * Storms named by a European weather service that reached Italy (META_VR_FIKIR.md §19): a weather
 * week within seven days of one is dropped, as is one within seven days of a Copernicus EMS
 * activation in Italy (data/raw/ems, fetched; its public list starts in March 2023).
 */
const NAMED_STORMS = [
  ['2023-01-16', 'Hannelore'],
  ['2023-02-09', 'Helios'],
  ['2023-11-02', 'Ciarán'],
  ['2024-02-26', 'Dorothea and Emil'],
  ['2024-03-03', 'Fedra'],
  ['2024-09-18', 'Boris'],
  ['2026-01-18', 'Harry'],
];

/**
 * The solidarity week (META_VR_FIKIR.md §19): week 4 at the earliest, at
 * least two weeks before the last, never a power week, never next to a
 * weather week. The letter is the only place the event is named; the
 * island shows only help going out. It ships only with Zeynep's review
 * date; until then, and whenever the player switches such weeks off on the
 * start page, the calm week below stands in for it.
 */
const SOLIDARITY = {
  slot: 8,
  letter: ['News from the mainland:', 'floods in Emilia-Romagna.', 'The harbor is filling a boat.'],
  week: '2023-05-15',
  calm: { kind: 'food', country: 'Italy', start: '2024-03-01', tier: 0 },
  sources: [
    'https://www.protezionecivile.gov.it/en/notizia/emilia-romagna-bad-weather-declared-state-emergency/',
    'https://www.protezionecivile.gov.it/en/notizia/emilia-romagna-weather-emergency-national-service-commitment-continues-affected-areas/',
    'https://mapping.emergency.copernicus.eu/activations/EMSR664',
    'https://www.arpae.it/it/temi-ambientali/meteo/report-meteo/rapporti-post-evento/rapporto_idro_meteo_20230516-18.pdf',
  ],
  reviewed: null,
};

/** One period for a slot, checked against every rule, as it goes into season.json. */
function pickPeriod(all, declarations, slot, where) {
  const s = all[keyOf(slot)];
  if (s == null) throw new Error(`${where}: no series ${keyOf(slot)}`);
  const at = s.periods.findIndex((p) => p.start === slot.start);
  const breach = periodBreach(slot, s, at, { windows: EXCLUDE, declarations, stops: FEMA_STOP_NUMBERS });
  if (breach != null) throw new Error(`${where}: ${breach}`);
  const period = s.periods[at];
  return {
    kind: slot.kind,
    country: slot.country,
    start: period.start,
    month: period.month,
    monthly: s.monthly,
    change: period.change,
    tier: period.tier,
    next: s.periods[at + 1].change,
    before: s.periods.slice(Math.max(0, at - 4), at).filter((p) => p.change != null).map((p) => p.change),
  };
}

function pick(all, declarations) {
  const weeks = SLOTS.map((slot, index) => pickPeriod(all, declarations, slot, `slot ${index + 1} (${keyOf(slot)} ${slot.start})`));
  // The solidarity week carries its letter (once reviewed) and the calm week that stands in for it.
  const slot = SLOTS[SOLIDARITY.slot - 1];
  const week = weeks[SOLIDARITY.slot - 1];
  if (slot.solidarity) {
    const calm = pickPeriod(all, declarations, SOLIDARITY.calm, 'solidarity stand-in');
    const solidarity = { letter: SOLIDARITY.letter, week: SOLIDARITY.week };
    if (SOLIDARITY.slot < 4 || SOLIDARITY.slot > SLOTS.length - 2) throw new Error('the solidarity week must be week 4 or later and two weeks before the last');
    if (week.kind === 'power') throw new Error('the solidarity week cannot be a power week');
    if (/^\d{4}-\d{2}-\d{2}$/.test(SOLIDARITY.reviewed ?? '') && SOLIDARITY.sources.length >= 2) week.solidarity = solidarity;
    else week.solidarityPending = solidarity;
    week.calm = calm;
  }
  // Both ways of playing the hard weeks stay even only up to five, with the solidarity week on or off.
  for (const on of [true, false]) {
    const hard = hardWeeks(weeks, on);
    if (hard > MAX_HARD_WEEKS) throw new Error(`${hard} hard weeks with solidarity weeks ${on ? 'on' : 'off'}, at most ${MAX_HARD_WEEKS}`);
  }
  return weeks;
}

/** The real number a weather week shows, as on its tag. */
function weatherLabel(e) {
  if (e.kind === 'storm') return `${e.rain} mm of rain in a day`;
  if (e.kind === 'dry') return `${e.share}% of usual rain in six months`;
  if (e.kind === 'heat') return `${e.days} days above ${HEAT_FLOOR}°C`;
  return `Nights down to ${e.low}°C`;
}

// ---------------------------------------------------------------- main

const series = {};
for (const make of [
  fuelSeries,
  fuelUsSeries,
  () => powerSeries('ITA', 'Italy'),
  // D4 a: only here the bounds come from the weeks that could be picked; the rule leaves Spain no tier 2 or 3 otherwise.
  () => powerSeries('ESP', 'Spain', (p) => wholesaleOk(p) && excludedBy(EXCLUDE, p.start, false, 'Spain') == null),
  () => powerSeries('DEU', 'Germany'),
  powerUsSeries,
  foodSeries,
  foodSpainSeries,
  foodUsSeries,
]) {
  const s = await make();
  const { bounds, periods } = tiered(s.periods, s.boundsFrom);
  series[keyOf(s)] = { ...s, bounds, periods };
}
// Every period with its tier, for choosing the slots by hand (not committed).
await writeFile(join(RAW, 'season-candidates.json'), JSON.stringify(series));
const fema = readFema(await raw('fema', 'fema-declarations.csv'));
const weeks = pick(series, fema);
const naples = episodes(
  await readPower(join(RAW, 'weather-baseline', 'nasa-power-naples-1991-2020.csv')),
  await readPower(join(RAW, 'weather', 'nasa-power-naples.csv')),
);
const weatherNotes = [];
const ems = JSON.parse(await readFile(join(RAW, 'ems', 'copernicus-ems-activations.json'), 'utf8'))
  .results.filter((a) => a.countries.includes('Italy'))
  .flatMap((a) => [a.eventTime, a.activationTime].map((t) => [t.slice(0, 10), a.code]));
/** Why an episode can never be a weather week, or null: an EMS activation or a named storm in Italy within seven days of its week. */
function blocked(start, end) {
  const from = addDays(start, -7);
  const to = addDays(end, 7);
  const activation = ems.find(([day]) => day >= from && day <= to);
  if (activation != null) return `Copernicus EMS activation ${activation[1]} on ${activation[0]}`;
  const storm = NAMED_STORMS.find(([day]) => day >= from && day <= to);
  return storm != null ? `storm ${storm[1]} on ${storm[0]}` : null;
}
const aidSlot = SOLIDARITY.slot - 1;
const usedReviews = new Set();
weeks.forEach((week, index) => {
  // Never the first week, never the solidarity week or the weeks either side of it, and only Italian weeks: the weather is Naples'.
  if (week.country !== 'Italy' || index === 0 || Math.abs(index - aidSlot) <= 1) return;
  const end = periodEnd(week.start, week.monthly);
  const match = naples.find((e) => e.day >= week.start && e.day <= end && e.day <= WEATHER_UNTIL && PAIRS[e.kind].includes(week.kind));
  if (match == null) return;
  const episodeStart = mondayOf(match.day);
  const why = blocked(episodeStart, addDays(episodeStart, 6));
  if (why != null) {
    weatherNotes.push(`- Week ${index + 1}: ${match.kind} from ${match.day} dropped (${why}).`);
    return;
  }
  const weather = { kind: match.kind, label: weatherLabel(match), month: monthLabel(match.day) };
  const review = WEATHER.find((w) => w.slot === index + 1 && w.kind === match.kind && w.day === match.day && w.start === week.start);
  const cleared = review != null && review.deathsVerified === 0 && review.sources?.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(review.reviewed ?? '');
  if (review != null) usedReviews.add(review);
  if (cleared) week.weather = weather;
  else week.weatherPending = weather;
  weatherNotes.push(`- Week ${index + 1}: ${match.kind} from ${match.day} (${weather.label}) — ${cleared ? `cleared, reviewed ${review.reviewed}` : 'pending: needs zero deaths with two sources and Zeynep\'s review date in WEATHER'}`);
});
if (weeks.filter((w) => w.weather != null).length > 3) throw new Error('more than three weather weeks in the season');
for (const review of WEATHER) {
  if (!usedReviews.has(review)) throw new Error(`a weather review (slot ${review.slot}, ${review.kind} from ${review.day}) matches no episode in its week`);
}

let manifest = {};
try {
  manifest = JSON.parse(await readFile(join(RAW, 'manifest.json'), 'utf8'));
} catch {
  manifest = {};
}
const season = { weeks };
const json = `${JSON.stringify(season, null, 1)}\n`;
await writeFile(OUT, json);

// ---------------------------------------------------------------- report

const periodLabel = (w) => (w.monthly ? w.month : `${w.start} (${w.month})`);
/** The span of the season's real periods, as the start page says it. */
function span() {
  const starts = weeks.flatMap((w) => [w, ...(w.calm != null ? [w.calm] : [])]).sort((a, b) => a.start.localeCompare(b.start));
  return `${starts[0].month} to ${starts.at(-1).month}`;
}
const stopOf = (number) => FEMA_STOPS.find((stop) => stop.numbers.includes(number));

/** Every other period of a slot's series and tier: why each could not be picked, by reason, and how many were open. */
function others(slot, index) {
  const s = series[keyOf(slot)];
  const out = new Map();
  let rule = 0;
  let open = 0;
  for (const p of s.periods) {
    if (p.start < WINDOW_START || p.tier !== slot.tier || p.start === slot.start) continue;
    const hit = excludedBy(EXCLUDE, p.start, s.monthly, s.country);
    const stop = s.country === 'US' ? femaNear(fema, p.start, s.monthly).find((d) => d.incidentNear && stopOf(d.number) != null) : null;
    const why = hit?.[2] ?? (stop != null ? `FEMA ${stopOf(stop.number).numbers[0]}, ${stopOf(stop.number).event}` : null);
    if (why != null) out.set(why, [...(out.get(why) ?? []), s.monthly ? p.month : p.start]);
    else if (ruleBreach(slot, p, s) != null) rule += 1;
    else open += 1;
  }
  const parts = [...[...out].map(([why, labels]) => `${why}: ${labels.join(', ')}`), ...(rule > 0 ? [`${rule} over a rule`] : []), `${open} open, not read one by one`];
  return `- Week ${index + 1} (${slot.kind}, ${slot.country}, tier ${slot.tier}). ${parts.join('. ')}.`;
}

/** A US slot's declarations, each with what it counted for. */
function femaLines(slot, index) {
  const week = weeks[index];
  const from = addDays(week.start, -FEMA_DAYS);
  const to = addDays(periodEnd(week.start, week.monthly), FEMA_DAYS);
  const near = femaNear(fema, week.start, week.monthly).sort((a, b) => a.from.localeCompare(b.from));
  return [
    `### Week ${index + 1}: ${near.length} declarations from ${from} to ${to}`,
    '',
    '| FEMA | Type | State | Title | Incident | Declared | In the window |',
    '|---|---|---|---|---|---|---|',
    ...near.map((d) => `| ${d.number} | ${d.type} | ${d.state} | ${d.name} | ${d.from} to ${d.to} | ${d.declared} | ${d.incidentNear ? 'the incident' : 'only the declaration'} |`),
    '',
  ];
}

const usSlots = SLOTS.flatMap((slot, index) => (slot.country === 'US' ? [[slot, index]] : []));
const lines = [
  '# Season 1 weeks (baked)',
  '',
  'Written by scripts/bake-season.mjs. Read before shipping: no week should sit on a real tragedy.',
  '',
  '**Not approved.** This list waits for Zeynep\'s review.',
  '',
  `On the start page: \`Prices: Italy, Spain, Germany, US, ${span()}.\``,
  '',
  `Hard weeks as played (tier ${HARD_TIER} or more): ${hardWeeks(weeks, true)} with solidarity weeks on, ${hardWeeks(weeks, false)} off, at most ${MAX_HARD_WEEKS}.`,
  '',
  '| Week | Kind | Country | Real period | Change | Tier | Next | Before | Source | Licence |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...weeks.map((w, i) => {
    const data = DATASETS[keyOf(w)];
    return `| ${i + 1} | ${w.kind} | ${w.country} | ${periodLabel(w)} | ${w.change}% | ${w.tier} | ${w.next}% | ${w.before.join(', ')} | [${data.name.split(',')[0]}](${data.url}) | ${data.licence} |`;
  }),
  '',
  '## Why each week',
  '',
  'Checked means read on 6 Nov 2026: the year pages and searches below, with EMS and FEMA from data/raw. EMS shows no deaths, and a year page does not list every one, so a clear week here means nothing of a disaster\'s size was found.',
  '',
  ...SLOTS.flatMap((slot, i) => [
    `### Week ${i + 1}: ${slot.kind}, ${slot.country}, ${periodLabel(weeks[i])}`,
    '',
    `- Why: ${slot.why}`,
    `- Checked: ${slot.found}`,
    ...(slot.flag != null ? [`- **To weigh:** ${slot.flag}`] : []),
    `- Sources: ${slot.checked.join(' ')}`,
    `- Data: ${DATASETS[keyOf(slot)].name}, ${DATASETS[keyOf(slot)].url}`,
    '',
  ]),
  '## Big events with deaths that stop a US period',
  '',
  'A FEMA declaration near a US period stops it only for an event like these: at least ten deaths in the one event, with a source. D8 sets no number; ten is this list\'s reading of "big".',
  '',
  ...FEMA_STOPS.map((stop) => `- ${stop.event}: ${stop.deaths} dead, FEMA ${stop.numbers.join(', ')}. ${stop.source}`),
  '',
  '## Every declaration near a US week',
  '',
  `Within ${FEMA_DAYS} days of the period, by declaration or by incident. Data: OpenFEMA, FemaWebDisasterDeclarations v1.`,
  '',
  ...usSlots.flatMap(([slot, index]) => femaLines(slot, index)),
  '## What else was in each tier',
  '',
  ...SLOTS.map(others),
  '',
  '## Tiers per series',
  '',
  ...Object.entries(series).map(([key, s]) => {
    const spread = `calm below ${s.bounds.calm.toFixed(2)}%, small below ${s.bounds.small.toFixed(2)}%, medium below ${s.bounds.medium.toFixed(2)}%, large above`;
    const inWindow = s.periods.filter((p) => p.start >= WINDOW_START && p.change != null);
    const from = s.boundsFrom != null ? `, bounds from the ${inWindow.filter(s.boundsFrom).length} that pass the wholesale rule and sit in no excluded window` : '';
    return `- ${key}: ${spread} (${inWindow.length} periods since ${WINDOW_START}${from}).`;
  }),
  '',
  '## Solidarity week',
  '',
  `- Week ${SOLIDARITY.slot}: ${SOLIDARITY.letter.join(' ')} (event week of ${SOLIDARITY.week}). ${SOLIDARITY.reviewed ? `Reviewed ${SOLIDARITY.reviewed}.` : 'Pending: needs Zeynep\'s review date in SOLIDARITY; until then the calm week below ships in its place.'}`,
  `- Stand-in when switched off or unreviewed: ${SOLIDARITY.calm.kind} ${SOLIDARITY.calm.country} ${SOLIDARITY.calm.start}.`,
  ...SOLIDARITY.sources.map((url) => `- Source: ${url}`),
  '',
  '## Weather weeks (real weather near Naples)',
  '',
  ...(weatherNotes.length > 0 ? weatherNotes : ['- None of the Italian season weeks meets a weather episode of a fitting kind.']),
  '',
  '## Never picked as price weeks',
  '',
  ...EXCLUDE.map(([from, to, why, country]) => `- ${from} to ${to}, ${country ?? 'everywhere'}: ${why}`),
  `- From ${US_LAST_DAY}, the US: every series ends.`,
  `- ${BLS_HOLE[0]} to ${BLS_HOLE[1]}, US food: not read (October 2025 was never collected, November is disturbed), so August 2025 has no next and is not picked either (D9).`,
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
