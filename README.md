# Real Soccer 6 (My PC game)

3D 11-a-side (or 7-a-side) football for **My PC** (Samsung Smart TV 2024+ and browsers), played with game controllers and phone controllers. 1P vs CPU, 1P vs 2P, co-op vs CPU or CPU vs CPU.
Static site, no build step. Plug it into the My PC App Store with the address `https://imad-os.github.io/g_football/`.

## Game modes

* **Exhibition**: controller sides, both teams, game plan, kick off. With nobody on either team (CPU v CPU) the sides
  screen picks each side's level (Easy, Normal, Hard, Legend, checkoAI) and, for a checkoAI side, the brain that plays it
  (up / down walk these, left / right still move the controller icons).
* **League season**: pick a club; its whole league is the season (everyone once), with the table after every matchday.
* **Continental cup**: pick any club; 15 opponents are drawn, then round of 16, quarter-finals, semi-finals and the final.
* **World cup**: pick a nation; 15 more are drawn into four groups of four, the top two go to the knockout rounds.

In the competitions you only pick your team and **1 player or 2 players on the same team (co-op)**. The CPU matches of every
round are simulated from the team strength, a drawn knockout match is settled by a penalty shoot-out, and the competition is
saved: **Continue** on the main menu takes you back to it. Winning one adds a cup.

The **+** button (Start) presses the main button of each menu screen: next, kick off, play match, start, resume.

## Controls

