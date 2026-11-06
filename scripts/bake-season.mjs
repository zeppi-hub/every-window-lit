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
    found: 'The year page lists nothing of a disaster\'s size in the week. Our copy of the Copernicus EMS list starts with an activation on 24 Mar 2023, so it cannot speak for this week.',
  },
  {
    kind: 'power',
    country: 'Germany',
    start: '2024-03-11',
    tier: 0,
    why: 'A calm week after the first big one, and the only German week (D6 a). Moved 0.9%, inside the 4% limit for calm German weeks.',
    checked: [YEAR_PAGE(2024, 'Germany')],
    found: 'The year page lists nothing in the week. The Bedburg-Hau nursing-home fire (4 dead) was on 4 Mar and the Scheessel shootings (4 dead) on 1 Mar, both before it. No EMS activation in Germany within 7 days.',
  },
  {
    kind: 'fuel',
    country: 'US',
    start: '2023-11-06',
    tier: -1,
    why: 'A week of falling prices, when the basket can come early. Among the falls with the fewest declarations near them.',
    checked: [YEAR_PAGE(2023, 'the_United_States'), 'https://www.click2houston.com/news/local/2023/11/11/6-dead-2-hospitalized-in-crash-after-driver-allegedly-ran-red-light-in-downtown-houston/'],
    found: 'The year page lists nothing with deaths in the week. The Lewiston shootings (18 dead) were on 25 Oct, 12 days before it. No FEMA declaration near it is for an event in that window with deaths.',
    flag: 'Not on the year page: a car crash in downtown Houston killed 6 on 11 Nov, inside the week.',
    femaRead: [3600, 3603, 4748],
  },
  {
    kind: 'food',
    country: 'Spain',
    start: '2023-04-01',
    tier: 1,
    why: 'A small rise in the shop, for the family week. The cleanest of the small Spanish months.',
    checked: [YEAR_PAGE(2023, 'Spain'), 'https://www.ondavasca.com/fallece-la-segunda-vizcaina-ingresada-por-el-incendio-del-restaurante-de-madrid/', 'https://theolivepress.es/spain-news/2023/04/12/34-road-deaths-in-easter', 'https://euromedrights.org/?p=36452', 'https://www.lavozdelanzarote.com/en/news/people/19-migrants-die-trying-to-reach-the-canary-islands_218366_102.html'],
    found: 'A restaurant fire in Madrid on 21 Apr (3 dead, the third three weeks later) and 34 road deaths over Easter: no disaster on land. No EMS activation in Spain within 7 days of the month.',
    flag: 'Not on the year page: a boat on the Canary route sank on 19 Apr with 19 dead, by the count of Caminando Fronteras, an NGO. EuroMed Rights places it off Laayoune; La Voz de Lanzarote names no place.',
  },
  {
    kind: 'power',
    country: 'Spain',
    start: '2025-12-08',
    tier: 3,
    why: 'The row goes dark. D4 a: +27.1%, tier 3 against bounds drawn only from the 78 Spanish weeks that pass the wholesale rule and sit in no excluded window.',
    checked: [YEAR_PAGE(2025, 'Spain'), 'https://rtvc.es/cuatro-fallecidos-heridos-oleaje-los-gigantes-tenerife-7-diciembre-2025/', 'https://rtvc.es/tercer-dia-busqueda-persona-desaparecida-golpe-mar-tenerife-10-diciembre-2025/'],
    found: 'The year page lists nothing with deaths in the week. No EMS activation in Spain within 7 days.',
    flag: 'A wave at a seawater pool in Los Gigantes, Tenerife, killed 4 on 7 Dec, the day before the week, and witnesses said a fifth person was swept away. The search at sea was called off on 10 Dec, inside the week, and went on by land; no report of the person being found turned up.',
  },
  {
    kind: 'fuel',
    country: 'Italy',
    start: '2025-01-13',
    tier: 2,
    why: 'The turning week. Kept from the old list.',
    checked: [YEAR_PAGE(2025, 'Italy'), 'https://polaris.irpi.cnr.it/wp-content/uploads/Report_2025_sem.pdf'],
    found: 'The year page lists nothing with deaths in the week. An avalanche at Punta Valgrande killed 3 skiers on 12 Jan, the day before. Red alert in Calabria on 17 Jan, no deaths found. No EMS activation in Italy within 7 days.',
  },
  {
    kind: 'power',
    country: 'Italy',
    start: '2024-06-10',
    tier: -1,
    why: 'Power falls, a breath before the solidarity week. Kept from the old list.',
    checked: [YEAR_PAGE(2024, 'Italy'), 'https://www.corrieredellacalabria.it/2024/06/24/naufragio-al-largo-di-roccella-a-crotone-la-diciotti-con-5-dei-corpi-recuperati/', 'https://it.wikipedia.org/wiki/Naufragio_di_Roccella_Ionica', 'https://www.ansa.it/amp/english/news/2024/06/17/ship-rescues-51-migrants-10-dead-on-board-boat_4d89f83f-c489-4766-8c43-ffff8b3c2e6b.html'],
    found: 'The year page lists nothing with deaths in the week (European elections just before it, G7 in Puglia in it). No EMS activation in Italy within 7 days.',
    flag: 'The Ionian shipwreck: the mayday came in the night of 16-17 Jun, the last night of the week, about 120 miles off Calabria, and the hour of the sinking is not known. 36 were confirmed dead by 24 Jun (35 bodies and a woman who died after rescue); a later total of 56 was read only on Italian Wikipedia. On 17 Jun a separate boat south of Lampedusa was found with 10 dead. See Candidates for review.',
  },
  // The solidarity week (SOLIDARITY below): May 2023's grocery prices, the month of the Emilia-Romagna floods.
  {
    kind: 'food',
    country: 'Italy',
    start: '2023-05-01',
    tier: 3,
    solidarity: true,
    why: 'The solidarity week, as before: the month of the Emilia-Romagna floods. Its stand-in is the calm week below.',
    checked: [YEAR_PAGE(2024, 'Italy'), 'https://www.pbs.org/newshour/world/survivors-of-mediterranean-rescue-say-about-60-people-died-on-the-trip-from-libya-aid-group-says'],
    found: 'The stand-in month, Mar 2024: the year page lists nothing with deaths, and no EMS activation in Italy within 7 days.',
    flag: 'On the route: survivors rescued by the Ocean Viking on 13 Mar 2024 said about 60 people died on their boat from Libya. That is their account, not a verified count. The month after the stand-in is flat too. See Candidates for review.',
  },
  {
    kind: 'fuel',
    country: 'Italy',
    start: '2025-05-12',
    tier: 1,
    why: 'A small rise (D6 a: Italy or the US, no Oil Bulletin). Italy, because the US candidates near the top of the tier fail: 3-9 Nov 2025 has the UPS crash in Louisville (15 dead).',
    checked: [YEAR_PAGE(2025, 'Italy'), 'https://www.nbcnews.com/news/us-news/death-toll-rises-15-ups-plane-crash-kentucky-rcna251012'],
    found: 'The year page lists nothing with deaths in the week. Searches of the central Mediterranean route and of transport accidents found nothing dated to it. No EMS activation in Italy within 7 days.',
  },
  {
    kind: 'power',
    country: 'US',
    start: '2025-09-01',
    tier: 2,
    why: 'Bills up before the festival. Only four US months sit in this tier; the other three have a big event with deaths (see below).',
    checked: [YEAR_PAGE(2025, 'the_United_States'), 'https://www.whitehouse.gov/presidential-actions/2025/09/honoring-the-memory-of-charlie-kirk', 'https://www.dawn.com/news/1939384'],
    found: 'All 13 FEMA declarations near the month read. The six made on 11 Sep are for storms from May to August, outside the window. In the window: wildfires, and New Mexico storms on 28-29 Sep with no deaths found. None is a big event with deaths.',
    flag: 'Not a FEMA matter, but a person should weigh it: Charlie Kirk was assassinated on 10 Sep, and by proclamation flags flew at half-staff until 14 Sep. The Grand Blanc church attack (4 dead) was on 28 Sep. The Annunciation church shooting (2 children killed) was on 27 Aug, inside the 7 days before. On 2 Sep a US strike on a boat in the Caribbean killed 11, not on US soil. See Candidates for review.',
    femaRead: [4887, 4888, 4889, 4890, 4891, 4892, 4918, 5607, 5610, 5611, 5612, 5613, 5614],
  },
  {
    kind: 'fuel',
    country: 'US',
    start: '2023-07-24',
    tier: 3,
    why: 'The climax (D5 a), the largest rise in the US series up to the cut. It is not larger than week 1: no US week through February 2026 is, so the story says "one of its hardest weeks".',
    checked: [YEAR_PAGE(2023, 'the_United_States'), 'https://www.aopa.org/news-and-media/all-news/2023/august/23/ntsb-reports-on-fatal-accidents-during-eaa-airventure', 'https://en.wikipedia.org/wiki/July_2023_Northeastern_United_States_floods', 'https://laist.com/news/npr-news/phoenix-ends-31-day-streak-of-highs-at-or-above-110-degrees-by-reaching-108', 'https://foxweather.com/extreme-weather/phoenix-deadly-summer-heat-killed-645'],
    found: 'The year page lists nothing with deaths in the week. All 14 FEMA declarations near it read; none has ten deaths of its own in the window.',
    flag: 'Not on the year page: two aircraft accidents at AirVenture in Oshkosh killed 4 on 29 Jul, inside the week. And two tolls around the week, neither in it by date. The Northeast floods killed 11 across the region, 7 of them in Pennsylvania on 15 Jul, which has no declaration; 1 or 2 in each declared state, and no death dated after 16 Jul. Phoenix was in its 31-day run above 110 F, which ended on 31 Jul; Maricopa County counted 645 heat deaths over 2023, with no declaration.',
    femaRead: [3595, 4720, 4721, 4722, 4723, 4735, 4740, 4741, 4744, 4747, 5470, 5471, 5472, 5473],
  },
  {
    kind: 'food',
    country: 'US',
    start: '2024-03-01',
    tier: 0,
    why: 'A calm month for the festival week. The tier holds only flat months (0.0%): March, May and June 2024; the other two have the big storms of late May in their window. D9: August 2025 is not picked.',
    checked: [YEAR_PAGE(2024, 'the_United_States'), 'https://en.wikipedia.com/wiki/Tornado_outbreak_of_April_1-3,_2024', 'https://www.cleveland19.com/2024/03/15/several-homes-damaged-by-possible-tornado-richland-county', 'https://abcnews.com/US/wisconsin-semi-truck-van-crash/story?id=107962885'],
    found: 'All 19 FEMA declarations near the month read: tornadoes on 14 Mar (3 dead in Ohio), storms of 1-3 Apr (5 dead), Smokehouse Creek Fire; none of ten deaths or more.',
    flag: 'Not FEMA: the Francis Scott Key Bridge in Baltimore fell on 26 Mar (6 dead), and a crash near Dewhurst, Wisconsin killed 9 on 8 Mar, both inside the month.',
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
 * activation in Italy (data/raw/ems, fetched; our copy starts in March 2023).
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

/**
 * Alternatives for Zeynep's review, none of them in season.json. Each is read
 * here against the same rules as a slot and listed in the report with what its
 * check found: the year page, migrant routes and transport accidents, since a
 * year page misses the last two. `left` names what was looked at and dropped.
 * The season sums in the report were run through src/season/model.ts on a copy
 * of the list in memory; a swap keeps the tier and the kind, so they cannot move.
 */
const CANDIDATES = [
  {
    week: 7,
    title: 'another tier -1 week, wholesale power, Italy',
    tier: -1,
    series: ['power:Italy'],
    note: 'Today\'s week ends on the night of the Ionian shipwreck. The swap keeps Italy and the tier.',
    rows: [
      {
        key: 'power:Italy',
        start: '2023-12-04',
        why: 'Nearest in size to today\'s week: -8.0% against -7.9%.',
        found: 'Year page: nothing in the week. Route: no wreck found dated to it. Transport: two trains touched at Faenza on 10 Dec, 17 lightly hurt, no deaths.',
        flag: 'Not on the year page: a hospital fire in Tivoli on 8 Dec killed 3, inside the week. Reported on 16 Dec, six days after: a boat off Libya with 61 missing, open sea, not Italy.',
        checked: [YEAR_PAGE(2023, 'Italy'), 'https://www.lapresse.it/cronaca/2023/12/09/rogo-tivoli-tre-morti-in-ospedale-aperta-inchiesta-per-omicidio-e-incendio-colposi/', 'https://www.open.online/2023/12/16/naufragio-mediterraneo-migranti-dispersi', 'https://www.malaymail.com/news/world/2023/12/11/train-crash-in-italy-leaves-17-lightly-injured/106926'],
      },
      {
        key: 'power:Italy',
        start: '2024-02-19',
        why: 'Same size again: -7.8%.',
        found: 'Year page: nothing in the week. Route: no wreck found dated to it. Transport: nothing found; that search was thin.',
        flag: 'The Esselunga site collapse in Florence was on 16 Feb, three days before: 5 workers dead, the last body found on 20 Feb and a two-hour national strike over it on 21 Feb, both inside the week. An earlier scan named 10 bodies at Umm al-Qandil in Libya; a second search could not confirm it.',
        checked: [YEAR_PAGE(2024, 'Italy'), 'https://www.lapresse.it/cronaca/2024/02/20/firenze-trovato-corpo-ultimo-operaio-disperso-in-crollo-cantiere-2/', 'https://www.ilpost.it/2024/02/18/indagini-crollo-cantiere-firenze-5-morti/', 'https://www.varesenews.it/2024/02/crollo-firenze-cgil-e-uil-proclamano-2-ore-sciopero-nazionale-edili-e-metalmeccanici-mercoledi-21-febbraio/1849440/?output=pdf'],
      },
      {
        key: 'power:Italy',
        start: '2025-07-07',
        why: 'A smaller fall, -5.7%.',
        found: 'Year page: a man died at Bergamo airport on 8 Jul, no disaster. Route: nothing found dated to the week; the wreck off Tobruk (18 dead, 50 missing) was over a weekend late in the month. Transport: nothing found.',
        flag: 'A petrol station explosion in Rome on 4 Jul, three days before: 1 dead and at least 45 hurt on the year page.',
        checked: [YEAR_PAGE(2025, 'Italy'), 'https://www.dawn.com/news/amp/1927425', 'https://www.geo.tv/amp/616392-18-migrants-die-in-shipwreck-off-eastern-libya-50-missing'],
      },
    ],
    left: ['The other weeks that pass the rules were not read one by one.'],
  },
  {
    week: 10,
    title: 'wholesale power by the week, tier 2, Italy or Spain',
    tier: 2,
    series: ['power:Italy', 'power:Spain'],
    note: 'One week instead of a whole month, so the month\'s events drop away. The card then says wholesale power, not power bills, and no week in the list uses the bills line; the US goes to three weeks, and Italy to six or Spain to three. The EIA power line in the credits goes too, and tests/bake.test.mjs expects week 10 to be monthly, so that test moves with the swap.',
    rows: [
      {
        key: 'power:Italy',
        start: '2025-10-06',
        why: 'A middle-sized rise, +9.4%, with a plain next, +6.2%.',
        found: 'Year page: nothing with deaths in the week (a plane crash on 1 Oct, 2 dead; the Verona farmhouse explosion on 14 Oct, 3 Carabinieri). Route: no single wreck found dated to it. Transport: nothing found.',
        flag: 'Libyan medics said on 11 Oct that 61 migrant bodies had come ashore west of Tripoli over two weeks. Two days after the week, the blast at Castel d\'Azzano near Verona killed 3 Carabinieri, with a state funeral and national mourning on 17 Oct. Off Lampedusa around 17 Oct a boat capsized with 1 dead and about two dozen missing.',
        checked: [YEAR_PAGE(2025, 'Italy'), 'https://www.newarab.com/news/61-bodies-migrants-recovered-west-libyas-tripoli', 'https://www.arabnews.pk/node/2619461', 'https://tg24.sky.it/cronaca/2025/10/17/carabinieri-morti-verona-funerali-padova', 'https://www.blogsicilia.it/oltrelostretto/lutto-nazionale-funerali-stato-carabinieri-morti/1188922/'],
      },
      {
        key: 'power:Italy',
        start: '2025-05-05',
        why: 'A middle-sized rise, +9.9%.',
        found: 'Year page: a diver died on 9 May working on the Bayesian, no disaster. Route: no wreck found dated to it; that search was thin. Transport: nothing found.',
        flag: 'An earlier scan named a boat fire off Zawiya (about 50 dead) and about 30 bodies at Misrata for this window. A second search could not date either to May 2025; the nearest match is a fire off Libya in September 2025. Its next is +0.1%, close to flat. It is the real week just before week 9 (2025-05-12), so the cards of weeks 9 and 10 would both read May 2025, Italy.',
        checked: [YEAR_PAGE(2025, 'Italy'), 'https://www.arabnews.pk/node/2615589'],
      },
      {
        key: 'power:Italy',
        start: '2024-04-22',
        why: 'A larger rise, +11.5%.',
        found: 'Year page: nothing with deaths in the week. Route: nothing found dated to it. Transport: nothing found; both searches were thin.',
        flag: 'It starts the day after the window of the Iran and Israel strikes closes. The Suviana dam explosion was on 9 Apr, the wreck between Malta and Lampedusa (9 dead, 15 missing) on 10-11 Apr.',
        checked: [YEAR_PAGE(2024, 'Italy'), 'https://www.voanews.com/amp/nine-people-killed-as-boat-capsizes-in-mediterranean-italy-coast-guard-says-/7565602.html'],
      },
      {
        key: 'power:Spain',
        start: '2024-12-09',
        why: 'A Spanish option with nothing found dated to the week.',
        found: 'Year page: nothing with deaths in the week. Route: no single wreck found dated to it. Transport: nothing found.',
        flag: 'Caminando Fronteras counted 9,757 dead on the Atlantic route in 2024 up to 15 Dec, so a week with no wreck found is not a week with none. Spain would have two power weeks, this and week 5.',
        checked: [YEAR_PAGE(2024, 'Spain'), 'https://rtvc.es/9-757-muertos-en-cayucos-este-2024'],
      },
      {
        key: 'power:Spain',
        start: '2023-06-12',
        why: 'The only Spanish candidate before 2024.',
        found: 'Year page: no event listed for June. Route: nothing found dated to the week on the Spanish routes. Transport: nothing found; 87 road deaths in the month by the DGT.',
        flag: 'In the week: the Pylos wreck off Greece on 14 Jun, not on a Spanish route. Four days after it: a dinghy sank south of Gran Canaria on 21 Jun, 35 to 39 dead.',
        checked: [YEAR_PAGE(2023, 'Spain'), 'https://en.wikipedia.org/wiki/List_of_migrant_vessel_incidents_on_the_Mediterranean_Sea', 'https://en.wikipedia.org/wiki/2023_Canary_Islands_migrant_boat_disaster', 'https://www.dgt.es/comunicacion/notas-de-prensa/87-personas-han-fallecido-en-siniestros-de-trafico-durante-el-mes-de-junio'],
      },
    ],
    left: [
      'Italy 2023-04-03 (+13.3%): the Nadir found about 20 drowned on the Tunisia to Lampedusa route on the night of 8-9 Apr, inside the week. https://resqship.org/wp-content/uploads/2023/04/2023-04-09_Press-release_RESQSHIP_shipwreck-23-deaths.pdf',
      'Italy 2024-12-30 (+13.6%): 20 missing off Lampedusa on 31 Dec, inside the week. https://www.ilpost.it/2025/01/01/naufragio-lampedusa-barchino-ribaltato/',
      'Italy 2024-06-17 (+11%): the week of the Nadir boat and of the Ionian rescue.',
      'Spain 2024-09-16 (+21.5%): the El Hierro wreck on 28 Sep, at least 9 dead and 48 missing, six days after.',
      'The other weeks that pass the rules were not read one by one.',
    ],
  },
  {
    week: 8,
    title: 'the calm stand-in, groceries, Italy',
    tier: 0,
    series: ['food:Italy'],
    note: 'Every grocery series has months only, so no stand-in can be a week without changing its kind, and tests/season.test.mjs asks for the same kind and tier 0. This is the week production plays until the solidarity week is reviewed. Any swap drops the only flat next in the list, so the test that names 2024-03-01 moves with it.',
    rows: [
      {
        key: 'food:Italy',
        start: '2025-07-01',
        why: 'Flat, with a plain next (+0.2%) and no EMS activation near it.',
        found: 'Year page: small events only (two heat deaths in Sardinia on 2 Jul; the Rome petrol station on 4 Jul). Transport: nothing found.',
        flag: 'On the route: the wreck off Tobruk late in the month, 18 dead and 50 missing, by IOM, off Libya. In the first days of August, inside the 7 days after the month: the cargo ship Port Fukuoka brought survivors to Pozzallo in Sicily with 2 dead newborns, and at least 7 or 8 were missing by Avvenire of 4 Aug; the rescue date itself was not found.',
        checked: [YEAR_PAGE(2025, 'Italy'), 'https://www.dawn.com/news/amp/1927425', 'https://www.geo.tv/amp/616392-18-migrants-die-in-shipwreck-off-eastern-libya-50-missing', 'https://www.avvenire.it/attualita/lultimo-naufragio-almeno-altri-otto-morti-non-contati_93923', 'https://www.pressenza.com/it/2025/08/i-naufraghi-a-bordo-del-mercantile-port-fukuoka-sbarcheranno-a-pozzallo/'],
      },
      {
        key: 'food:Italy',
        start: '2025-10-01',
        why: 'Flat, with next +0.1%, but a heavier month.',
        found: 'Year page: 3 Carabinieri killed at Castel d\'Azzano on 14 Oct, with national mourning on 17 Oct; a plane crash on 1 Oct, 2 dead; a coach driver killed near Rieti on 20 Oct. Transport: nothing else found.',
        flag: 'On the route: off Lampedusa on 17 Oct, 1 dead and about two dozen missing; off Tunisia around 23 Oct, at least 40 dead; off Libya on 27-28 Oct, 18 dead and 42 presumed dead.',
        checked: [YEAR_PAGE(2025, 'Italy'), 'https://www.arabnews.pk/node/2619461', 'https://allafrica.com/stories/202510240037.html', 'https://www.al-monitor.com/originals/2025/11/least-42-migrants-missing-presumed-dead-after-boat-capsizes-libya-iom-says'],
      },
      {
        key: 'food:Italy',
        start: '2024-02-01',
        tier: -1,
        why: 'A small fall (-0.3%), next -0.1%. Tier -1, so it needs the test and the rule of a calm stand-in changed.',
        found: 'Year page: the Esselunga site collapse on 16 Feb, 5 workers dead. Route: nothing found dated to the month. Transport: nothing found; both searches were thin.',
        flag: 'The collapse is inside the month.',
        checked: [YEAR_PAGE(2024, 'Italy'), 'https://www.ilpost.it/2024/02/18/indagini-crollo-cantiere-firenze-5-morti/'],
      },
    ],
    left: ['Feb and Nov 2025: their next is flat. Aug 2024, Mar and Dec 2025: an EMS activation within 7 days.'],
  },
];

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
const activations = JSON.parse(await readFile(join(RAW, 'ems', 'copernicus-ems-activations.json'), 'utf8')).results;
const ems = activations.filter((a) => a.countries.includes('Italy')).flatMap((a) => [a.eventTime, a.activationTime].map((t) => [t.slice(0, 10), a.code]));
/** The activations in a country within seven days of a period. */
function activationsNear(country, start, monthly) {
  const from = addDays(start, -7);
  const to = addDays(periodEnd(start, monthly), 7);
  return activations.filter((a) => a.countries.includes(country) && [a.eventTime, a.activationTime].some((t) => t.slice(0, 10) >= from && t.slice(0, 10) <= to)).map((a) => a.code);
}
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

/** The rules every candidate is held to, as a slot would be. */
const candidateRules = { windows: EXCLUDE, declarations: fema, stops: FEMA_STOP_NUMBERS };
const signedPct = (change) => `${change > 0 ? '+' : ''}${change}%`;

/** How many periods a series has in a tier, and how many pass the rules and have no EMS activation near. */
function tierCount(key, tier) {
  const s = series[key];
  const inTier = s.periods.flatMap((p, at) => (p.start >= WINDOW_START && p.tier === tier ? [[p, at]] : []));
  const pass = inTier.filter(([, at]) => periodBreach({ kind: s.kind, tier }, s, at, candidateRules) == null);
  const quiet = pass.filter(([p]) => activationsNear(s.country, p.start, s.monthly).length === 0);
  const b = s.bounds;
  const band = tier === 2 ? `${b.small.toFixed(2)}% up to ${b.medium.toFixed(2)}%` : tier === 0 ? `under ${b.calm.toFixed(2)}%` : `falls of ${b.calm.toFixed(2)}% or more`;
  return `${key}: ${band}${s.boundsFrom != null ? ' (bounds from the Spanish weeks that could be picked)' : ''}; ${inTier.length} periods in the tier, ${pass.length} pass the rules and windows, ${quiet.length} of those with no EMS activation near.`;
}

/** One group of alternatives for a week. */
function candidateLines(group) {
  const rows = group.rows.map((row) => {
    const s = series[row.key];
    const at = s.periods.findIndex((p) => p.start === row.start);
    const period = s.periods[at];
    const tier = row.tier ?? group.tier;
    const breach = periodBreach({ kind: s.kind, tier }, s, at, candidateRules);
    return { ...row, s, period, tier, breach, next: s.periods[at + 1]?.change, emsNear: activationsNear(s.country, row.start, s.monthly) };
  });
  return [
    `### Week ${group.week}: ${group.title}`,
    '',
    group.note,
    '',
    ...group.series.map((key) => `- ${tierCount(key, group.tier)}`),
    '',
    '| Period | Country | Change | Tier | Mean | Next | Rules | EMS within 7 days |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.s.monthly ? r.period.month : r.start} | ${r.s.country} | ${signedPct(r.period.change)} | ${r.period.tier} | ${r.s.monthly ? '' : `${r.period.value.toFixed(1)} EUR/MWh`} | ${signedPct(r.next)} | ${r.breach ?? 'pass'} | ${r.emsNear.join(', ') || 'none'} |`),
    '',
    ...rows.flatMap((r) => [
      `**${r.s.country}, ${r.s.monthly ? r.period.month : r.start}.** ${r.why}`,
      '',
      `- Checked: ${r.found}`,
      `- **To weigh:** ${r.flag}`,
      `- Sources: ${r.checked.join(' ')}`,
      '',
    ]),
    ...group.left.map((line) => `- Left out: ${line}`),
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
  'Checked means read on 6 Nov 2026: the year pages and searches below, with EMS and FEMA from data/raw. EMS shows no deaths. A year page misses migrant routes and transport accidents, so what it does not list is only its silence; what a second search found is under To weigh.',
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
  '## Candidates for review',
  '',
  '**Nothing here is applied.** season.json still holds the list above. A second web check found problems at weeks 7, 8 (its stand-in) and 10, and these are the alternatives for Zeynep to weigh. Each was searched on its year page, on migrant routes and for transport accidents. Those searches are one pass each and some were thin; a clear line means nothing was found, not that nothing happened.',
  '',
  'Season sums, run through src/season/model.ts on a copy of the list in memory, every row of weeks 7 and 10 and the two tier 0 stand-ins alone, and 2023-12-04, Italy 2025-10-06 and Jul 2025 together, solidarity weeks on and off: 5 hard weeks, 0.90 with One family in the hard weeks and the rest empty, 0.90 with Everyone the same way, best 1.00, lowest 0.46. The same as today in every case, since a swap keeps the kind and the tier. The tier -1 stand-in was not run.',
  '',
  ...CANDIDATES.flatMap(candidateLines),
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
