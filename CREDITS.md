# Credits

Sounds from Kenney (https://kenney.nl), CC0 (http://creativecommons.org/publicdomain/zero/1.0/): RPG Audio (metalLatch, doorOpen_1, doorClose_2, creak2, handleCoins, bookFlip1, dropLeather, chop, metalClick), Impact Sounds (impactBell_heavy_000, impactGlass_light_001, impactPlank_medium_000, footstep_concrete_000–002) and Interface Sounds (click_002), in public/audio. The town's sea, wind, traffic and market murmur are made in code.

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

## Models

Prepared for Quest with art/models/process.py (Blender): reduced to fewer triangles, textures scaled down to 512 or 1024 px, resized and turned to the town's scale; the cars, the bicycle and the bench also had all their materials baked into one colour texture, and separate badge, flag and text objects were removed. Then art/models/compress.sh stored their normals and UVs at lower precision (KHR_mesh_quantization) and dropped the lantern glass's unused texture. Files in public/models.

- Parked cars, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), generic period designs with no real make:
  - "Historical Car" by coffeecat: https://sketchfab.com/3d-models/historical-car-16be52ed0f3f4a06a3f10e2ed5db8f0f
  - "SM Retro Car 01 A" by sanyabeast: https://sketchfab.com/3d-models/archive-sm-retro-car-01-a-755a494feac543f198fc5acdcc7d3f61
  - a light truck ("DraftPunk_HW6_Detailed_1") by sipabyss: https://sketchfab.com/3d-models/draftpunk-hw6-detailed-1-a2916e544eba4b19b76b454fb0a638c5
