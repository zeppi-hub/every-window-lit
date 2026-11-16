# Every Window Lit

A seated, hands-first WebXR game for Meta Quest. From a tower window, you look after a made-up island for twelve weeks. Each week, send a basket down and light your lamp. More windows light the festival.

The prices are real, from public data (Italy, Spain, Germany and the US, January 2023 to December 2025). The island and its people are made up.

## Play

Open **https://zeppi-hub.github.io/every-window-lit/** in the Meta Quest Browser and press **Enter VR**.

- Seated, with your hands. A white hand shows each step. Controllers work too: the trigger pinches.
- On the start page: **Larger captions**, **Less motion**, and a switch for the one week that mentions a real flood on the mainland (shown only as the island helping).
- **For judges:** the start page has three sample buttons (Week 6, Week 11, Festival night) for a shorter look. A full season takes about 18 minutes at a quick pace.

## How it was made

- Immersive Web SDK (`@iwsdk/core` 1.1.0-rc.2), three.js, Vite and TypeScript.
- The twelve weeks are baked into the build from public price series (`scripts/fetch-data.mjs`, `scripts/bake-season.mjs`). Sources and every third-party asset are listed in [CREDITS.md](CREDITS.md).
- Tested in the Immersive Web Emulator, including hands-only runs from the start page to the end of the season. Not yet tested on a physical Quest.

## Develop

```sh
npm install
npm run dev      # dev server with the emulator
npm test         # unit tests
npm run build    # static build in dist/
```
