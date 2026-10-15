# Real Soccer 6 (My PC game)

3D 7-a-side football for **My PC** (Samsung Smart TV 2024+, browsers and phones). 1P vs CPU, 1P vs 2P, co-op vs CPU or CPU vs CPU.
Static site, no build step. Plug it into the My PC App Store with the address `https://imad-os.github.io/g_football/`.

## Controls

One action button is enough, so everything works with a TV remote (arrows + OK).

| Situation | Action |
|---|---|
| Move / dribble | arrows or stick: the ball stays at the player's feet |
| **Pass** | OK (tap): short pass to the team-mate in the direction you hold |
| **Through ball** | OK held a little |
| **Long ball** (lob) | OK held longer |
| **Shot** | OK held longest (power bar fills, up / down aims) or **RUN + OK** for an instant shot |
| **Dribble sprint** | RUN (B / Shift / X): faster, tighter ball control, harder to tackle |
| Sprint burst | double-tap a direction |
| **Tackle** | without the ball, OK (tap) when an opponent carries the ball close |
| **Press** | without the ball, OK (hold): you and your team-mates close the carrier down |
| **Switch player** | CANCEL (C / Backspace / touch `SW`), or OK (tap) when no tackle is possible |
| Game menu | TV remote Back (My PC menu: game plan, settings, restart...), hold CANCEL, or Start |

**Settings > Player switch**: `AUTO` follows the ball (and the pass receiver), `MANUAL` only changes with the switch button.
Player 2: second keyboard (W A S D + F G) or a second gamepad.

## Layout

```
index.html            entry page (SDK first, then our files, all with ?v=<version>)
mypc-app.json         My PC manifest (id, scores, owner config, touch pad buttons)
css/style.css         plain CSS, no framework, no CDN
vendor/three.min.js   three.js r128 (MIT), self-hosted
js/core/              config (constants + settings schema), i18n (en fr es ar), audio, storage (MyPC.save/load), input (MyPC onInput), quality
js/data/              teams (110 clubs and nations), formations
js/render/            assets (procedural kits and players), scene (three.js scene, camera, stadium)
js/game/              world (state + ball physics), actions (kicks, tackle), ai (CPU), controls (human), match (flow + fixed step)
js/ui/                hud (cached DOM writes, radar), menu (remote-friendly spatial focus navigation)
js/main.js            My PC lifecycle (init / ready / start / pause / resume / destroy) and the single rAF loop
```

## My PC notes

* Input only comes from `MyPC.init({ onInput })`; there are no `keydown` listeners. Menus are navigated with arrows + OK, Back/cancel goes back.
* Saves: `MyPC.save/load` (`stats`, `settings`). Score: `MyPC.submitScore` at full time of a match with a human player.
* Owner config (`MyPC.app_config`, defaults in `mypc-app.json` `config`): `difficulty`, `durationMins`, `gameSpeed`, `switchMode`, `cameraMode`, `quality`, `soundEnabled`, `showRadar`, `showFPS`.
* Touch: My PC draws the pad (`OK`, `RUN`, `SW`); no own pad.
* Fixed 60 Hz step, no allocation in the update loop, DOM written only when a value changes, one `AudioContext` closed in `onDestroy`.

## Release

Bump `version` in `mypc-app.json` **and** every `?v=` in `index.html`, push, wait for GitHub Pages, then press **Update** in the
App Store Manager (`https://imad-os.github.io/g/installer/`).

> Club and player names are real; check the licensing before publishing widely.