- Bicycle ("Low-Poly Vintage Bicycle Model"), by wasabicats, CC BY 4.0: https://sketchfab.com/3d-models/low-poly-vintage-bicycle-model-5297f7525763435c8ef2e97fd3a6d30d
- Fountain ("The Old Fountain"), by Shaddy, CC BY 4.0: https://sketchfab.com/3d-models/the-old-fountain-free-dd7909ffc4a84a45b3111030c51e43c6
- Tower key (a key from the graveyard in Zakrzówek, scanned), by Virtual Museums of Małopolska, CC0: https://sketchfab.com/3d-models/key-from-the-graveyard-in-zakrzowek-c0cce9f9b07c4003915539e20d8ca050
- Townsfolk: Man in Suit and Woman in Dress from the Ultimate Animated Character Pack by Quaternius, CC0 (https://quaternius.com/packs/ultimatedanimatedcharacter.html, files via poly.pizza). Halved in triangles with art/models/character.py, only the walk and idle clips kept; the wave is made in code; skin, coat and hair colours vary per person.
- From Poly Haven, CC0 (https://polyhaven.com/license): Sunday lamp, Lantern 01 by Rajil Jose Macatangay (https://polyhaven.com/a/Lantern_01); basket, Wicker Basket 01 by Kuutti Siitonen (https://polyhaven.com/a/wicker_basket_01, handle added in code); benches, Modular Street Seating by Stuart Attenborrow (https://polyhaven.com/a/modular_street_seating, one bench assembled from the kit).

The models were downloaded through the Objaverse mirror (https://huggingface.co/datasets/allenai/objaverse, ODC-By 1.0 for the collection; each model keeps its own licence above) and from Poly Haven.

## Data

Season 1 replays real weekly and monthly price moves from public data for Italy, Spain, Germany and the US (Jan 2023 to Dec 2025). The town and everyone in it are fictional. World effects are scaled to each series' 2023–2026 range so they can be seen. Simplified game model, not policy advice.

The same text is shown to players at public/credits.html, linked from the start page. Only derived numbers ship with the game (src/season/season.json: one % change per week or month, its country, its tier, the next period's change and a few before it). scripts/fetch-data.mjs downloads the sources and scripts/bake-season.mjs computes them; data/season-report.md lists the chosen weeks and the files' checksums.

- Pump prices, Italy: Fonte: Ministero dell'ambiente e della sicurezza energetica - Direzione generale fonti energetiche e titoli abilitativi, prezzi medi settimanali dei carburanti (https://sisen.mase.gov.it/dgsaie/), accessed 31 Oct 2026, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/; the site's open-data page also names IODL 2.0). Changed: weekly % changes of the mean of Euro-super 95 and diesel prices, computed for the game.
- Pump prices, US: Source: U.S. Energy Information Administration (3 Nov 2026), Weekly U.S. Regular All Formulations Retail Gasoline Prices, series EMM_EPMR_PTE_NUS_DPG (https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EMM_EPMR_PTE_NUS_DPG&f=W), accessed 6 Nov 2026, public domain (https://www.eia.gov/about/copyrights_reuse.php). Changed: weekly % changes, computed for the game.
- Wholesale power, Italy, Spain and Germany: Ember, European Wholesale Electricity Price Data (https://ember-energy.org/data/european-wholesale-electricity-price-data/), accessed 31 Oct 2026, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); Ember's hourly source is the ENTSO-E Transparency Platform. Changed: weekly averages of daily day-ahead prices and their % changes, computed for the game.
- Grocery prices, Italy: Fonte: Istat, Prezzi al consumo per l'intera collettività (NIC), "beni alimentari, per la cura della casa e della persona" (carrello della spesa), dataflow 167_745_DF_DCSP_NIC1B2025_6 (https://esploradati.istat.it/), accessed 31 Oct 2026, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Used as published: % change on the previous month, each shown as one in-game week; provisional months left out.
- Grocery prices, Spain: Source: Eurostat, https://doi.org/10.2908/PRC_HICP_MINR, accessed 6 Nov 2026: HICP monthly index, food and non-alcoholic beverages (CP01), Spain, licensed CC BY 4.0 (https://ec.europa.eu/eurostat/help/copyright-notice). Changed: monthly % changes of the index, computed for the game, each shown as one in-game week. Eurostat has no responsibility for these changes or for the game.
- Grocery prices, US: Source: U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban Consumers, food at home, U.S. city average, not seasonally adjusted, series CUUR0000SAF11 (https://data.bls.gov/timeseries/CUUR0000SAF11), accessed 6 Nov 2026, public domain (https://www.bls.gov/opub/copyright-information.htm). Changed: monthly % changes of the index, computed for the game, each shown as one in-game week; September to December 2025 left out (October was never collected). BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.
- Disaster check, US: This product uses the Federal Emergency Management Agency's OpenFEMA API, but is not endorsed by FEMA. The Federal Government or FEMA cannot vouch for the data or analyses derived from these data after the data have been retrieved from the Agency's website(s). Dataset: FemaWebDisasterDeclarations v1 (https://www.fema.gov/api/open/v1/FemaWebDisasterDeclarations), accessed 6 Nov 2026. Used only to keep the US weeks away from disasters; none of it ships with the game.
- Weather: The data was obtained from the National Aeronautics and Space Administration (NASA) Langley Research Center (LaRC) Prediction Of Worldwide Energy Resources (POWER) Project funded through the NASA Earth Science Division (https://power.larc.nasa.gov/). POWER Daily API v2.10.1, point near Naples, accessed 31 Oct 2026.

No source endorses this game, and no source's logo is used.

## Weeks that overlap real disasters

Some weeks may overlap real natural disasters on the mainland. If they do, the game names the place in a letter and the month on the week's card, shows no damage or injuries, and lets the island respond only with help. These weeks can be switched off on the start page. Such a week ships only once reviewed; its official sources are kept with the bake (scripts/bake-season.mjs, SOLIDARITY, and data/season-report.md), not shown in the game.

## Software

Built with Immersive Web SDK (@iwsdk/core, xr-input, locomotor, scene-composition; MIT) and three.js (MIT), with elics (MIT), @pmndrs/uikit, uikit-horizon, uikit-lucide, uikit-pub-sub, pointer-events and handle (MIT), @preact/signals-core (MIT), three-mesh-bvh (MIT), yoga-layout (MIT), comlink (Apache 2.0), entities (BSD 2-Clause), Lucide icons (ISC), zod (MIT), @zappar/msdf-generator (MIT), @drawcall/uikitml (no licence published; a dependency of @iwsdk/core) and the Basis Universal transcoder (Apache 2.0, public/basis). The list comes from the build's source maps (31 Oct 2026). Every notice is reproduced in public/third-party-notices.txt, written by scripts/notices.mjs; players reach it from credits.html.
