# checkoAI: plan to beat Legend 10 out of 10

Written for v1.51.0 (October 2026). Goal: a checkoAI brain that wins 10 matches out of 10 against the Legend CPU,
using every move a human has (low / through / long / lofted through pass, one-two, shots, curl, chip, knock-on,
tackles, press).

## 1. Why the current brains stay bad

| Problem | What happens now | Effect |
|---|---|---|
| **The decision is too low level** | Every 0.1 s the network picks a stick direction out of 9, sprint, and maybe a button, for every outfield player | A goal comes after hundreds of tiny decisions; the reward of a goal is spread over all of them and teaches almost nothing. Real football AIs that work never learn at this level first. |
| **It starts from nothing** | A new brain plays randomly, then copies Legend move by move (stick classes) | Copying the stick of a rule-based player is very noisy: the same situation gets different stick labels, so the copy averages them and ends up weaker than Legend. |
| **11 players, one network, all learning at once** | Off-ball running is learnt too | Off-ball positioning is the hardest part and the rules (ai.js) already do it well. |
| **Rewards are small and few** | Goals ~1, passes / ball won ~0.1, clap ~1.5 on one decision, learning rate 0.001 | One clap moved one decision by a tiny step: invisible. (Fixed in v1.51 with lessons, see 4.) |
| **Too few games** | Training plays real-time-ish matches in the browser | Published football AIs used millions of matches. |

## 2. What the research says

* **Google Research Football / Kaggle 2020** (1,000+ teams): the agents controlled *one* player (the active one); the
  team-mates were the built-in rules. The winner, Tencent's **WeKick**, started from imitation of strong play and then
  improved with reinforcement learning in a **league** (it plays many older versions and different opponents, so it
  does not forget and does not overfit one opponent).
* **TiKick** (2021): learnt a full 11-player controller *offline* from WeKick's recorded games, then fine-tuned with
  RL. Starting from good recorded play made the later RL much faster.
* **TiZero** (AAMAS 2023): full 11 v 11 from scratch with **curriculum** (easy scenarios first, harder ones later),
  **self-play** against a pool of past versions, and a joint objective for the players. It beat earlier systems by more
  than 30 points of win rate, but used a cluster for weeks.

The lessons for us:
1. **Start at Legend's level, then improve**: never from random.
2. **Decide at a higher level** ("pass to #9 into space", "shoot far corner", "dribble left for 0.5 s") and let the
   game's own code play it (the same code humans and the CPU use).
3. **Control the ball carrier first** (and later the presser); keep Legend's rules for everybody else.
4. **League / self-play** plus a fixed benchmark against Legend.
5. **Many fast games**: a headless simulation (no 3D drawing) running many matches in parallel.

## 3. The plan, step by step

### Step A: options instead of sticks (biggest win)
On the ball, the network chooses one **option** about 3 times a second:

| Option | Played by |
|---|---|
| pass to team-mate k (low / through / lofted through / long / one-two) | `Actions.kickTo` / `Actions.throughSpot` / `Actions.oneTwo` |
| shoot (near / far post, low / high), curl, chip | `Actions.driveShot` and friends |
| dribble in one of 8 directions for 0.4 s, knock-on, shield | the carrier code in ai.js |

Each option gets a few numbers describing it (lane risk, receiver space, xG gain, distance, defenders beaten). Legend's
`decide()` in ai.js already computes these numbers for its own choice. The network gives every option a **score**
(one small network applied to each option, the same weights for all), and the best option is played.

### Step B: copy Legend's choices (behaviour cloning)
Record Legend's choice and every option it rejected in thousands of matches (the existing data-set recorder, one row per
decision). Train the scorer to pick what Legend picked. After this, checkoAI plays **as well as Legend**.

### Step C: beat Legend (reinforcement learning)
* Reward: goal +1 / conceded -1, plus small shaped rewards: expected-goals gained by the option, possession kept,
  ball won. Use the advantage: "was this option better than the average option here?" (critic = value head).
* Opponents: 50% Legend, 30% older checkoAI versions, 20% Hard (keeps it robust).
* Start the RL with a low learning rate and a "stay close to Legend" penalty (KL to the cloned policy), relaxed over time.

### Step D: off the ball, then defence
Once the carrier beats Legend: options for the presser (press / tackle / slide / hold / cover) and for runners
(run in behind, overlap, come short), same method.

### Step E: fast headless training
Split the simulation from three.js (meshes) so matches run in Node `worker_threads`, one per CPU core, many times faster
than real time. `D:\gfb_train\gfb.js` becomes the runner: train, benchmark, save to the cloud.

### Step F: benchmark gate
After every training block: 50 matches against Legend (`node gfb.js bench`). Track win / draw / loss and goal
difference. Promote a brain only when it is better. Target: 10/10 wins in a 10-match test.

## 4. Coaching (in v1.51): claps and punishments that work

* Every clap, punishment and every move **you** make (pass, shot, tackle...) is kept as a **lesson**: the situation
  (46 numbers about the play around the player), the move, a score.
* Each decision checks the lessons. In a similar situation (the closer, the stronger):
  * **punishment**: the move's odds are cut at once. Measured: 1 punishment took a 1.7% move to 0.09%. By the 5th it is
    gone in that situation.
  * **clap**: the move climbs towards his favourite one. Measured with quick taps: 0.9% → 9% → 20% → 39% → 62% → 81%
    in 5 claps (his first choice).
  * **your own moves**: each counts as a third of a clap for that move in that situation (3 of your moves ≈ 1 clap).
* The network also learns each lesson (24 steps at once, and lessons are replayed now and then), so it carries over to
  similar situations. Lessons are saved with the brain (up to 400 per brain).
* Copying your play weighs 2x more than before (Settings > checkoAI > weight of your play: 3 / 6 / 12).

## 5. Order of work

1. v1.51 (now): lessons, all human moves for checkoAI (lofted through ball added), CPU uses one-twos, lofted through
   balls and knock-ons, smarter keeper.
2. Step E (headless runner): needed for everything after it.
3. Steps A + B (options + cloning Legend): checkoAI = Legend.
4. Step C + F (RL with benchmark): checkoAI > Legend.
5. Step D (defence options): aim for 10/10.

Sources: TiZero (arXiv 2302.07515), TiKick (arXiv 2110.04507), Google Research Football (Kurach et al., 2019), survey on
self-play methods (arXiv 2408.01072).
