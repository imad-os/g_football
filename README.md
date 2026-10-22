# Real Soccer 6 (My PC game)

3D 11-a-side (or 7-a-side) football for **My PC** (Samsung Smart TV 2024+ and browsers), played with game controllers and phone controllers. 1P vs CPU, 1P vs 2P, co-op vs CPU or CPU vs CPU.
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
D-pad. The TV remote and the keyboard only drive the menus. On a phone or tablet My PC draws its own virtual pad (stick + A B, X Y can be added).

Every move has **its own button** (or a two-button combination). **One map is shared by every controller and phone
controller**, since they all use the same standard button positions (shown with your controller's own names: Xbox, PlayStation,
Nintendo by position). There are no tap / hold gestures: **holding a button never changes the move**, only how it is played:

* the power bar fills in 0.5 s by default (**Settings > Gameplay > Power bar speed**: slow 1 s, normal 0.75 s, fast 0.5 s, very fast 0.35 s)
* passes (low, through, long): the longer the hold, the firmer the pass (up to about 35% more pace; a long ball flies flatter)
* **shoot**: the power bar sets the height where the ball crosses the goal line, from anywhere: 0-10% along the ground,
  11% just off the grass, 30% waist high, 40% chest high, 50% the crossbar, more = over the bar into the stands. The pace
  builds up over the first half of the bar (full pace from 50%). A ground shot is struck twice as hard (the grass slows it). The stick
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

**Settings > Player switch**: `AUTO` follows the ball (after you switch by button while the opponents have the ball, it
keeps your choice until something happens: the ball changes hands, a pass, a shot), `MANUAL` only changes with the switch button when your team does not have the ball.
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

**Shots** follow the gauge above (speed 26 to 58: a struck shot flies fast and flat, not like a long ball). Aimed shots bend a little, hard-struck shots wobble, a streak follows the
ball. A hard shot that hits an outfield player is blocked and deflects; nobody but the keeper can simply collect it.

**The CPU shoots like a player**: it weighs 12 targets (4 across the goal, low / chest high / top corner) by how far the keeper
has to go, defenders in the line of the shot and the distance (low only close in, struck higher from range), then presses the gauge for that
height. About 3 goals per CPU vs CPU match, keepers dive about 7 times a match.

**Fouls**: a tackle (standing or sliding) that goes through the carrier from behind is a foul; from the side or the front it
is fair. Play stops, the referee whistles: a **free kick** where it happened (opponents 8 m away, no tackling until it is
played), or a **penalty** when it happened in the fouling team's own penalty area. At a penalty everybody waits outside the
box; the taker aims with the stick and shoots with the gauge (the CPU picks a corner), and the keeper must guess a side as it
is struck (about 3 in 4 penalties go in).

**Bookings**: a team's first foul gets a **verbal warning** from the referee (no card) for the whole team; after that any
foul by anyone in that team is a **yellow card**, and a player's second yellow = **red card**: he is sent off when play restarts and his team plays one short until the end of the match. The
card is shown over the player's head (under the arrow when you control him), every booking is a tiny card next to the team
name on the scoreboard, and the foul banner says who got what.

**Goalkeepers** read the shot with the ball physics and **dive** to where it crosses the line (a human reach and dive speed),
catching it at full stretch or pushing it away when it is too hard; shots straight at them are nearly always kept out, the
corners are hard. The keeper catches (hands) shots and balls played by the opponents inside his penalty area; a pass from a
team-mate must be played with the feet. A keeper may hold the ball 5 seconds at most: after that it is kicked long anyway.
Player 2: the second controller or phone controller connected.

## Debug matches (Settings > Debug matches)

CPU v CPU matches at full speed to find problems in the gameplay: choose the number of matches, each team's CPU level, the
teams (the pair picked on the Teams screen, with their tactics, or random teams each match), players per side, stadium
and length, then **Run** (Stop ends it early). The report goes into a text box with **Copy report**: results, key rates
(possession, pass completion per type, shots on target, conversion, tackles, first touches, shoulder challenges), every
counter per match for both teams (each kick type, every CPU decision, pass outcomes, shot outcomes by distance, keeper
saves, headers, tackles, fouls and cards, restarts, off-the-ball runs, metres run, where each team loses the ball (own /
middle / final third), completed passes going forward / square / backward...), the issues seen (ball stuck, a
restart not taken, a player far off the pitch, header chains, ping-pong turnovers, code errors) and a log of every match
with its goals and cards. The game reports its events through `NS.dbg` (js/game/debug.js), which is null otherwise.

## checkoAI (CPU level "checkoAI")

A learning player named after the owner's white rooster (js/game/aima.js). On a CPU team at level checkoAI it controls the
selected player only (violet arrow), through a virtual controller with the same stick, sprint, buttons and hold times
as a human; the other ten are the Legend CPU. A small box under the scoreboard shows what it is thinking.

