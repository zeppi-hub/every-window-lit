# Season 1 weeks (baked)

Written by scripts/bake-season.mjs. Read before shipping: no week should sit on a real tragedy.

| Week | Kind | Real period | Change | Tier | Next | Before |
|---|---|---|---|---|---|---|
| 1 | fuel | 2023-01-02 (Jan 2023) | 9.8% | 3 | -0.1% | 0.5, -2.6, -1.9, 1.1 |
| 2 | power | 2024-03-25 (Mar 2024) | 3.8% | 0 | -17.1% | 2.8, 7.6, -2.6, -0.7 |
| 3 | fuel | 2023-11-13 (Nov 2023) | -1.3% | -1 | -0.6% | -1, -1.1, -1, -1.2 |
| 4 | food | Aug 2025 | 0.2% | 1 | -0.2% | 0.5, 0.5, 0, 0 |
| 5 | power | 2024-04-15 (Apr 2024) | 18.4% | 3 | 11.5% | -0.7, 3.8, -17.1, 2.7 |
| 6 | fuel | 2024-02-12 (Feb 2024) | 1.5% | 2 | -0.3% | 0.5, 1.9, 0.9, 0.8 |
| 7 | power | 2024-06-10 (Jun 2024) | -7.9% | -1 | 11% | 6.1, -0.1, 6.8, 4.7 |
| 8 | food | Mar 2023 | 0.7% | 2 | 0.4% | 0.4, 0.9, 1.3 |
| 9 | fuel | 2024-07-01 (Jul 2024) | 0.7% | 1 | -0.1% | -0.8, -0.2, 0.6, 1 |
| 10 | power | 2026-01-05 (Jan 2026) | 10.6% | 2 | 14.2% | -10.8, 4, -7.3, -0.5 |
| 11 | fuel | 2023-07-31 (Aug 2023) | 2.2% | 3 | 1.1% | -0.1, 1, 0.3, 2 |
| 12 | food | Dec 2025 | 0% | 0 | 0.8% | 0.2, -0.2, 0, 0.1 |

## Tiers per series

- fuel: calm below 0.50%, small below 1.00%, medium below 1.92%, large above (199 periods since 2023-01-01).
- power: calm below 3.90%, small below 7.80%, medium below 13.62%, large above (199 periods since 2023-01-01).
- food: calm below 0.20%, small below 0.40%, medium below 0.80%, large above (45 periods since 2023-01-01).

## Never picked as price weeks

- 2023-04-24 to 2023-05-28: Emilia-Romagna floods, May 2023 (only as the solidarity week)
- 2023-07-17 to 2023-07-30: July 2023 heat and storms in the north, with deaths
- 2023-10-30 to 2023-11-12: Tuscany floods, 2-3 Nov 2023
- 2024-09-16 to 2024-09-29: Storm Boris, Emilia-Romagna, Sep 2024
- 2024-10-14 to 2024-10-27: Emilia-Romagna floods, Oct 2024 (never picked)
- 2026-09-07 to 2026-09-20: Storms of 10 Sep 2026, with deaths
- 2025-06-09 to 2025-06-29: Oil spike during the June 2025 Israel-Iran war
- 2026-03-01 to 2026-05-31: Spring 2026 fuel shock, cause not checked

## Raw files

- power/ember-daily.csv: 3643913 bytes, sha256 f0c170281624f33b6ef90258c0ebc22cfd8f631549ae1203476ed692bae710b2, fetched 2026-10-30T22:36:05.283Z, https://files.ember-energy.org/public-downloads/price/outputs/european_wholesale_electricity_price_data_daily.csv
- food/istat-nic-foodhpc.csv: 11271 bytes, sha256 b8eac9eee57e671ec0ec3d8775866c7ee6112d2cc0aab1baa77198b770b1489b, fetched 2026-10-31 (research step; the service answered HTTP 500 to the bake fetch), https://esploradati.istat.it/SDMXWS/rest/data/167_745_DF_DCSP_NIC1B2025_6/M.IT...FOODHPC?startPeriod=2022-12
- fuel/weekly-fuel-prices.csv: 77689 bytes, sha256 8a14149e88a5ff6f7bbef927a7b09c3079b634dcf1bdc35783c83a5a3b7a8a49, fetched 2026-10-30T22:51:32.291Z, https://sisen.mase.gov.it/dgsaie/api/v1/weekly-prices/report/export?format=CSV&lang=en
- weather/nasa-power-naples.csv: 43819 bytes, sha256 e19166cb9a50f24a0b4cab933c91e0ba3d9ac8228adda4546ea07e4921814eaf, fetched 2026-10-30T22:51:33.951Z, https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,WS10M_MAX&community=AG&longitude=14.291&latitude=40.884&start=20230101&end=20261031&format=CSV

season.json sha256 6a51dcbfc995fe9bbafd4f53c798ce7a3345add4ad5d34c40c238645daad00f0
