# Real Soccer 6 (My PC game)

3D 7-a-side football for **My PC** (Samsung Smart TV 2024+ and browsers), played with game controllers and phone controllers. 1P vs CPU, 1P vs 2P, co-op vs CPU or CPU vs CPU.
Static site, no build step. Plug it into the My PC App Store with the address `https://imad-os.github.io/g_football/`.

## Game modes

* **Exhibition**: controller sides, both teams, game plan, kick off.
* **League season**: pick a club; its whole league is the season (everyone once), with the table after every matchday.
* **Continental cup**: pick any club; 15 opponents are drawn, then round of 16, quarter-finals, semi-finals and the final.
* **World cup**: pick a nation; 15 more are drawn into four groups of four, the top two go to the knockout rounds.

In the competitions you only pick your team and **1 player or 2 players on the same team (co-op)**. The CPU matches of every
round are simulated from the team strength, a drawn knockout match is settled by a penalty shoot-out, and the competition is
saved: **Continue** on the main menu takes you back to it. Winning one adds a cup.

The **+** button (Start) presses the main button of each menu screen: next, kick off, play match, start, resume.

## Controls

Matches are played with **game controllers and phone controllers only** (a phone in My PC's Buttons mode is a real gamepad).
Player 1 is the first controller connected, player 2 the second. Movement: the left stick (analog, any direction) or the
D-pad. The TV remote and the keyboard only drive the menus; there is no on-screen touch pad (`"touch": false`).

Every move has **its own button** (or a two-button combination). **One map is shared by every controller and phone
controller**, since they all use the same standard button positions (shown with your controller's own names: Xbox, PlayStation,
Nintendo by position). There are no tap / hold gestures: **holding a button never changes the move**, only how it is played:

* the power bar fills in 0.5 s by default (**Settings > Gameplay > Power bar speed**: slow 1 s, normal 0.75 s, fast 0.5 s, very fast 0.35 s)
* passes (low, through, long): the longer the hold, the firmer the pass (up to about 35% more pace; a long ball flies flatter)
* **shoot**: the power bar sets the height where the ball crosses the goal line, from anywhere: 0-10% along the ground,
  11% just off the grass, 30% waist high, 40% chest high, 50% the crossbar, more = over the bar into the stands. The pace
  builds up over the first half of the bar (full pace from 50%). A ground shot from far out dies on the grass. The stick
  picks the side (without it: the far side from the keeper).
* curve and chip shots: a tap is a soft one, a full bar is full power
* press and team press: active as long as the button is held
* tackle, slide tackle, switch player: happen the moment the button is pressed

| Move | Button (Xbox names; standard positions) |
|---|---|
| **Sprint / dribble** | RB (hold) |
| **Low pass** | A |
| **Through pass** | Y |
| **Long pass** (lob / cross) | B |
| **Shoot** | X |
| **Curve shot** | RT + X |
| **Chip shot** | LB + X |
| **One-two** | LB + A |
| **Tackle** | B |
| **Slide tackle** | X |
| **Press** | A (hold) |
| **Team press** | Y (hold) |
| **Switch player** | LB |
| Sprint burst | double-tap a direction |
| Game menu | Start (+ on a phone controller) |

**Settings > Button mapping**: pick a move and press the button (or two together) on any controller; the map is saved per My PC
profile and used by all controllers. Maps saved by older versions keep their gamepad buttons.

**Settings > Player switch**: `AUTO` follows the ball, `MANUAL` only changes with the switch button when your team does not have the ball.
In both modes the pass receiver is selected as soon as the pass is played and a team-mate who gets the ball is selected at once:
the CPU never plays your ball carrier.

**Pass assist**: the pass goes to the team-mate closest to where you aim (the stick direction, or the way the player faces), at a
distance that suits the pass (short, through, long), preferring receivers who are not marked and lanes without a defender.
The receiver runs to meet the ball; for a long ball he reads the flight and goes to where it comes down. The stick is ignored
during that run, until somebody has the ball.

**Your player never acts on his own**: he only passes, shoots, heads or tackles at the moment you press. The one exception is
the pass assist: when a pass is played, the receiver **and the opponent nearest to that pass** run to the ball by themselves; that
player's arrow blinks yellow until somebody has the ball.

**Headers**: with a ball at head height next to your player, press pass / through / long for a headed pass or shoot for a headed
shot (the button must be down when the ball arrives). Only the player closest to the ball can head it. CPU players head
clearances and chances; your team-mates never head for you.

**Shots** follow the gauge above (speed 22 to 48). Aimed shots bend a little, hard-struck shots wobble, a streak follows the
ball. A hard shot that hits an outfield player is blocked and deflects; nobody but the keeper can simply collect it.

**The CPU shoots like a player**: it weighs 12 targets (4 across the goal, low / chest high / top corner) by how far the keeper
has to go, defenders in the line of the shot and the distance (low only close in, struck higher from range), then presses the gauge for that
height. About 3 goals per CPU vs CPU match, keepers dive about 7 times a match.

**Fouls**: a tackle (standing or sliding) that goes through the carrier from behind is a foul; from the side or the front it
is fair. Play stops, the referee whistles: a **free kick** where it happened (opponents 8 m away, no tackling until it is
played), or a **penalty** when it happened in the fouling team's own penalty area. At a penalty everybody waits outside the
box; the taker aims with the stick and shoots with the gauge (the CPU picks a corner), and the keeper must guess a side as it
is struck (about 3 in 4 penalties go in).

**Goalkeepers** read the shot with the ball physics and **dive** to where it crosses the line (a human reach and dive speed),
catching it at full stretch or pushing it away when it is too hard; shots straight at them are nearly always kept out, the
corners are hard. The keeper catches (hands) shots and balls played by the opponents inside his penalty area; a pass from a
team-mate must be played with the feet. A keeper may hold the ball 5 seconds at most: after that it is kicked long anyway.
Player 2: the second controller or phone controller connected.

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

**Match flow**: nothing freezes. After a goal a big animated **GOOOAL** appears (with the scorer and the minute), the ball
shakes the net, the scorer runs to the corner flag and slides, his team-mates chase him, the other team walks back heads down
and their keeper kneels. At half time the players walk off; at full time the winners celebrate and the losers drop to their
knees.

**Sound** (js/core/audio.js): all synthesized, no audio files. Ball strikes, tackles, the post and the net are generated with
[ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT, vendor/zzfx.js); the referee has a real "pea" whistle (one blow,
two at half time, three at full time). The crowd murmurs, roars louder as the ball gets near a goal, gasps at saves and erupts at
goals, and sings: every chant is composed on the spot (melody, key, tempo, vowels, claps or drum, end of the ground), so it never
repeats the same loop. **Settings > Crowd chants** turns the songs off.

**Ball**: Settings > Ball has 5 designs (CLASSIC, PRO, NIGHT, RETRO, GOLD).

**Kits**: every team has a change kit (white with the club colour, or dark navy for teams in a light colour). When the shirts of
both teams look alike, the away team wears its change kit (or a third colour when that still clashes); the keepers get colours
that differ from both teams.

**HUD**: the player boxes are small and see-through, and a box (or the radar) fades out when the ball is behind it.

**Settings** has three tabs: **Gameplay** (difficulty, match length, pace, power bar speed, player switch), **Graphics**
(camera, ball, quality, radar, FPS) and **Audio** (sound effects, crowd chants); **Button mapping** is at the bottom.

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
vendor/zzfx.js        ZzFX sound generator (MIT), self-hosted
js/core/              config (constants + settings schema), i18n (en fr es ar), bindings (button map), gamepad (MyPC.gamepad), audio, storage (MyPC.save/load), input (per-player controller state), quality
js/data/              teams (110 clubs and nations), formations
js/render/            assets (procedural kits and players), scene (three.js scene, camera, stadium)
js/game/              world (state + ball physics), actions (kicks, tackle), ai (CPU), controls (human), match (flow + fixed step), comp (league / cup / world cup)
js/ui/                hud (cached DOM writes, radar), menu (remote-friendly spatial focus navigation), mapper (real button detection)
js/main.js            My PC lifecycle (init / ready / start / pause / resume / destroy) and the single rAF loop
```

## My PC notes

* Matches: controllers through `MyPC.gamepad` (buttons, sticks, pad list; never `navigator.getGamepads()` ourselves). Menus: `MyPC.init({ onInput })` actions (arrows + OK, cancel goes back). No `keydown` listeners.
* The guide asks for play with the TV remote alone; this game is deliberately controller-only in matches (owner's choice), the menus still work with the remote.
* Saves: `MyPC.save/load` (`stats`, `settings`, `bindings`). Score: `MyPC.submitScore` at full time of a match with a human player.
* Owner config (`MyPC.app_config`, defaults in `mypc-app.json` `config`): `difficulty`, `durationMins`, `gameSpeed`, `switchMode`, `cameraMode`, `ballSkin`, `crowdChants`, `gaugeTime`, `quality`, `soundEnabled`, `showRadar`, `showFPS`.
* Touch: no on-screen pad (`"touch": false`): phones are used as phone controllers (Buttons mode).
* Fixed 60 Hz step, no allocation in the update loop, DOM written only when a value changes, one `AudioContext` closed in `onDestroy`.

## Release

Bump `version` in `mypc-app.json` **and** every `?v=` in `index.html`, push, wait for GitHub Pages, then press **Update** in the
App Store Manager (`https://imad-os.github.io/g/installer/`).

> Club and player names are real; check the licensing before publishing widely.