- **Model**: a neural network (64 inputs: the play around him and the whole match situation, time left, score, numbers,
  cards, possession, shots; two hidden layers; heads for stick, sprint, button, power and a value). Brain sizes SMALL
  64-48 (8.6k values), LARGE 256-128, HUGE 512-256 (PC).
- **Learning** (the trainer's profile only): it copies the Legend CPU in spells it plays as the CPU (Auto: fewer as it
  learns, never under 35%), copies the trainer's own play, and learns from rewards (actor-critic, 2 s returns): goals,
  shots, passes, ball won / lost, fouls, and the trainer's **claps** (Buttons screen > Clap, default ZL; hold it: a quick
  tap is ~25%, a full 1 s hold 100%). Restarts and penalties it takes are played by the Legend CPU.
- **Trainer**: the My PC profile named "imad", signed in with his Google account (Settings > checkoAI > Sign in with
  Google, once on a computer; if the popup is blocked inside My PC, open `aima-login.html` in a browser and paste the
  code). The sign-in token is kept in the profile's My PC save, so his TV uses it too.
- **Everyone else**: signs in anonymously and plays a fresh copy of the trainer's latest model (read only).
- **Store**: its own Firebase project (`js/data/aima-cloud.js`, public web config; the app config `aimaFirebase`
  overrides it), through the REST APIs. The model is the Firestore document `aima/trainer`.

