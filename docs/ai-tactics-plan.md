# CPU AI tactics plan (all levels)

Status: plan, nothing built yet. Tick the boxes as releases land. Code lives in `js/game/ai.js` (team brain, carrier,
off-ball, defence, keeper), shapes in `js/data/formations.js`, checks in `js/game/debug.js`.

## Why: what the code does today

| What you see on the pitch | Cause in `ai.js` |
|---|---|
| Players leave the pitch | Only the ball carrier steers away from the lines (`aiCarrier`). Marker, presser, cover, chaser and receiver targets are not clamped. The match only stops a player 2-4 m past the line (`match.js` 411). Debug saw "player far outside the pitch". |
| Same formation all the time | The team only knows "we have it / they have it / loose" (`T.phase`). There is no build-up, final-third, transition or block. In possession everyone is placed by `homeX*0.45 + ball.x*0.85 + push`: the defending shape slid up the pitch. |
| Crowded in one place | Two supporters come to the carrier, the chaser and the presser go to the ball, markers follow men near the ball, and every zone spot is pulled towards the ball's side (`ball.z * 0.32`). Nothing caps how many players are near the ball or keeps the far side occupied. |
| They stand in straight lines (same column / row) | The attacking spot keeps everyone at the same distance in front of the ball by role (FWD +15, MID +9, DEF +3), so each unit is a flat line. There are no lanes, half-spaces or diagonal staggering, and no between-the-lines positions. |
| Passes intercepted, few runs | Few real options in good places, so the carrier passes into traffic or dribbles. |

## What real teams and modern games do (research summary)

- **Five moments of the game**: in possession, defensive transition (just lost it), out of possession, attacking
  transition (just won it), set pieces. Each needs its own shape. The current AI has only "attack / defend / loose".
- **Positional play**: the pitch split into **5 vertical lanes** (2 wide, 2 half-spaces, 1 centre) and horizontal zones.
  Rules of thumb: the wide lanes are held by one player each (width), never more than 2 players in a lane, no 3 players
  on one horizontal line, players **staggered** on diagonals (triangles, diamonds), someone **between the lines**
  (behind their midfield, in front of their defence), someone **pinning the last line** (depth).
- **In-possession shapes differ from the kick-off formation**: e.g. a 4-3-3 builds up as **3-2** or **2-3** at the back
  (a full-back tucks in or a midfielder drops) and attacks as **2-3-5**, so all five lanes are filled at the top.
- **Rest defence**: while attacking, 3+2 (or 2+3) players stay behind the ball so a lost ball is not a counter.
- **Out of possession**: a **block** chosen by plan and score: **high press**, **mid block** (around halfway) or
  **low block** (protect the box). Kept compact (practitioner figure: about 10-12 m between lines), shifted to the
  ball side, far side tucked in, central corridor protected.
- **Pressing triggers**: a back pass, a loose touch, a receiver with his back to goal, the ball going wide to the
  touchline, a slow pass, the keeper. Press as a unit (presser + others cut the passing lanes with their cover shadow).
