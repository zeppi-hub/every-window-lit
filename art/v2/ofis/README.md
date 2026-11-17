# Leader's office and press room (ofis)

Two connected interiors: the Prime Minister's office (desk, bookcases, flags, three tall windows looking over the 2008 neighbourhood) and the press room next door, where the leader stands at the podium and repeats the parrot's word into the microphone. The seal reads OFFICE OF THE PRIME MINISTER; the flag is fictional (green field, white ring, gold stripe). No real country, person or brand.

- Game file: `public/v2/ofis/ofis.glb` (2.1 MB, Draco + KTX2, loads like the neighbourhood; see `art/v2/mahalle/README.md`)
- Build: `art/v2/ofis/build.py`; prints from `art/v2/tools/textures_ofis.py`; the window view is a render of the neighbourhood (`art/v2/tools/window_view.py`)
- Previews: `art/v2/ofis/preview/*.jpg`; numbers: `stats.json`, `pack-report.json`

Units metres, glTF Y-up, build-script north = three.js -Z. Press-room floor is y = 0, the stage top y = 0.3.

## Budget

28,800 triangles, 42 draw calls, 1.8 MB of textures, 2.1 MB in all. Everything is in view at once at most.

## Named nodes

| Node | What | Pivot |
|---|---|---|
| `podium_mic` | gooseneck microphone on the podium | base on the podium top; the head is at `spot_mic_head` |
| `tv_screen_left`, `tv_screen_right` | the two screens beside the stage (self-lit material `screens`; left shows a LIVE briefing card, right a falling market chart). Swap their texture to show headlines | screen centre plane |
| `desk_lamp` | green banker's-lamp shade (emissive, so it can be dimmed or lit) | shade centre |
| `desk_phone_handset` | handset on the desk telephone | handset centre, bottom |
| `office_door` | door between office and press room | on its hinge (press-room wall, south jamb); a positive angle about local Y opens it into the office |
| `press_door_left`, `press_door_right` | main double doors of the press room (south) | on their outer hinges; into the room: left negative, right positive about local Y |

## Points

Seats are floor points (add about 1.2 m for a seated eye); forward is local -Z.

| Point | Where, facing |
|---|---|
| `seat_press_front` | front-row aisle seat, facing the podium |
| `seat_stage_side` | chair at the side of the stage, facing the podium and the rows. Good spot for the persona with the parrot |
| `seat_office_guest` | guest chair in front of the desk, facing the leader |
| `spot_leader_podium` | behind the podium, facing the rows |
| `spot_mic_head` | the microphone head |
| `spot_parrot_podium` | corner of the podium top |
| `spot_leader_desk` | the leader's armchair, facing the guests |
| `spot_parrot_desk` | corner of the desk |
| `spot_reporter_01` … `spot_reporter_17` | the other press chairs (for seated reporters) |
| `spot_camera_operator_1` … `_3` | behind the three broadcast cameras |

## Notes for the game

- The rooms have no lights, only emissive ceiling panels: add a few point or spot lights (one over the podium, one over the desk) and an environment map. The window view is self-lit, so it reads as daylight.
- The office window panes are a faint blended material (`pane`, alpha 0.12); everything else is opaque.
- The main doors open onto a short dead-end corridor so they can swing open.

## Rebuilding

```bash
python3 art/v2/tools/fetch_tex.py "$V2_CACHE" 1k herringbone_parquet plastered_wall_04 dark_paneled_wood walnut_veneer velour_velvet brown_leather marble_01
```

Models: `bash art/models/fetch_polyhaven.sh <id> "$V2_CACHE/<id>" 1k` for each Poly Haven id in `sources.json`. Then:

```bash
python3 -P art/v2/tools/textures_ofis.py "$V2_CACHE/gen"
```

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/tools/window_view.py -- <mahalle_raw.glb> art/panorama/source/kloofendal_48d_partly_cloudy_puresky_2k.hdr "$V2_CACHE/gen/window_view.png"
```

```bash
V2_CACHE=<cache> nice -n 20 blender -b --factory-startup --python art/v2/ofis/build.py -- /tmp/ofis_raw.glb --preview /tmp/prev
```

```bash
node art/v2/tools/pack.mjs /tmp/ofis_raw.glb public/v2/ofis/ofis.glb art/v2/ofis/pack-report.json
```