Two players (P1, P2) play with **any device**: a game controller, a phone controller (a phone in My PC's Buttons mode is
a real gamepad), the **keyboard / TV remote** (arrows, Enter / Space = A, Shift = X, Esc = menu) or a second keyboard
player (W A S D, F, G: My PC's `keys2`, listed once it is used). The **sides screen** has one row per device: each device's
stick, D-pad or arrows move its own icon left (home), right (away) or to the middle (not playing); the first two devices on
a side are P1 and P2, so a controller can play home and the keyboard away, or both together on one side against the CPU.
Movement: the left stick (analog, any direction), the D-pad or the arrows. Start on any controller (or Esc) opens the menu.
On a phone or tablet My PC draws its own virtual pad (stick + A B, X Y can be added).

With two players the **Teams** and **Game plan** screens have **two cursors** (P1 light blue, P2 light red), each player
working on his own side at the same time (both on one side: P1 his, P2 the CPU team's); the shared buttons (Back, Next,
Kick off) are for both, only P1's Back leaves a screen. Teams: each side picks its league or continent first, then a team
(Back: the leagues again). Game plan: the two sides next to each other, each with its formation, tactics, starters and bench.

Every move has **its own button** (or a two-button combination). There are **two maps** (Settings > Button mapping):
the **controllers'** (every game controller and phone controller, by the standard button positions, shown with your
controller's own names: Xbox, PlayStation, Nintendo by position; checkoAI plays with it too) and the **keyboard's**: a
key or two together, the arrows moving the player and Esc opening the menu. Defaults: with the ball S pass, W through
ball, A long ball, D shot, F curl, G chip; without it S press, W team press, A tackle, D slide, G switch; Shift sprint;
Enter (the TV remote's OK) passes unless mapped. Each player plays with his device's map.
Inside My PC the game is a frame and My PC keeps the keyboard: it sends only actions, and js/core/keyboard.js turns the
ones that tell keys apart back into keys: Enter (Space and Z send the same), Shift (X too) and My PC's second-keyboard
keys W A S D F G (so there is one keyboard player; those are his). Opened in a browser (or once the game has the focus)
every key reaches the game and is read directly (an exception to My PC's "no keydown of your own", asked for by the owner). The sides screen: the first device to take a side is P1 (when P1 goes back to the middle, P2 becomes P1);
when it opens for the first time, the device that used the menus is P1. There are no tap / hold gestures: **holding a
button never changes the move**, only how it is played:

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
| **Keeper rush** (he comes off his line for the ball: claims it, or goes in at the feet of the man who has it) | LT / ZL (hold); keyboard F (hold) |
| Sprint burst | double-tap a direction |
| Knock-on (push the ball ahead and run onto it) | tap sprint again and again while dribbling: every second tap (he chases it by himself) |
| Game menu | Start (+ on a phone controller) |

On the Settings page a controller's **L / R** go to the tab before / after (Gameplay, Graphics, Audio, Commentator,
checkoAI, round).

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

## Replays and the full-time screen

- **Replays** (js/game/replay.js) use the match camera. The last 10, 15 or 20 seconds (Settings > Video > Replay length)
  are kept while playing; the pause menu's **Replay** shows them, and each goal is shown again after the celebration
  (Settings > Video > Goal replays). Controls: **left stick** = speed (a little right: slow motion, all the way: x3;
  left: rewind), **A** = pause / play, **B** or **+** = exit. TV remote: OK pause, left / right speed, up exit.
  Recording copies what is on screen 30 times a second into one buffer made once (Int16, ~430 KB); each goal keeps its
  own clip (up to 12 per match). Nothing is recorded in debug matches.
- **Full time** (js/game/stats.js + the RESULT screen): the score, the scorers, possession, xG (from the distance and
  the angle of each shot), shots, shots on target and cards; **Full stats** adds passes, pass accuracy, corners, saves,
  fouls, offsides and the cards; **Replay goals** plays any goal of the match again. Then **Play again** (same teams),
  **Change teams** or **Exit** (in a competition: **Continue**).

## Debug matches (Settings > Debug matches)

CPU v CPU matches at full speed to find problems in the gameplay: choose the number of matches, each team's CPU level, the
teams (the pair picked on the Teams screen, with their tactics, or random teams each match), players per side, stadium
and length, then **Run** (Stop ends it early). The report goes into a text box with **Copy report**: results, key rates
(possession, pass completion per type, shots on target, conversion, tackles, first touches, shoulder challenges), every
counter per match for both teams (each kick type, every CPU decision, pass outcomes, shot outcomes by distance, keeper
saves, headers, tackles, fouls and cards, restarts, off-the-ball runs, metres run, where each team loses the ball (own /
middle / final third), completed passes going forward / square / backward...), the issues seen (ball stuck, a
restart not taken, a player far off the pitch, header chains, ping-pong turnovers, code errors) and a log of every match
with its goals and cards. A **TEAM SHAPE** section gives averages twice a second, with and without the ball (and
"settled": a possession of 3 s or more): team width and length, players within 12 m of the ball, flat lines, the gaps
between the lines, lanes used in the final third, players behind the ball when it is lost, regain time; plus the seconds
spent in each moment of the game, pressing triggers, time over a line, and the kind of every long ball (switch, over the
top, cross, chip to a runner). A checkoAI side is named with its brain and its Legend help. The game reports its events through `NS.dbg` (js/game/debug.js), which is null otherwise.

## checkoAI (CPU level "checkoAI")

A learning team named after the owner's white rooster (js/game/aima.js). On a CPU team at level checkoAI one network
plays every outfield player, each through his own virtual controller with the same stick, sprint, buttons and hold times
as a human (the violet arrow shows the player with the ball, or nearest to it); the keeper is the game's. A small box in
the top-right corner shows what it is thinking (a clap / punishment shows there for 1.5-2.5 s, then his thoughts again).
**RT match control** (a brain setting, default 1 player): in a real-time match the brain plays only the team's selected
player (the violet marker, switched like a human's cursor; a pass moves it to the receiver) and Legend the other ten, so
everything he sees is real football, every reward is his own and every clap reaches the right move; "11 players" plays
every outfield player as before. Trainings and recordings always use all of them.
**Pause > checkoAI** shows what he is learning in the match in progress: how many decisions were his own (and Legend's
help), lessons from rewards and from copying Legend, his passes / shots / balls won and lost, where the match's rewards
came from (bars: green = do more of it, red = less) and the latest rewards with their minute. The full-time page has
the same page behind its **checkoAI** button (next to Full stats).

- **Brains**: several networks, each with its own settings, stats and history (Settings > checkoAI > Brains: use, clone,
  rename, new, delete). The active brain (★) plays the matches and is the one every other profile gets. Sizes SMALL
  TINY 32-24, MEDIUM 64-48 (8.6k values), LARGE 256-128, HUGE 512-256 (PC); each brain has its own settings (style, speed,
  foresight, memory, weight of the trainer's play, learning, exploring...); a clone copies them, a new brain has the defaults. 96 inputs: the play around him, his ratings (speed, dribble, shoot,
  stamina, header, defense), position and spot in the formation (and the team's back line), the nearest opponents' speed, the last seconds (option "Memory of the last
  seconds": who had the ball 1 s ago, his team's last pass / shot / tackle and how it went, recent shots, where the play
  is going, how long the ball has been on one foot) and the whole match situation (time left, score, numbers, cards,
  possession, shots). Not his own running speed: copying Legend with it, a brain learnt "keep running the way you run"
  and, once stopped, never moved again. A brain saved with fewer inputs gets the new ones with weights of 0.
- **Learning** (the trainer's profile only): it copies the Legend CPU in spells the CPU plays for each player (Auto: fewer
  as it learns, never under 35%; "Legend 100%" = copying only), copies every Legend player of the other team in a training
  against Legend, copies the trainer's own play, and learns from rewards (actor-critic, 2 s returns): goals,
  shots, passes, ball won / lost, fouls, and the trainer's **claps** (Buttons screen > Clap, default ZL; hold it: a quick
  tap is ~25%, a full 1 s hold 100%). A clap is for what he did in the 3.5 s before the button went down: his latest
  pass / shot / tackle / ball won there (else what he did ~0.8 s before), and the Legend moves he copied then count more;
  his decisions wait 4.5 s before they are learnt so a late clap still reaches them. Penalties it takes are played by the
  Legend CPU. Legend's passes, shots and tackles are ~1% of his decisions: they are kept in a memory of their own (with his
  decisions in the 0.25 s before a kick, when a button would go down) and drawn for 8% of the copying steps; learning
  steps are averaged 8 at a time. The stick goes where his odds point on average (not the single likeliest of the 9).
  Stats: "Same button as Legend at his passes / shots" and his odds of it.
- **Training** (Settings > checkoAI > Training): sessions. Each one is a brain (the one picked at the top), its own
  opponent (the CPU at any level, or a brain, which learns too), number of matches, pitch and time limit ("Stop after
  (hours)"), with its own progress bar,
  Stop, summary and full stats. Start as many as you like: the running ones take turns, one match each, and count only
  their own matches. Every brain is saved after each of its matches (a stopped session keeps what it played).
- **Recorded data** (Settings > checkoAI > Training, its own card; the training sessions above work as before): **Record
  Legend v Legend** plays Legend against Legend at full speed (players, stadium, minutes, matches and "stop after" from the
  options above; the record matches take turns with the training matches) and keeps every outfield player's decisions in a
  **named data set**: his 96 inputs, what Legend did (stick, sprint, button, power) and how the next 10 seconds went for
  his team (goals). All of Legend's passes / shots / tackles are kept (with his decisions in the 0.25 s before a kick), one
  in three of his other decisions without the ball. 8 bits a number, chunks of 5,000 decisions (~700 KB), about 13,000
  decisions per 11-a-side match. **Learn from data**: the brain picked at the top learns from a set without playing (1-20
  passes over it, ~6,000 steps a second on a PC): the presses drawn 8% of the time, the decisions he already gets right
  (over 90% sure of Legend's stick and button) skipped, the value head learns the 10-second outcome. A twentieth of the set is
  never learnt from: the score (direction, same button at Legend's presses, his odds of it, presses where Legend pressed
  nothing) before and after. A set recorded with other inputs cannot be used (record again). Delete removes it from the cloud.
  **Windows**: a set is learnt a window of chunks at a time (Chunks per window: 25 / 50 / 100 (default) / 200). Training
  starts as soon as the first chunk is in; the rest of the window and the next window are fetched meanwhile (4 at a
  time, each tried 3 times), training never runs ahead of what came in, and a finished window leaves memory, so a set of
  any size fits. After the last window a new round starts from the first (Rounds: 1, 2, 5, 10 or ∞ until stopped / the
  time limit; chunks recorded meanwhile join the next round). The score uses a fixed random sample of 20,000 held-out
  decisions from every window seen. **The brain is saved every minute** with where it got to (passes, chunks, the next
  window): after a stop, a crash or a closed page the next run on that set goes on from that window.
  A chunk the cloud refuses (rules not applied yet, network) is tried again 3 times (8 s, 20 s, 45 s); one given up stays in
  memory and the card shows **Resend unsaved chunks** (works while the app stays open; a restart loses what was not sent).
- **Work** (Stats > Work): each brain counts the arithmetic operations it does (playing and learning), per second of
  play: the same number on any device (how heavy the brain is; the share of CPU then depends on the device). Also the
  expected work of its current settings (learning on / off), one decision, one learning step, the total, its memory.
  Tiny ~2 M, Medium ~5 M, Large ~32 M, Huge ~104 M operations per second of play while it learns.
- **Trainer**: the My PC profile named "imad", signed in with his Google account (Settings > checkoAI > Settings > Sign
  in with Google, once on a computer; if the popup is blocked inside My PC, open `aima-login.html` in a browser and paste
  the code). The token is kept in the profile's My PC save, so his TV and other devices are signed in too.
- **Everyone else**: signs in anonymously and plays a fresh copy of the active brain (read only).
- **Trainer page** (`trainer.html`, `https://imad-os.github.io/g_football/trainer.html`): checkoAI's training in a plain
  browser tab, dark, without My PC, the 3D view or the menus: brains (show, use in the game, new, clone, rename, delete,
  every setting, save, reset), learn from data (passes, chunks per window, rounds, time limit), record Legend v Legend,
  training matches, every job with its live text and progress, the brain's numbers and history. It loads the game's own
  files (simulation, js/game/aima.js, the debug runner) with small stand-ins for the screen side (js/trainer/host.js), so
  every game update reaches it; option lists live in `NS.Aima` (OPTS, TR_OPTS, DT_*) for both screens. Sign in with
  Google there (or paste a code from `aima-login.html`); on the same site the game's sign-in is picked up by itself. It
  keeps training in a background tab and asks before the page is closed while a job runs. `?aimatrainer=1` tries it
  without signing in (nothing is written to the cloud).
- **Store**: its own Firebase project (`js/data/aima-cloud.js`, public web config; the app config `aimaFirebase`
  overrides it), through the REST APIs: `aima/index` (the list and the active brain) and `aima/b_<id>` per brain;
  recorded data in its own collection: `aimaData/index` (the named sets) and `aimaData/c_<set>_<n>` (its chunks).
- Testing in a plain browser (not My PC): `?aimatrainer=1` shows the trainer's screens (it cannot write the cloud).

Firebase setup: Authentication > Sign-in method: enable **Google** and **Anonymous**; Authentication > Settings >
Authorized domains: add `imad-os.github.io`. Firestore rules (put the trainer's Gmail address):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /aima/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.email == 'YOUR_GMAIL@gmail.com'
                   && request.auth.token.email_verified == true;
    }
    match /aimaData/{doc} {
      allow read, write: if request.auth != null && request.auth.token.email == 'YOUR_GMAIL@gmail.com'
                         && request.auth.token.email_verified == true;
    }
  }
}
```

## 11-a-side, the rules of the game

* **Settings > Gameplay > Players per team**: 11 v 11 (default) or 7 v 7, from the next match.
* **Settings > Gameplay > Stadium** (length x width): Compact 65 x 45 m (7 a side), Small 75 x 49 m (default), Standard
  85 x 55 m, Grand 105 x 68 m (a real pitch), Ultra 110 x 72 m, each with its own grass. The goal (7.32 x 2.44 m, posts
  12 cm), penalty area (16.5 m), goal area (5.5 m), penalty spot (11 m), centre circle and arc (9.15 m) and corner arcs
  (1 m) are always the real ones, in every stadium; the goal posts stand on the goal line.
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
* **Moments of the game** (1.27.0, plan in docs/ai-tactics-plan.md): build-up, progression, final third, counter-attack
  (just won it and their team is open), securing the ball, counter-pressing (just lost it), and a defensive **block**: high
  press, mid block or low block, from the Tactics (defence row), the score and the time.
* **In-possession shape**: players stay behind the ball (rest defence: 3+2 in 11-a-side, 2+1 in 7-a-side, more with a
  defensive plan), the others spread over the five vertical lanes (wingers on the touchline lanes, half-spaces between the
  opponents' lines, the centre forward on their last line), staggered, the ball side a little overloaded, the far winger
  wide for the switch; each picks the free spot near his place. Overlaps, underlaps, third-man runs.
* **Out of possession**: a compact block (lines a fixed gap apart, narrow, shifted to the ball side), man-marking only in
  a player's own zone, pressing triggers (a pass back, the carrier facing his own goal, the ball near the touchline, the
  keeper), a second man closing the shooter near the box, counter-pressing with 1-3 players for 2-3 s.
* **Counter-attacks** (1.28.0): when a team wins the ball, the level, the **Counter** tactic (Game plan: Rarely / When on
  / Always), the score and the time decide whether it breaks. EASY: a quick break with the forwards when it breaks up an
  attack. NORMAL (the standard): every attack of theirs it breaks up becomes a counter with **everyone** but the last two
  (two in 7-a-side). HARD / LEGEND: only when the opponents are open, with everyone or a quick break of two or three,
  depending on how open. Losing pushes towards Always (all in when losing late); winning late sends fewer and keeps more
  back. The runners sprint in three lanes (both channels and the middle) on the last line, the others follow just behind
  the ball, the carrier runs with it, looks up quickly and plays forward (into the runners' path), never backwards. A
  counter lasts while the ball keeps going forward: it ends when it stalls, after 10 s, when the ball is lost, or (HARD /
  LEGEND) when the opponents have got enough men back. The team caught upfield sprints back goal-side. The debug report
  counts counters started (everyone / quick break), how they ended, and their shots and goals.
* **Never off the pitch**: every CPU target is inside the lines, the carrier looks ahead and turns along a line, nobody
  jogs on over the line after a ball going out.
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
  marking tightness, a second presser and the keeper, and how much of the tactics a level understands (EASY: the shape
  and the lines only; NORMAL: + transitions, a compact mid block, cut-backs; HARD / LEGEND: + the block from the plan,
  pressing triggers, switches of play, underlaps and third-man runs, up to 3 counter-pressers). CPU vs CPU: EASY loses every match to NORMAL, HARD and LEGEND win
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

**Voice commentator** (Settings > Commentator; js/game/commentary.js): a recorded voice comments the match in English
(male or female voice), French, Spanish or Arabic (AUTO = the game's language), with subtitles. The match sends it events
(the codes of its library: INTRO, GOAL, PENALTY, FOUL, CORNER, OFFSIDE, SAVE, TACKLE, LONGPASS, COUNTER, ATTACK, HALFTIME,
FULLTIME, HOMEWIN, AWAYWIN); it says one phrase at a time, picks by importance (a goal cuts a small comment short, a
phrase that came too late is dropped), keeps cool-downs per event (no "what a tackle!" every few seconds), says minor
events only sometimes (How talkative: CALM = the big moments only, NORMAL, CHATTY), pauses between phrases and never
repeats the last phrase of an event. The crowd steps back while it speaks (Lower the crowd). Settings: on / off,
language, voice, volume, how talkative, subtitles, what to do with a phrase not recorded in that language yet (English
voice, subtitle only, or skip it), lower the crowd. **Off: nothing is loaded and nothing runs.** It speaks through the
game's AudioContext (the My PC volume and pause apply) and stays silent in debug / training matches and in trainer.html.

*Where the voice comes from*: nothing is in this repo. The phrases and audio live in the assets repo `imad-os/f_assets`:
at the first match the game reads its `library.json` (from raw.githubusercontent.com, always the latest; the owner can
set another address in mypc-app.json `config.commLibrary`) through **MyPC.net** (needs My PC api level 10+), then the
MP3s of the chosen voice from each phrase's `audio_full_url` (`audio_full_url_male` / `_female` for a language with
both voices, else its one voice for either choice; a relative `audio_url` also works). New audio added there is picked
up without a game release.
*How it downloads*: the whole chosen voice, one file at a time in the background, one phrase of every event first and
the big moments first (~3 MB for English, kept compressed), plus the English voice when the fallback is ENGLISH VOICE.
Every file also goes into the browser's cache (`rs6-commentary-1`): later launches take the audio from there (only the
library is asked again), also with no internet. A phrase is decoded only when needed (8 kept); the next goal / penalty /
save phrase is decoded ahead so the big moments are never late.
*Fail-safe*: a file that does not exist (404) is skipped for the session and another phrase is said (else the fallback
setting); no network: no downloads for a minute, phrases already cached still play; no library: no commentary, tried
again 2 minutes later; a bad file, an old My PC without MyPC.net or any error in the commentator: silence, never an
error, the match goes on.

**Player models** (Settings > Graphics): `ATHLETE` (default: a real footballer's build, legs about half the height, heights
1.72-1.92 m with taller keepers, hair styles and boot colours that stay the same for a player every match; keepers wear long
sleeves and gloves), `CLASSIC` (the original blocks) or `TOON` (big heads, short legs). **Polygons**: LOW / MEDIUM / HIGH /
ULTRA sides for the rounded bodies and the ball (more = rounder, slower on old TVs); `AUTO` follows the graphics quality.
Both apply at once, also during a match.

**Kits**: every team has a change kit (white with the club colour, or dark navy for teams in a light colour). When the shirts of
both teams look alike, the away team wears its change kit (or a third colour when that still clashes); the keepers get colours
that differ from both teams.

**HUD**: the player boxes are small and see-through, and a box (or the radar) fades out when the ball is behind it.

**Settings** has three tabs: **Gameplay** (difficulty, match length, pace, power bar speed, player switch), **Graphics**
(camera, ball, player models, polygons, quality, radar, FPS) and **Audio** (sound effects, crowd chants); **Button mapping** is at the bottom.

## Physics and animation

* Pitch: the stadium's size (above); formations are given for 105 x 68 and stretched to it.
* Scale: 1.6 world units to the metre (`NS.M`), set by the players (an average footballer, 1.81 m, is 2.9 units tall). The ball
  is a real size 5 ball at that scale: 22 cm across (68-70 cm round), radius 0.176, about 1/8 of a player's height. On the
  grass it rolls without slipping about the right axis (a quaternion turn per step), in the air it keeps its spin, and its
  shadow on the grass shows how high it flies.
* **Shoulder to shoulder** (pressing the carrier): mostly a nuisance, not a tackle (half the odds of winning the ball it
  had): the carrier is bumped and for 1.2 s runs 15% slower and is off balance (passes and shots miss by 2.2 x more and
  carry 12% less pace); the challenger is 8% slower for 0.8 s.
* **Restarts**: at a kick-off everyone stays in his own half until it is taken, and the team not kicking off outside the
  centre circle; at a free kick the opponents are put and kept 10 m from the ball until it is taken. A throw-in always
  goes to a team-mate (the one the stick points at, else the nearest within 24 units) and comes down to his waist where
  he will be; the player it was thrown to brings it down off his chest up to 2.3 units high. Two team-mates come short
  for it (7 m up the line and 5.5 m in, 5 m back and 9 m in) and their markers keep 3 m off them until it is taken; a
  throw to a man is a soft ball, so his first touch almost never fails (even running onto it, which your players do).
  Kept in a test: the CPU 97%, by hand 80-93% (was ~50%). **The clock stops** while a restart waits to be played
  (throw-in, corner, free kick, goal kick, penalty, kick-off), as it already did while the players got into place.
  The other team's restart: a checkoAI taker plays it with the CPU's set play (it used to wait up to 10 s for its
  network to press a button), and pressing your pass or shot button (A / B, or the keyboard's) has the CPU take it at
  once (also pressed during the walk-up: he plays it as soon as he reaches the ball).
* **Ratings decide matches**: each team's **class** is the average overall of its players on the pitch (75 = 0, every
  10 points = 1; Real Madrid +0.8, Raja -0.4). On top of the level (Easy..Legend) it sharpens the better side and blunts
  the weaker one: its decisions (less noise, quicker), its passing and shooting accuracy, its tackles and shoulder duels,
  its first touch, its keeper's saves. The players' own ratings count more too: Speed (pace 0.80..1.17), Shoot (finishing),
  Dribble (now also clean passing and a surer first touch), a keeper's rating in his saves. Tests (CPU v CPU, Normal,
  5-minute matches): Real Madrid v Raja 4.95-1.05 on average, all 16 won (6-0, 7-0, 5-0...; it was 3.5-1.35, 13 won),
  Betis v Real Madrid 2.0-3.5, two teams of the same class even.
* **Goalkeepers**: with the ball far up the pitch the keeper stands off his line (about 4 m out with it at halfway,
  up to 11 m with it at the other end) and drops back as it comes, so he can sweep up a long ball over his defenders
  (he comes for a ball dropping anywhere in his box that he reaches first). **Rush**: a man through on goal with
  nobody in his way (or one man, once he is in the box), and now and then the keeper comes out to close him down and
  block at his feet; the better the keeper (difficulty), the more often. In a test of 30 breakaways from 30 m he came
  out in most, won 5 balls, and let in 21 (24 without the rush).
* **Settings > Graphics > Ball size**: Size 5 (the real size of an adult ball, 22 cm; the default), Bigger (+10%) or Big (+20%).
  Only the picture changes (the ball, its shadow and its shot streak); its physics keep the real size.
* **Camera near the goals**: as the ball nears a goal the view swings on towards it, so the goal and the box stay on
  screen on every pitch size and camera (the goal sits at 73-85% of the screen width with the ball on the goal line;
  it used to be cut off at the edge on the big pitches).
* **Knees and elbows** (ATHLETE, TOON): thigh / shin and upper arm / forearm on their own pivots: a running leg folds
  as it swings through, the back-swing of a kick folds the knee, the slide folds the back leg, players kneel on their
  shins; the forearms come up with the pace; keepers crouch set for a shot (bent knees, arms out low, elbows bent),
  catch with bent elbows and hold the ball at the chest. Replays keep them.
* **Through the legs (nutmegs)**: a low ball whose path crosses the line between a player's feet, with room for it on both
  sides, goes on past him. The legs are taken in their pose of that step (stride, lunge, wide stance when jockeying, lean),
  so a player standing with his feet together cannot be nutmegged, while a lunging defender can. An opponent may still close
  his legs in time (slower ball, more time to see it, better defending); a team-mate lets a pass meant for someone else run
  through (a dummy).
* Ball (js/game/world.js): gravity, light air drag, rolling drag plus rolling resistance (the ball stops instead of creeping),
  bounces that lose height and some pace, spin that curls the ball sideways in the air, posts and crossbar that the ball bounces
  off. `World.predict` / `World.intercept` run the same physics ahead so receivers, the CPU and the keeper read the flight.
  Kicks are aimed with that model (long balls and chips land where they are aimed despite the air drag).
* Players (js/render/assets.js + `animate` in js/game/match.js): legs and arms swing from hips and shoulders, body leans with speed;
  kick and shot (back-swing and strike, bigger for shots and long balls), standing tackle lunge, slide tackle on the grass,
  knocked off balance after losing the ball, keeper dives to the side of the shot and holds the ball in front.
* Crowd (js/render/scene.js `buildStands`, js/render/assets.js `crowdTextures`): no 3D people. Three flat terraces slope
  up behind the far touchline and both goals (the camera is on the near side): one mesh, 12 vertices, one unlit material,
  one draw call on any stadium. The fans are a 512 x 256 picture of 16 x 6 fans drawn once at start (no download, no
  outside asset), tiled over the terraces and mipmapped. A goal swaps it for the same fans on their feet with their arms
  up and bounces it for 4 s (only the texture and its offset change). Off on the LOW quality tier.

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
* Owner config (`MyPC.app_config`, defaults in `mypc-app.json` `config`): `difficulty`, `durationMins`, `gameSpeed`, `switchMode`, `cameraMode`, `ballSkin`, `playerModel`, `playerDetail`, `commentary`, `commLang`, `commVoice`, `commVolume`, `commTalk`,
`commSubs`, `commFallback`, `commDuck`, `crowdChants`, `gaugeTime`, `quality`, `soundEnabled`, `showRadar`, `showFPS`.
* Touch: My PC's own virtual pad on phones and tablets (no `"touch"` entry in the manifest); phones can also be phone controllers.
* Fixed 60 Hz step, no allocation in the update loop, DOM written only when a value changes, one `AudioContext` closed in `onDestroy`.

## Release

Bump `version` in `mypc-app.json` **and** every `?v=` in `index.html`, push, wait for GitHub Pages, then press **Update** in the
App Store Manager (`https://imad-os.github.io/g/installer/`).

> Club and player names are real; check the licensing before publishing widely.

## Playing on a phone or tablet (touch)

My PC's own touch pad only sends menu actions (left / right / up / down, confirm, run, cancel), so it cannot play a match.
During a match on a touch device with no controller connected the game asks My PC for a pad of its own (`MyPC.pad`,
js/core/gamepad.js): the stick (four directions, diagonals by two) and the eight buttons of a controller with Nintendo names
and places (A right, B bottom, X top, Y left, plus L, R, ZL, ZR), feeding player 1 like a real pad, so the same button map
(Settings > Button mapping) applies: pass, shoot, through ball... and combinations by pressing two buttons. The pad's gear
button lets the player show / hide buttons, resize and move them. The pad's + opens the game's pause menu; in any menu
My PC's own pad is back. A connected controller or phone controller is used instead of the touch pad.