- **Counter-pressing**: the nearest 2-3 players press in the **first 2-3 seconds** after losing it, the rest recover.
- **Games**: EA FC's "FC IQ" splits it into player roles (off-ball behaviour per position, in and out of possession)
  and team tactics (width, depth/line height). Football Manager models positional play as formation changes between
  phases (4-3-3 to 3-2-5). Analytics (Spearman's pitch control) scores a spot by "who gets the ball first if it is
  played there", which is a cheap way for the AI to find space.

Sources: [Coaches' Voice: high press](https://learning.coachesvoice.com/cv/in-focus-high-press/),
[guidetofootball: mid-block press](https://guidetofootball.com/tactics/mid-block-press/),
[guidetofootball: pressing](https://guidetofootball.com/tactics/pressing/),
[Low block (football paradise)](https://www.footballparadise.com/en/glossary/low-block),
[Mid block pressing triggers (session planner)](https://www.sportsessionplanner.com/s/wURWi/Mid-Block-pressing-triggers.html),
[Passion4FM: positional play 4-3-3 to 3-2-5](https://www.passion4fm.com/utilizing-positional-play-in-fm26-433-to-325/),
[footballdna: playing out from the back](https://footballdna.co.uk/features/tactical-analysis-playing-out-from-the-back-formation-4-3-3/),
[EA FC 25 FC IQ deep dive](https://www.ea.com/ar/games/ea-sports-fc/fc-25/news/pitch-notes-fc-25-fc-iq-deep-dive),
[EA FC 25 gameplay deep dive](https://www.ea.com/games/ea-sports-fc/fc-25/news/pitch-notes-fc-25-gameplay-deep-dive),
[Spearman pitch control (Training Ground Guru)](https://archive.trainingground.guru/articles/william-spearman-how-liverpool-create-pitch-control),
[Pass probability (Soccermatics)](https://soccermatics.readthedocs.io/en/latest/lesson6/PassProbability.html).

---

## Step 0 — measure first (debug report)  · release 1.27.0

New counters in the debug report, per team, split **with the ball / without the ball**, so every later step is judged
by numbers, not by eye.

- [ ] `time_outside_pitch` (seconds any player is more than 0.5 m over a line in open play) and who
- [ ] team **width** and **length** (outfield players, 10th-90th percentile) with / without the ball
- [ ] **players near the ball** (within 12 m, average) with / without the ball
- [ ] **lanes occupied** (of 5) in the final third when attacking
- [ ] **flat lines**: how often 3+ team-mates stand within 3 m of the same x (row) or z (column)
- [ ] **rest defence**: players behind the ball when we lose it
- [ ] **distance between lines** (DEF-MID, MID-FWD) without the ball
- [ ] **pass options**: team-mates with an open lane at the moment the carrier decides
- [ ] **regain time**: seconds from losing the ball to winning it back; regains within 5 s
- [ ] **PPDA** (opponent passes per defensive action: pressing intensity)
- [ ] the report header names the brain and its Legend help (for checkoAI)

Targets used below come from these counters. Baseline: run 10 Legend v Legend and 10 Normal v Normal before step 1.

## Step 1 — never leave the pitch  · release 1.27.0

- [ ] one helper `keepIn(x, z, margin)` used by **every** `moveToward` target (presser, cover, marker, chaser,
      receiver, runs, keeper), margin about 1 m
- [ ] the carrier looks ahead (position in 0.4 s from his velocity), not only at his position, before the line; turns
      along the line instead of into it; near a corner flag he cuts back inside
- [ ] the chaser does not chase a ball that will be out before he gets there (lets it go for the throw / goal kick)
- [ ] a marker whose man stands off the pitch waits on the line
- [ ] allowed exceptions only: throw-in taker, corner taker, goal celebrations, walking off for a set piece
- [ ] the hard limit in `match.js` (411-412) tightened to 1 m past the line for players in open play
- **Done when**: `time_outside_pitch` = 0 in 50 matches at every level, no "far outside the pitch" issue.

## Step 2 — the team knows the moment of the game  · release 1.28.0

Replace `T.phase` (0 / 1 / 2) by a team **moment**, decided once per team tick with a little hysteresis (a 50/50 ball
does not flip the whole team back and forth):

| Moment | When | Team behaviour |
|---|---|---|
| `BUILD` | our ball, in our third | wide back line, keeper in play, 3-2 or 2-3 base, others high and wide to stretch them |
| `PROGRESS` | our ball, middle third | players between the lines and in the half-spaces, wide players hold width |
| `FINAL` | our ball, last third | 2-3-5 style: five lanes filled at the top, box occupied (near post, far post, penalty spot), cut-back spot |
| `COUNTER` | just won it, their team is open (few behind the ball) | forwards and wide players sprint forward and wide, carrier goes forward fast |
| `SECURE` | just won it, they are organised | first pass safe, team spreads back into its in-possession shape |
| `COUNTER_PRESS` | just lost it (first 2-3 s) | nearest 2-3 press the ball, the others go back to the rest-defence spots |
| `HIGH_PRESS` / `MID_BLOCK` / `LOW_BLOCK` | their ball, organised | see step 4 |
| `LOOSE` | nobody has it | the one who gets there first goes, the rest keep the shape of the moment before |

- [ ] moment machine + hysteresis in `teamUpdate`
- [ ] debug counter: seconds per moment per team (so we can see a team never builds up, never counters, etc.)

## Step 3 — attacking shape: width, depth, lanes, staggering  · release 1.28.0

Each formation gets an **in-possession shape per moment** (a table in `formations.js`, like the kick-off spots), e.g.

| Formation | BUILD | PROGRESS / FINAL |
|---|---|---|
| 4-4-2 | 2 CB split wide + 2 MID pivot (2-2), full-backs high | 2-4-4 / 2-3-5 (one wide MID inverts into the half-space) |
| 4-3-3 | 3-2 (one full-back tucks in) | 2-3-5 (wingers wide, 8s in the half-spaces, 9 pins the line) |
| 4-2-3-1 | 2-3 (the 6s and one drops) | 3-2-5 |
| 3-5-2 | 3-2 | 3-2-5 (wing-backs as wingers) |
| 7-a-side shapes | their own small tables (2-1-3 etc.) | |

The slot is a **target zone**, not a spot: each player then picks the best point inside it with a cheap score
(computed every 0.3 s, no allocation):

- [ ] **space**: who reaches that point first, him or an opponent (a mini pitch-control: arrival times already exist in
      `oppArrival`)
- [ ] **pass lane open** from the carrier (existing `laneRisk`) and from the next likely carrier
- [ ] **between the lines** bonus (behind their midfield line, in front of their defence line)
- [ ] **lane discipline**: penalty for a 3rd player in a lane, for standing within 8 m of a team-mate
- [ ] **staggering**: penalty for standing on the same row (x) or column (z) as 2 team-mates in the same unit
- [ ] **width**: the two wide-lane holders stay within 3-5 m of the touchline in PROGRESS / FINAL (never over it, step 1)
- [ ] **depth**: one player always on the last line (never offside), one dropping short when the carrier is pressed
- [ ] **rest defence**: 3+2 (attacking plan: 2+2, defensive plan: 3+3) stay behind the ball in their spots, marking the
      opponents left up front
- [ ] **ball-side overload, far-side isolation**: near side gets 3-4 players for short combinations, the far winger stays
      wide for the switch
- [ ] **support limit**: at most 3 team-mates within 12 m of the carrier (except in COUNTER_PRESS)
- [ ] keep the existing runs (in behind, late into box, overlap) but start them from the new spots; add **underlap**
      (full-back runs inside the winger) and **third-man run** (A passes to B, C is already running for B's lay-off)
- **Done when** (Legend, 11-a-side): width with the ball 45 m+ (of 68), length 35-45 m, lanes in final third 5/5 most of
  the time, flat lines rare, players near the ball with the ball 4 or fewer, rest defence 4+ when the ball is lost.

## Step 4 — defending shape: block, compactness, pressing  · release 1.29.0

- [ ] **block height** chosen by plan (Tactics: defensive = low block, balanced = mid block, attacking = high press),
      by score and time (winning late = drop, losing late = press) and by where the ball is
- [ ] **compact block**: lines 8-12 m apart, team length 30-35 m, width 35-40 m, the whole block slides to the ball side,
      far-side players tucked in to the half-space, central corridor closed first
- [ ] **zonal with man-orientation near the ball**: each player owns a zone; he steps to the opponent who enters it and
      passes him on to the next zone (no dragging across the pitch, which crowds one side today)
- [ ] **cover shadow**: the presser runs at the carrier on a curve that blocks the pass to the nearest pivot/inside
      player, pushing play to the touchline
- [ ] **pressing triggers** (Hard / Legend): back pass, loose touch, receiver back to goal, ball to the touchline,
      slow or bouncing pass, keeper with the ball: then 2-3 players jump together and the line steps up
- [ ] **low block**: protect the box, at most one presser, players in front of their men in the box, block shots
- [ ] **counter-press** (step 2 moment): 3 s with the 2-3 nearest, then fall back to the block
- [ ] defensive line: one line, steps up on a back pass, drops when the carrier faces forward with no pressure
      (keeps today's offside logic)
- **Done when**: length without the ball 35 m or less, lines 12 m or less apart, regains within 5 s up for Hard/Legend,
  PPDA lower for high press than for low block.

## Step 5 — transitions and the carrier  · release 1.30.0

- [ ] **counter-attack**: on a regain with few opponents behind the ball, first pass forward or into a runner, 2-3
      players sprint, the rest follow; otherwise SECURE (a safe pass, then rebuild the shape)
- [ ] carrier scoring rewards passes to players **between the lines / in the half-spaces / in space** (from step 3) and
      punishes passes into crowded zones (the 19 intercepted passes per match seen on checkoAI and the CPU too)
- [ ] **switch of play** when the ball side is overloaded and the far winger is free
- [ ] **cut-back** from the by-line to the penalty spot area, instead of a cross into a crowd
- [ ] **play out from the back** in BUILD against a high press only when the lanes are open, else a long ball to the
      far side / the forward
- [ ] the keeper is an outlet in BUILD and joins the 3-2

## Step 6 — levels and tactics  · release 1.31.0

What each level understands (speed / accuracy stay as now; this is about the brain):

| | Easy | Normal | Hard | Legend |
|---|---|---|---|---|
| stays on the pitch | yes | yes | yes | yes |
| moments | attack / defend only | + transitions | all | all |
| in-possession shape | kick-off formation pushed up (width kept) | shape tables | + space scoring | + overload / isolation, third man |
| block | mid block, loose | mid block, compact | block by plan + triggers | block by plan, score and time + triggers |
| counter-press | no | 1 player | 2 players | 3 players |
| rest defence | 4 | 4 | 3+2 | 3+2 adapted to their forwards |
| reaction (re-scoring spots) | 0.6 s | 0.4 s | 0.3 s | 0.25 s |

- [ ] the Tactics screen (defence / midfield / attack: defensive, balanced, attacking) maps to: block height, line
      height, width, pressing intensity, number of runners, rest defence count. Show a one-line explanation per choice.

## Step 7 — checkoAI and recorded data

- [ ] every change to the Legend AI makes the old **Legend v Legend recordings** describe an older Legend: tag each data
      set with the AI version (already has `ver`) and record a new set after steps 3-5
- [ ] checkoAI brains copy Legend: after the new AI, continue learning on the new data (1.26.1 keeps track of what each
      brain already learnt)
- [ ] later: the brain's inputs could include its moment and its target zone (the "where should I be" the new AI
      computes), which would make off-ball learning much easier

## Rules for every release

- Tizen TV budget: team work once per 0.25-0.3 s per team, per-player scoring only for a few candidate points,
  pre-allocated arrays, no allocation in the step.
- Each release: 10-match debug runs at Easy v Easy, Normal v Normal, Legend v Legend, and Legend v Easy, before and
  after; numbers go in the release notes; nothing else in the game changes.
- Keep a switch to the old behaviour for one release (debug option) so a comparison is always possible.
