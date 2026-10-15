# Real Soccer 6 (My PC game)

3D 7-a-side football for **My PC** (Samsung Smart TV 2024+, browsers and phones). 1P vs CPU, 1P vs 2P, co-op vs CPU or CPU vs CPU.
Static site, no build step. Plug it into the My PC App Store with the address `https://imad-os.github.io/g_football/`.

## Controls

My PC only hands games abstract buttons: **OK** (gamepad A, Enter, Space, Z), **RUN** (X / Y / Shift) and **CANCEL** (Backspace; gamepad B sends RUN + CANCEL together), plus the arrows. So every move is bound to a detected button or a two-button
combination **plus a gesture**: tap, hold, hold+ or long hold. Open **Settings > Button mapping** (also reachable from Controls), pick a move, then press the real button
on your controller or keyboard: it is detected and saved (per My PC profile). Defaults work with a TV remote (arrows + OK) for the core moves.

| Move | Default |
|---|---|
| **Sprint / dribble** (with the ball: tighter control, harder to tackle) | RUN (hold) |
| **Low pass** | OK tap |
| **Through pass** | OK hold |
| **Long pass** (lob / cross) | OK hold+ |
| **Shoot** (power grows with the hold) | OK long hold |
| **Curve shot** | CANCEL + OK tap |
| **Chip shot** (lob over the keeper) | CANCEL + OK long hold |
| **One-two** (wall pass, the receiver plays it back) | CANCEL tap |
| **Tackle** | OK tap (without the ball, near the carrier) |
| **Slide tackle** | CANCEL + OK tap |
| **Press** | OK hold |
| **Team press** (team-mates close in too) | OK long hold |
| **Switch player** | CANCEL tap (or OK tap when no tackle is possible) |
| Sprint burst | double-tap a direction |
| Game menu | TV remote Back (My PC menu: game plan, settings, restart...), hold CANCEL alone, or Start |

**Settings > Player switch**: `AUTO` follows the ball (and the pass receiver), `MANUAL` only changes with the switch button.
Player 2: second keyboard (W A S D + F G) or a second gamepad.

## Layout

```
index.html            entry page (SDK first, then our files, all with ?v=<version>)
mypc-app.json         My PC manifest (id, scores, owner config, touch pad buttons)
css/style.css         plain CSS, no framework, no CDN
vendor/three.min.js   three.js r128 (MIT), self-hosted
js/core/              config (constants + settings schema), i18n (en fr es ar), bindings (button map), audio, storage (MyPC.save/load), input (MyPC onInput), quality
js/data/              teams (110 clubs and nations), formations
js/render/            assets (procedural kits and players), scene (three.js scene, camera, stadium)
js/game/              world (state + ball physics), actions (kicks, tackle), ai (CPU), controls (human), match (flow + fixed step)
js/ui/                hud (cached DOM writes, radar), menu (remote-friendly spatial focus navigation), mapper (real button detection)
js/main.js            My PC lifecycle (init / ready / start / pause / resume / destroy) and the single rAF loop
```

## My PC notes

* Input only comes from `MyPC.init({ onInput })`; there are no `keydown` listeners. Menus are navigated with arrows + OK, Back/cancel goes back.
* Saves: `MyPC.save/load` (`stats`, `settings`, `bindings`). Score: `MyPC.submitScore` at full time of a match with a human player.
* Owner config (`MyPC.app_config`, defaults in `mypc-app.json` `config`): `difficulty`, `durationMins`, `gameSpeed`, `switchMode`, `cameraMode`, `quality`, `soundEnabled`, `showRadar`, `showFPS`.
* Touch: My PC draws the pad (`OK`, `RUN`, `SW`); no own pad.
* Fixed 60 Hz step, no allocation in the update loop, DOM written only when a value changes, one `AudioContext` closed in `onDestroy`.

## Release

Bump `version` in `mypc-app.json` **and** every `?v=` in `index.html`, push, wait for GitHub Pages, then press **Update** in the
App Store Manager (`https://imad-os.github.io/g/installer/`).

> Club and player names are real; check the licensing before publishing widely.
