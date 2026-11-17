# Sounds (ses)

Twenty-six short mono sounds in `public/v2/ses/`, 0.84 MB in all. Ogg Opus, 48 kHz (loops 48 kbps, one-shots 64 kbps). Chromium (Quest browser, desktop Chrome) decodes every file to its exact length, so the loops play without a gap: `source.loop = true` on the decoded buffer, or `THREE.Audio.setLoop(true)`.

Twenty-five are CC0 recordings from Freesound (listed with their pages in `sources.json` and `art/v2/CREDITS-v2.md`); the pocket-watch tick and the low roar under the fire are made in `make_sounds.py`.

| File | Kind | Length | For | Suggested volume |
|---|---|---|---|---|
| `rain_loop.ogg` | loop | 16 s | rain on the square (S01, S05–S11) | 0.5 |
| `crowd_murmur_loop.ogg` | loop | 14 s | the queue and the crowd on the square | 0.4 |
| `crowd_boo.ogg` | once | 4.5 s | the crowd boos ("fresh bread", S01; Gray resists, S14) | 0.8 |
| `applause.ogg` | once | 6 s | relief after a boss is won ("PANIC CALMED" and the others) | 0.8 |
| `loaf_drop.ogg` | once | 0.8 s | one loaf landing (S01); play several with small random delays and pitch (`playbackRate` 0.9–1.1) | 0.6 |
| `bank_creak.ogg` | once | 3 s | the big bank's deep groan (S11 end, S12) | 1.0 |
| `fire_loop.ogg` | loop | 12 s | the forest fire (S09), the cold fire (S08, S10; lower the volume or the rate) | 0.7 |
| `wind_loop.ogg` | loop | 16 s | wind: the storm at sea (S13), dusty afternoon (S21), the forest edge | 0.5 |
| `waves_loop.ogg` | loop | 16 s | the sea round the ship (S13) | 0.6 |
| `ship_creak.ogg` | once | 2.9 s | the hull and mast creaking as the deck rolls (S13); repeat at random | 0.6 |
| `bucket_splash.ogg` | once | 2.5 s | a bucket emptied over the rail (S13, S15) | 0.8 |
| `pump_stroke.ogg` | once | 1.4 s | one stroke of the pump handle (S22, S23): play on every full stroke | 0.8 |
| `pump_water_loop.ogg` | loop | 8 s | water running from the pump into the channel (S22, S23) | 0.6 |
| `clock_tick_loop.ogg` | loop | 2 s | the pocket watch ticking (S04, S28, S29); `playbackRate` 2–3 while the hand winds | 0.5 |
| `paper.ogg` | once | 1.4 s | a page or newspaper (S02 newspaper, notebook headlines, policy card) | 0.7 |
| `mic_tap.ogg` | once | 1.5 s | a microphone tapped before Gray speaks | 0.6 |
| `mic_feedback.ogg` | once | 2.4 s | loudspeaker squeal (S01 "hoparlör yankısı"; keep it short and quiet) | 0.3 |

The player's own moves (second set). Each is trimmed of silence (the sound starts within 10 ms) and levelled on its loudest 50 ms, so they sit within about 3 dB of each other (-14 to -17 dBFS); peaks stay under -1 dBFS.

| File | Kind | Length | For | Suggested volume |
|---|---|---|---|---|
| `feather_rustle.ogg` | once | 0.87 s | a feather brushed: the wing's feather slots, a feather taken or given | 0.6 |
| `grab_soft.ogg` | once | 0.28 s | a soft, short grab (a pinch that takes something) | 0.6 |
| `rope_creak.ogg` | once | 1.5 s | a rope under strain creaking (the gold rope, the bucket's chain on its rope, rigging); repeat at random while it pulls | 0.6 |
| `sand_pour.ogg` | once | 2.4 s | sand or soil sliding and pouring (a sandbag filled or emptied, soil from a jug) | 0.6 |
| `sandbag_drop.ogg` | once | 0.74 s | a heavy sandbag set down | 0.7 |
| `wing_flap.ogg` | once | 0.52 s | one wing beat; play on each flap, `playbackRate` 0.9–1.15 | 0.6 |
| `wing_flaps.ogg` | once | 1.04 s | two quick beats: taking off or landing | 0.6 |
| `ear_click.ogg` | once | 0.06 s | the small click when the feather goes into the ear | 0.4 |
| `water_pour.ogg` | once | 2.9 s | water poured from a jug into a vessel (the treasury jug into the pump's cup, S23) | 0.7 |

The bucket's water stays `bucket_splash.ogg` (unchanged).

Levels: one-shots peak at -1 dBFS; loops sit at about -20 dBFS RMS (the fire, the pump water and the watch are quieter by nature). The volumes above are a starting mix, not measured in the game. Put them through a `THREE.PositionalAudio` at their source where the place matters (fire, pump, bank, ship), and a plain `THREE.Audio` for the beds (rain, crowd, wind, waves).

Not here: a creaking wooden mast or hull other than `ship_creak`, thunder, the band and spotlight sting for the circus, sparrows, the factory whistle, the radio voice (S09). Ask if they are wanted.

## Rebuilding

```bash
python3 -P art/v2/tools/freesound.py get $V2_CACHE 162190 444900 264378 656691 189312 397620 181563 117610 426076 218163 418417 361771 588629 382651 149034 411441 688555 494797 254735 467301 185543 389634 386706 478197 710550
```

```bash
V2_CACHE=<cache> python3 -P art/v2/ses/make_sounds.py
```

`freesound.py get` checks every sound's page and refuses anything that is not CC0 1.0; it takes the public high-quality preview (128 kbps MP3), so no account is needed. `make_sounds.py` lists each cut (start, length, loop or once) at the top; `make_sounds.py <name> ...` remakes only the named sounds.
