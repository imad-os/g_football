# Real Soccer 6 (My PC game)

3D 7-a-side football for **My PC** (Samsung Smart TV 2024+, browsers and phones). 1P vs CPU, 1P vs 2P, co-op vs CPU or CPU vs CPU.
Static site, no build step. Plug it into the My PC App Store with the address `https://imad-os.github.io/g_football/`.

## Controls

Every move has two bindings: **TV / KB** (remote, keyboard, touch pad, phone) and **PAD** (a gamepad, every physical button: A B X Y by position, L R, ZL ZR, L3 R3; read directly with `navigator.getGamepads()` like the other g_ games, shown with the controller's own names (Nintendo, Xbox, PlayStation); until a real press is seen the gamepad uses My PC's OK / RUN / CANCEL and the TV / KB side). Detection cancels itself after 5 s without a press; no button cancels it. Gamepad defaults (PES style): A pass, Y through, B long, X shoot, ZR + X curve, L + X chip, L + A one-two, R sprint; without the ball A press, B tackle, X slide, Y team press, L switch.

On the remote / keyboard side My PC hands games abstract buttons: **OK** (gamepad A, Enter, Space, Z), **RUN** (X / Y / Shift) and **CANCEL** (Backspace; gamepad B sends RUN + CANCEL together), plus the arrows. So every move is bound to a detected button or a two-button
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

The player you control has an arrow over his head pointing down at him: **light blue for P1, light red for P2**, with a dark
border (same colours on the player plates and the radar). The arrow **blinks yellow while your player is receiving a pass**:
the receive assist is running him to the ball.

**Settings > Player switch**: `AUTO` follows the ball, `MANUAL` only changes with the switch button when your team does not have the ball.
In both modes the pass receiver is selected as soon as the pass is played and a team-mate who gets the ball is selected at once:
the CPU never plays your ball carrier.

**Pass assist**: the pass goes to the team-mate closest to where you aim (the stick direction, or the way the player faces), at a
distance that suits the pass (short, through, long), preferring receivers who are not marked and lanes without a defender.
The receiver runs to meet the ball; for a long ball he reads the flight and goes to where it comes down. The stick is ignored
during that run, until somebody has the ball.

**Headers and first-time touches**: while a ball is coming to you (or is in the air near you), press pass / through / long for a
headed pass, or shoot for a headed shot. The header happens as soon as the ball is at head height; pressed early, it waits for
the ball. If the ball arrives on the ground instead, the move is played first time. CPU players head clearances and chances too.

**Shots** are driven, not lobbed: the stick picks the side (without it: the far side from the keeper), the power (hold)
picks the height, from low and placed to rising into the top corner (full power can fly over), with speed 24 to 46. Aimed
shots bend a little, full-power shots wobble, and a streak follows the ball.

**Goalkeepers** read the shot with the ball physics and **dive** to where it crosses the line, catching it at full stretch or
pushing it away when it is too hard; shots straight at them are nearly always kept out, the corners are hard. The keeper catches (hands) shots and balls played by the opponents inside his penalty area; a pass from a
team-mate must be played with the feet. A keeper may hold the ball 5 seconds at most: after that it is kicked long anyway.
Player 2: second keyboard (W A S D + F G) or a second gamepad.

## CPU football brain (js/game/ai.js)

* **Team plan every step**: attack / defend / loose-ball phase, who presses, who covers, man-marking of the most dangerous
  opponents, one back line, and the player who can **reach a loose ball first** (passes are read and intercepted).
* **Ball carrier** scores every option: dribble in 5 directions, short pass / through ball / long ball to each team-mate, or
  a shot. It weighs lane interception risk, space around the receiver, progress, and shot quality (goal angle, distance,
  blockers, keeper), then plays the best one. Shots aim at the far post with a spread that grows with distance and pressure.
* **Off the ball**: two players offer passing angles, forwards make runs in behind the last defender, wide players
  keep width, and everybody stays level with the defensive line.
* **Defence**: the presser goes goal-side, jockeys and times the tackle; a cover player sits behind; markers stand goal-side,
  shaded towards the ball to block the lane; the rest keep a compact block. Players have bodies and cannot be run through.
