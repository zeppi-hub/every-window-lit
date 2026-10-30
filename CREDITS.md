# Credits

Textures and sky from Poly Haven, CC0 (https://polyhaven.com/license):

- https://polyhaven.com/a/painted_plaster_wall
- https://polyhaven.com/a/roof_09
- https://polyhaven.com/a/cobblestone_floor_08
- https://polyhaven.com/a/large_sandstone_blocks_01
- https://polyhaven.com/a/medieval_blocks_02
- https://polyhaven.com/a/wood_shutter
- https://polyhaven.com/a/terracotta_floor_tiles
- https://polyhaven.com/a/roof_planks
- https://polyhaven.com/a/red_brick_03
- https://polyhaven.com/a/white_sandstone_blocks_02
- https://polyhaven.com/a/concrete_floor_02
- https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky

## Data

Season 1 replays real weekly and monthly price moves from public Italian data (Jan 2023 – Oct 2026). Ombrisa and everyone in it are fictional. World effects are scaled to each series' 2023–2026 range so they can be seen. Simplified game model, not policy advice.

The same text is shown to players at public/credits.html, linked from the start page. Only derived numbers ship with the game (src/season/season.json: one % change per week or month, its tier, the next period's change and a few before it). scripts/fetch-data.mjs downloads the sources and scripts/bake-season.mjs computes them; data/season-report.md lists the chosen weeks and the files' checksums.

- Pump prices: Fonte: Ministero dell'ambiente e della sicurezza energetica - Direzione generale fonti energetiche e titoli abilitativi, prezzi medi settimanali dei carburanti (https://sisen.mase.gov.it/dgsaie/), accessed 31 Oct 2026, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/; the site's open-data page also names IODL 2.0). Changed: weekly % changes of the mean of Euro-super 95 and diesel prices, computed for the game.
- Power prices: Ember, European Wholesale Electricity Price Data (https://ember-energy.org/data/european-wholesale-electricity-price-data/), accessed 31 Oct 2026, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); Ember's hourly source is the ENTSO-E Transparency Platform. Changed: weekly averages of Italy's daily day-ahead prices and their % changes, computed for the game.
- Grocery prices: Fonte: Istat, Prezzi al consumo per l'intera collettività (NIC), "beni alimentari, per la cura della casa e della persona" (carrello della spesa), dataflow 167_745_DF_DCSP_NIC1B2025_6 (https://esploradati.istat.it/), accessed 31 Oct 2026, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Used as published: % change on the previous month, each shown as one in-game week; provisional months left out.
- Weather: The data was obtained from the National Aeronautics and Space Administration (NASA) Langley Research Center (LaRC) Prediction Of Worldwide Energy Resources (POWER) Project funded through the NASA Earth Science Division (https://power.larc.nasa.gov/). POWER Daily API v2.10.1, point near Naples, accessed 31 Oct 2026.

No source endorses this game, and no source's logo is used.
