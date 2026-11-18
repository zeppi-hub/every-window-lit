# Repeat After Me

A seated, hands-first WebXR game for Meta Quest, built with the Immersive Web SDK.

You are the Prime Minister's parrot on the worst day of 2008, and he repeats whatever you whisper. Learn four real crisis-era words inside people's memories, with your hands, carry each one to his ear, and keep the city's windows lit until nightfall.

## Play

Open **https://zeppi-hub.github.io/repeat-after-me/** in the Meta Quest Browser and press **Enter VR**.

- Seated, with your hands. Controllers work too: the trigger or squeeze does what a pinch does.
- English captions. On the start page: **Larger captions** and **Less motion**.
- About 12 minutes (an estimate; not measured with players yet).

## The game

- Four troubles in one day: a run on the bank, a cold fire, a fog, a drought.
- Four memories that teach the words: a circus, a forest fire, a snowy mountain, a dry farm.
- The words are real policies from 2008 and 2009: safety net, firewall, stress test, prime the pump. Each policy card says what really happened, what it did and what it cost. Simplified, based mainly on the United States, 2008 to 2010. The city and its people are made up.

## How it was made

- Immersive Web SDK (`@iwsdk/core` 1.1.0-rc.2), three.js, Vite and TypeScript. The game's code is in `src/v2`.
- Most people are Microsoft Rocketbox avatars. Models, textures and sounds are listed with their licences in [CREDITS.md](CREDITS.md) and [art/v2/CREDITS-v2.md](art/v2/CREDITS-v2.md).
- Tested in the Immersive Web Emulator with emulated hands, scene by scene and in full runs from start to credits. Not yet tested on a physical Quest.

## Earlier prototype

This repository began with an earlier prototype, Every Window Lit. Its code is still under `src/` outside `src/v2`; the game reuses a few of its modules, and the rest is not part of this game.

## Develop

```sh
npm install
npm run dev      # dev server with the emulator
npm test         # unit tests
npm run build    # static build in dist/
```