* **Ball protection**: the carrier's body shields the ball. A tackle from behind rarely wins it (and the tackler stumbles longer),
  from the side about half as often as from the front; the CPU runs round the carrier to get goal-side instead of tackling his back.
* **Goalkeeper**: angle positioning, reaction time to shots, rushes out for through balls it can reach first, one save
  attempt per shot (placement and pace matter), distributes to a free team-mate.
* **Game state**: a team losing late pushes its line higher and takes more risks; a team leading late keeps the ball.
  Coin toss for the kickoff, teams swap kickoff at half time.
* **Difficulty** changes intelligence (reaction time, decision noise, pass/shot accuracy, marking tightness, second presser,
  keeper) more than raw speed.

Measured with a headless simulator (NORMAL vs NORMAL, 3-minute matches, v1.5): pass completion about 90 to 95%, about 9 shots
and 3 goals per match.

**Ball**: Settings > Ball has 5 designs (CLASSIC, PRO, NIGHT, RETRO, GOLD).

**Kits**: every team has a change kit (white with the club colour, or dark navy for teams in a light colour). When the shirts of
both teams look alike, the away team wears its change kit (or a third colour when that still clashes); the keepers get colours
that differ from both teams.

**HUD**: the player boxes are small and see-through, and a box (or the radar) fades out when the ball is behind it.

## Physics and animation

* Pitch 110 x 67 (20% bigger than before), ball radius 0.43 (10% smaller). Formations are stretched with the pitch (`PITCH_SCALE`).
* Ball (js/game/world.js): gravity, light air drag, rolling drag plus rolling resistance (the ball stops instead of creeping),
  bounces that lose height and some pace, spin that curls the ball sideways in the air, posts and crossbar that the ball bounces
  off. `World.predict` / `World.intercept` run the same physics ahead so receivers, the CPU and the keeper read the flight.
  Kicks are aimed with that model (long balls and chips land where they are aimed despite the air drag).
* Players (js/render/assets.js + `animate` in js/game/match.js): legs and arms swing from hips and shoulders, body leans with speed;
  kick and shot (back-swing and strike, bigger for shots and long balls), standing tackle lunge, slide tackle on the grass,
  knocked off balance after losing the ball, keeper dives to the side of the shot and holds the ball in front.

## Layout

```
index.html            entry page (SDK first, then our files, all with ?v=<version>)
mypc-app.json         My PC manifest (id, scores, owner config, touch pad buttons)
css/style.css         plain CSS, no framework, no CDN
vendor/three.min.js   three.js r128 (MIT), self-hosted
js/core/              config (constants + settings schema), i18n (en fr es ar), bindings (button map), gamepad (real controller buttons), audio, storage (MyPC.save/load), input (MyPC onInput), quality
js/data/              teams (110 clubs and nations), formations
js/render/            assets (procedural kits and players), scene (three.js scene, camera, stadium)
js/game/              world (state + ball physics), actions (kicks, tackle), ai (CPU), controls (human), match (flow + fixed step)
js/ui/                hud (cached DOM writes, radar), menu (remote-friendly spatial focus navigation), mapper (real button detection)
js/main.js            My PC lifecycle (init / ready / start / pause / resume / destroy) and the single rAF loop
```

## My PC notes

* Input only comes from `MyPC.init({ onInput })`; there are no `keydown` listeners. Menus are navigated with arrows + OK, Back/cancel goes back.
* Saves: `MyPC.save/load` (`stats`, `settings`, `bindings`). Score: `MyPC.submitScore` at full time of a match with a human player.
* Owner config (`MyPC.app_config`, defaults in `mypc-app.json` `config`): `difficulty`, `durationMins`, `gameSpeed`, `switchMode`, `cameraMode`, `ballSkin`, `quality`, `soundEnabled`, `showRadar`, `showFPS`.
* Touch: My PC draws the pad (`OK`, `RUN`, `SW`); no own pad.
* Fixed 60 Hz step, no allocation in the update loop, DOM written only when a value changes, one `AudioContext` closed in `onDestroy`.

## Release

Bump `version` in `mypc-app.json` **and** every `?v=` in `index.html`, push, wait for GitHub Pages, then press **Update** in the
App Store Manager (`https://imad-os.github.io/g/installer/`).

> Club and player names are real; check the licensing before publishing widely.