Firebase setup: Authentication > Sign-in method: enable **Google** and **Anonymous**; Authentication > Settings >
Authorized domains: add `imad-os.github.io`. Firestore rules (put the trainer's Gmail address):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /aima/trainer {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.email == 'YOUR_GMAIL@gmail.com'
                   && request.auth.token.email_verified == true;
    }
  }
}
```

## 11-a-side, the rules of the game

* **Settings > Gameplay > Players per team**: 11 v 11 (default) or 7 v 7, from the next match.
* **Settings > Gameplay > Stadium**: Compact 100 x 64, Classic 110 x 72 (default), Grand 120 x 78, Mega 130 x 86, each with
  its own grass. The players and goals are drawn about 1.5x real size, so the penalty area, goal area, spot, arc and centre
  circle are the real markings scaled to the goal (x1.25), the same in every stadium; the goal posts stand on the goal line.
  The formations are stretched to the stadium. Four formations for each size (4-4-2, 4-3-3, 4-2-3-1, 3-5-2); the squad is picked for the formation (the best keeper in
  goal, defenders at the back...), and it is picked again when the formation is changed before kick-off.
* **Out of play**: no invisible walls. Over a touchline = **throw-in** (thrown from over the head, up to about 24 m; no shots);
  over a goal line = **corner** when the defenders touched it last (the best headers go into the box with a marker each), else a
  **goal kick** taken by the keeper (the opponents leave the box). The taker cannot run with it; the stick aims. A player who
  runs the ball over the line loses it too. Nothing freezes: the ball runs on over the line, then everybody jogs to his
  place and the taker to the ball, and it is taken when he gets there.
* **Kick-offs and free kicks** are taken like real ones: the taker stands at the ball and has to play it (a pass, or a
  shot from a free kick); he cannot run off with it, and nobody comes in until it is played. The stick aims. If nothing
  happens for 10 seconds it is played anyway.
* **Offside**: judged when the ball is played (in the opponents' half, ahead of the ball and of the second-last opponent;
  never from a throw-in, a corner or a goal kick). An offside player who plays the ball gives an indirect free kick. The CPU
  never passes to a player who is offside and keeps its forwards on the line until they run in behind.
* **End of a half**: when time is up and a team is attacking in the last third (or a shot, a corner or a penalty is on), the
  referee waits until the ball goes out, changes team or leaves the last third (20 seconds at most).
* **Shoulder to shoulder**: holding **Press** next to the carrier makes the player lean in with his shoulder: he may win the
  ball or knock it off the carrier's foot (from behind rarely); otherwise both are bumped off their line. Never a foul. The CPU
  does it too, and sprints alongside a carrier who runs away with the ball (it can now win it back from a running player, not
  only from the front).
* **Headers**: the player jumps for it. A header only happens when a pass / shot button is pressed while the ball is in the
  air right next to him (a button pressed earlier while a long ball is on its way does nothing any more).
* **First touch**: a loose ball is not glued to the first player it reaches. Whether he controls it depends on its pace, how
  close it was played from (less time to react), its height and his Dribble rating; the player a pass was meant for is ready
  for it. A bad touch knocks it off him in a new direction (he touched it last: over his own goal line it is a corner).
  Won tackles often only poke the ball away. Keepers tip hard shots round the post or over the bar; defenders pinned on their
  own goal line put it behind; clearances go long towards the touchline.
* **Reaction time**: measured from when the ball was played, so its speed and the distance count together. A header needs
  0.5 s (0.6 s off another header: no head tennis); sooner, the ball just hits the player. A first touch is harder under
  about 0.4 s and impossible on a hard ball under 0.15 s. A slow ball from close by leaves time for both.
* **Tackles** only win the ball when the foot can reach it (about 1.25 m standing, 2 m sliding); a tackle that only reaches
  the man rarely works. Shoulder challenges need the players side by side.
* **Tactics** (Game plan): for each block, defence / midfield / attack: **Defensive**, **Balanced** or **Attacking**. A
  defensive defence sits deeper and marks tighter; an attacking one holds a high line and its full-backs overlap. Attacking
  midfielders make late runs into the box; attacking forwards stay high and run in behind more often. Attacking scores
  more and concedes more; defensive makes tight, low-scoring games.
* **Off-the-ball runs** (CPU and your team-mates): forwards level with the last defender bend runs into the gap behind it
  (straight or diagonal) so you can play a through ball; midfielders arrive in the box late; full-backs overlap. A through
  ball prefers a team-mate who is making a run.
* **Pass power picks the depth**: the longer you hold pass / through / long ball, the further away the receiver: with two
  team-mates in a row in that direction, a short tap finds the near one and a full bar the one behind him.
* **Player switching** goes to the team-mate who reaches the ball first (where it is going, not only where it is); a pass
  that is cut out frees the cursor at once, and holding Press keeps pressing with the new player.
* **Referee** on the pitch, in black, or yellow when a team plays in a dark kit.
* **Teams screen**: each side picks from its own league / group (PSG against Real Madrid, a club against a nation).
* **Player ratings** are shown on a PES-style hexagon (Speed, Dribble, Shoot, Stamina, Header, Defense).
* **Shots from range** can go in, less often the further out they are struck (the keeper sees a long shot coming for longer).
* Players have longer legs (about half their height) with shorts, socks and boots painted on, no extra polygons.

## Player ratings (js/data/players.js)

Every player has six ratings (0 to 99): **Speed, Dribble, Shoot, Stamina, Header, Defense** (for a keeper Defense is his
keeping). About 300 known players are rated by hand from their real level (Mbappe 97 speed / 91 shooting, Haaland 94 shooting /
88 heading, Courtois 90 keeping, Ezzalzouli 93 speed / 87 dribbling...); everybody else gets ratings from his club or nation
level (stars and league: a Real Madrid squad averages about 85, a Botola squad about 65), his position in the squad order and a
fixed personal variation. They change the game:

* Speed: running pace (about 84% to 110%); Stamina: how fast he tires (a tired player slows down; a restart gives some back)
* Dribble: how hard the ball is to take off him; Defense: how well he tackles, and a keeper's saves
* Shoot: shot accuracy and pace; Header: how far he reaches a header and how hard he heads it

The game plan shows every player's overall rating and the six bars of the selected player. Both teams start in 4-4-2
(in 7-a-side 4-3-3, with three forwards against two defenders, is a strong attacking choice).

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
* **Difficulty** changes speed (86% on EASY to 112% on LEGEND), reaction time, decision noise, pass / shot accuracy, tackling,
  marking tightness, a second presser and the keeper. CPU vs CPU: EASY loses every match to NORMAL, HARD and LEGEND win
  nearly all of them.

Measured with a headless simulator (NORMAL vs NORMAL, 3-minute matches, v1.5): pass completion about 90 to 95%, about 9 shots
and 3 goals per match.

**Match flow**: nothing freezes. After a goal a big animated **GOOOAL** appears (with the scorer and the minute), the ball
shakes the net, the scorer runs to the corner flag and slides, his team-mates chase him, the other team walks back heads down
and their keeper kneels. At half time the players walk off; at full time the winners celebrate and the losers drop to their
knees.

**Sound** (js/core/audio.js): all synthesized, no audio files. Passes and shots are a modelled leather "thock" (the ball's
low thud with a fast pitch drop, the contact click, a rush of air on a shot); tackles, the post and the net are generated with
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

* Pitch 105 x 68 (real size), ball radius 0.43. The 7-a-side formations are stretched to it.
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
js/data/              teams (110 clubs and nations), players (ratings), formations
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
* Touch: My PC's own virtual pad on phones and tablets (no `"touch"` entry in the manifest); phones can also be phone controllers.
* Fixed 60 Hz step, no allocation in the update loop, DOM written only when a value changes, one `AudioContext` closed in `onDestroy`.

## Release

Bump `version` in `mypc-app.json` **and** every `?v=` in `index.html`, push, wait for GitHub Pages, then press **Update** in the
App Store Manager (`https://imad-os.github.io/g/installer/`).

> Club and player names are real; check the licensing before publishing widely.
