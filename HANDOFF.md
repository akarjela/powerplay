# Powerplay — handoff

_Last updated: 2026-09-02. M1 and M2 complete, a playability pass that fixed
three bugs a human playtest exposed, and track 2 (shot selection) through phase
3 of 4. The game now has a read-choose-execute loop: four lengths that pitch
where they should, and a foot to commit to. Nothing is mid-edit; the tree is
clean and every test passes._

## Goal

A browser cricket game: **drag-to-swing batting physics, wrapped in a
stats-driven IPL-style tournament.**

The reference is Bennett Foddy's *Little Master Cricket*, which nails the swing
and deliberately has nothing behind it — one batter, one endless innings, no
opponent, no consequence, every ball identical to the last. This keeps the bat
and adds the part that makes you keep playing: ten franchises, squads whose
attributes actually change the delivery you face, a league table, playoffs.

Four decisions were settled up front and should not be relitigated:

| | |
| --- | --- |
| You control | **Batting only.** Your bowling innings resolves from stats as a live scorecard. |
| Stack | **TypeScript + Phaser 4 + Vite.** Browser game, deployable. |
| Naming | **Fictional franchises**, real Indian cities. Real IPL names and player likenesses are licensed; this is meant to be publishable. |
| Sim depth | **Stats-driven ball-by-ball**, not a single overall rating. |

### The architectural commitment

> **The simulation is pure. Phaser only draws it.**

`src/sim/` imports nothing from Phaser, touches no DOM, and takes randomness from
a seeded generator passed in as a parameter. That buys three things, and each one
is a reason not to erode it:

1. The whole match model is testable with Vitest in milliseconds — no browser, no
   canvas.
2. The other four fixtures in a tournament round resolve headlessly and
   instantly, because nothing has to render for a result to exist.
3. Replays and shareable season seeds come free.

The seam is one type. `Outcome` in `src/sim/types.ts` is produced identically
whether a human hit the ball or the model rolled it, so a single scorecard
implementation consumes both. **This is the most important decision in the
project.** If the physics path and the sim path grow separate scoring code they
will disagree about what happened, and the tournament stops meaning anything.
The type exists already, before there is a simulation to use it, specifically to
prevent that.

## Current state

**M1, M2 and most of track 2 are done.** The game is playable, timing matters,
and there is now something to read: the scene bowls from the simulation's
`bowl()`, so four lengths pitch in visibly different places, and the player
commits to a front or back foot before the ball arrives. Separately, `src/sim/`
resolves a full T20 match — toss, two innings, scorecard, result — headlessly
and reproducibly.

The two halves have met at the *delivery*: the scene renders a `Delivery` the
model produced. They have not met at the *outcome* — a human's shot does not yet
flow back through `resolveShot`. That is phase 4 and M3.

| | |
| --- | --- |
| Repo | Local git, 9 commits, `main`. **Not pushed to GitHub** — no remote set |
| Tests | 69 passing (`npm test`), ~800ms, no browser |
| Build / typecheck | Clean (`npm run build`, `npx tsc --noEmit`) |
| Dev server | `npm run dev` → http://localhost:5173 |
| Source | ~2,400 lines across 18 files |
| Node | 20.20.2 locally |

Stack versions, all current as of writing: Phaser 4.2.1, Vite 8.2.2,
TypeScript 6.0.2, Vitest 4.1.11.

### Measured behaviour

Not asserted — measured by stepping the Matter engine by hand from the console.

| | |
| --- | --- |
| Delivery pace | 126 kph actual against 138 intended; the gap is air resistance, which is real |
| Where each length pitches | yorker 1.9m, full 4.3m, good 7.5m, short 9.4m in front of the striker |
| Height at the bat, by length | yorker 10px, full 28px, good 35px, short 47px |
| Bowled on a miss, by length | yorker 100%, full 29%, good 36%, short 2% |
| Shot outcomes | 0:16% 1:19% 2:17% 3:5% 4:11% 6:5%, caught 21%, bowled 6% |
| Time to reach the batter | 533ms measured, against 0.52s in the real world |
| Where it pitches | 7.5m in front of the striker — a good length |
| Height at the bat | **39px**, mid-blade. Was 27px, which is why nothing was hittable |
| The blade's arc | 10–114px above the ground, pivoting 62px up |
| Play-and-miss resolves in | 650ms |
| Swing | ~100° in 100ms, reaches the pointer, slight overshoot as follow-through |
| Mistimed swing | 8m |
| Well-timed swing | 68m — six |
| Latest-timed swing | 96m (probably a touch generous; see rough edges) |

### Measured footwork

Blade angle from vertical needed to reach each length, by stance. `MISS` means
the ball is outside the blade's arc entirely — not penalised, unreachable.

| stance | yorker | full | good | short |
| --- | --- | --- | --- | --- |
| front | 32° | 60° | 69° | 82° |
| neutral | 0° | 49° | 59° | 73° |
| back | **MISS** | 40° | 51° | 66° |

The two ends are the mechanic. A yorker is unreachable off the back foot, and
from neutral only with the bat hanging dead vertical, which is a block rather
than a shot. The short ball inverts it: 82° off the front foot is nearly
horizontal and awkward against a comfortable 66° off the back.

### Measured simulation

Aggregates over three generated 45-match seasons, which is what
`tests/calibration.test.ts` asserts. Real IPL numbers in brackets.

| | |
| --- | --- |
| First-innings total | 163–170 (≈165) |
| Wickets an innings | 5.8–6.4 (≈6) |
| Strike rate | 136–144 (≈135) |
| Economy | 8.1–8.5 (≈8.3) |
| Fours / sixes a ball | 0.106–0.121 / 0.064–0.074 |
| Chases successful | ≈44% of matches |
| Elite vs poor attack | 25 runs and ~1 wicket an innings |
| Technique 92 vs 12 | 3.25 wickets an innings apart |
| Wrong foot played on | 13.0% of legal balls, costing 17.0% of wickets |
| Length mix | yorker 21%, full 22%, good 34%, short 24% |

## Files that matter

Nothing is mid-edit. In dependency order:

**Configuration — read this first.** Every tuning knob and both scale
compromises live in one file.

- `src/game/config.ts` — `PX_PER_METRE`, `PHYSICS_FPS`, `BASE_FPS`, the swing
  constants, and the header comments explaining why the bat and ball are
  exaggerated while distances are not

**Physics**

- `src/game/physics/bat.ts` — the pivot constraint and the swing controller.
  This is the file that decides whether the game feels good
- `src/game/physics/field.ts` — pure. Distance and height to an `Outcome`
- `src/game/humanInnings.ts` — pure. The state of the innings you are batting,
  and the reason it can now end. Takes its limits from `src/sim/innings.ts`
  rather than declaring its own

**The seam**

- `src/sim/types.ts` — `Outcome`, `Runs`, `Dismissal`, `Extra`, plus
  `countsAsBall` and `runsAgainstBowler`. Nothing here may import Phaser

**The simulation.** Pure: no Phaser, no DOM, no `Math.random`. In dependency
order, and this is also the order to read them in.

- `src/sim/rng.ts` — seeded mulberry32. Always passed in as a parameter, never
  reached for globally; that is what makes a season replayable
- `src/sim/player.ts` — `Batter` (power, technique, aggression), `Bowler`
  (pace, accuracy, movement, variation), `Squad`. Every attribute is 0–100 and
  means one specific thing
- `src/sim/delivery.ts` — bowler attributes to a `Delivery`. Also owns `Phase`
  (powerplay / middle / death). Produces two derived scalars the outcome model
  reads: `threat` (danger) and `latitude` (room to score)
- `src/sim/shot.ts` — the shot vocabulary and the footwork/length match table.
  Deliberately separate from `outcome.ts`, which also holds the model of how an
  *AI* batter decides; a human decides by pressing a key, so M3's `bridge.ts`
  imports this and nothing else
- `src/sim/outcome.ts` — **the model**. Footwork and commitment are chosen
  first, then a wicket is rolled, then runs. All the tuning constants live at
  the top, and `EXPECTED_MATCH` is the one everything else is centred on
- `src/sim/innings.ts` — bookkeeping only: strike rotation, the over, who may
  bowl next, when the innings ends. It makes no judgement about what happened
- `src/sim/match.ts` — toss, two innings, result, and the net-run-rate helper
  M4 needs

**Scene and visuals**

- `src/game/scenes/MatchScene.ts` — the ball's lifecycle, camera, HUD
- `src/game/visuals/stadium.ts` — sky, floodlights, crowd, hoardings, outfield
- `src/game/visuals/figures.ts` — batsman, fielders, stumps, bat, ball sprite
- `src/main.ts` — game config, including the `runner.fps` override and the
  dev-only `window.__game` handle

**Tests**

- `tests/field.test.ts` — 11 tests over the pure outcome logic
- `tests/rng.test.ts` — 6 tests: replay, bounds, weighted proportions
- `tests/innings.test.ts` — 24 tests. Bookkeeping invariants (the scorecard
  adds up three separate ways), the bowling allocation, attribute sensitivity,
  and ball-for-ball replay from a seed
- `tests/humanInnings.test.ts` — 9 tests over the innings that ends
- `tests/shot.test.ts` — 8 tests over the footwork axis, including the guard on
  `EXPECTED_MATCH`. These catch the axis not *mattering*; the two new bands in
  `calibration.test.ts` catch it not *firing*
- `tests/calibration.test.ts` — 9 tests. **The one that matters**; see below
- `tests/squads.ts` — generated squads for the tests. Not a fixture file you
  should grow into real data; real squads land in `src/` in M3

## Scale: what is honest and what is not

Field **distances** are true to the Laws of Cricket — 20.12m pitch, 68m boundary
— so run thresholds mean what they say and every outcome is trustworthy.

Gameplay **objects** are not, and cannot be. A cricket ball is 36mm across; at
any scale that fits a 68m ground on screen it is a fraction of a pixel. Matter
cannot solve a sub-pixel body at 140kph and you could not see it if it could. So
the bat and ball are roughly 4x exaggerated, declared at the top of `config.ts`
rather than buried as magic numbers.

The consequence to remember: **vertical space near the batter is in figure
scale, but the ball's bounce height is in field scale.** That mismatch is why
the hitting zone is narrow, and it is the thing to think about before changing
the delivery's release height or the bat's pivot.

## Failed attempts

Kept because each one is a trap that looks correct, and three of the first four
presented identically as "the swing is broken".

**1. One honest scale for everything.** True scale put the ball at 0.29px. Matter
tunnels straight through the bat at that size and nothing is visible. You cannot
draw a 1m bat and a 68m boundary at one scale — pick which half lies, and say so.

**2. An outfield that was painted but not simulated.** No static body at ground
level, so the ball fell through the pitch and passed ~100px *below* the bat's
arc. Unhittable at every timing. The visual ground line and the physical ground
are different things and both have to exist.

**3. A torque-summing PD swing controller.** Torque toward the pointer minus a
damping term. Sounds equivalent to velocity targeting and is not: gravity's
torque on the blade cancelled it at a fixed angle, so the bat stalled 29° short
of the pointer forever — 0.5s to turn 70°, against a ball arriving in 0.55s. Now
it targets a capped angular velocity, and the bat sets `ignoreGravity` because a
batsman holds the bat up.

**4. Running physics at 60Hz.** A full swing moves the blade tip ~22px per step,
wider than both the ball (12px) and the blade (11px), so the bat teleports over
the ball between steps and makes no contact at any timing. Matter has no
continuous collision detection. `PHYSICS_FPS = 240` fixes it.

**5. Rescaling per-step units for that new rate.** The obvious follow-up to #4
and completely wrong. Matter normalises `setVelocity`, `setAngularVelocity` and
`frictionAir` against a fixed 16.667ms base delta *internally*, so they must not
be rescaled when the step rate changes. "Correcting" them turned a 138kph
delivery into a 34kph dribble. `PHYSICS_FPS` buys collision resolution and
nothing else; `BASE_FPS` stays 60 for every per-step value.

**6. Diagnosing physics from screenshots in an automated browser.** A
backgrounded tab pauses `requestAnimationFrame` entirely — zero frames advance,
the ball looks frozen or crawling, and the physics appears broken when nothing is
wrong. This produced a confident, wrong conclusion that Matter's `setVelocity`
semantics had changed. **Measure by stepping the engine by hand**
(`scene.matter.world.step(1000/240)` in a loop) and reading body positions.
`window.__game` exists in dev for exactly this.

**7. An automated playtest that aimed the bat wrong.** Swinging toward a pointer
that is horizontally right of the pivot puts the blade at pivot height, ~44px
above a ball that has already pitched. Reported "no contact at any timing" and
looked like bug #2 all over again. When a playtest says the game is unplayable,
check the test's own aim before changing the game.

**8. Trusting a flattering number.** The first stability-style measurements
returned clean zeros because the harness was measuring nothing. A suspiciously
perfect result is a reason to check the harness, not to celebrate.

**9. Calibrating against one season.** 45 matches feels like a lot and is not.
The first calibration test passed comfortably inside every band on its own seed
while a different seed came back at 3.7 wickets an innings — outside the band
the test claimed to enforce. A model can drift out of calibration and still look
fine on the seed you happen to have checked in. It samples three leagues now,
and it still runs in under a second. The general form of this trap: **a green
band is not the same as a plausible league.** Print the actual numbers.

**10. Building difficulty out of length and line alone.** The first threat
formula weighted the length/line traits at 0.55, and those traits all sit
between 0.25 and 0.70 — a narrow band, and both attacks draw from it. The
result was that a 92-accuracy attack and a 12-accuracy one differed by 8% of an
innings, which would have made squad quality decorative and the whole tournament
pointless. Movement carries most of the weight now. **The check that catches
this is an A/B against extreme squads**, not a season average: a season average
is dominated by the middle of the distribution and looks perfectly healthy while
the ends do nothing. `tests/innings.test.ts` has one per attribute.

**11. Shipping a scoreboard nobody could read.** The HUD printed `44/48` and
the honest reaction was "that must be a display bug" — 48 wickets is not a
cricket score. It was not a display bug. The innings had no end, so wickets
just accumulated. **A number that looks impossible is usually telling the
truth about a state you have not modelled.** The broadcast strip exists partly
so the next wrong number is legible as wrong.

**12. A threshold three pixels away from unplayable.** The ball arrived 27px
above the ground; `bowled()` fires below 30px. So *every* ball that beat the
bat was bowled, and a playtest came back 48 down off 61. It presented as "the
swing is broken" — the fourth time that symptom has had a cause somewhere
other than the swing. Two constants that never appear in the same file, and
neither is wrong on its own.

**13. Fixing the trajectory and inheriting the pacing bug.** Once misses
stopped being bowled, the play-and-miss path suddenly mattered — and it took
2.55s, because the ball ran past the batter, hit the left wall of the world and
trickled back before `SETTLED_SPEED` was met. It had always taken 2.55s;
nothing had ever reached it. **When you fix a bug that was masking a code
path, budget for what is behind it.**

**14. Building a mechanic without checking what feeds it.** Footwork was
implemented, tested and calibrated before anyone measured the *length mix* it
reads. Bowlers had one intended length per phase and hit it about 80% of the
time, so the league was 53% good and 30% yorkers with 8% short — which made the
front foot correct on **92% of deliveries**. The whole decision was a formality
and "always play forward" was a dominant strategy. Every test passed. **Measure
a mechanic's inputs, not just its outputs**; the outputs looked healthy because
the axis was quietly inert.

**15. A delivery shape that only worked at one speed.** The four lengths were
calibrated at 138kph and looked perfect. At 148kph the yorker and the full ball
both arrived at 21px, and at 115kph the ordering scrambled outright, because a
slower ball carries less far before it pitches. Anything fitted at one point in
a parameter space needs checking across the range that space actually spans —
`bowl()` produces 113–150kph.

**16. Expecting a harder-hit ball to bounce higher.** To make a short ball
arrive high at constant restitution, the obvious move is to dig it in harder.
Measured, that makes it arrive *lower* — 23px, then 20px, then 16px — because
pitching it further away means it has bounced and is already descending by the
time it reaches the bat. The bounce had to vary with the length instead.

**17. Two constants, neither wrong, that were wrong together.** `technique`
already multiplied the wicket chance directly, and the new footwork read is
*also* driven by technique. Each was defensible alone; together they put 4.50
wickets an innings between a technique-92 side and a technique-12 one — a
tail-ender losing eight on his own. **A one-sided assertion cannot catch this**,
because double-counting makes the "technique matters" test pass *more*
comfortably. That test now has an upper bound as well as a lower one.

**18. Trusting a calibration band to notice a dead feature.** Every footwork
multiplier is centred on the expected match, so the axis moves the spread and
not the mean — which is exactly what makes the season bands blind to it. Flatten
the match table to 1.0 and all nine calibration tests stay green. Verified: four
*other* tests fail. If a feature is designed not to move the aggregates, the
aggregates cannot be its test.

**20. A rule that was never actually written down.** Catches did not check
whether the ball had bounced -- the entire definition of a catch in cricket.
There *was* a `hasBounced` flag, so it looked handled; it is set when the
delivery pitches, before you have played at the ball, so it was always true by
the time it could have meant anything, and `catchableBy` never read it anyway.
Result: 66% of every shot in the game was a catch, and because catches ate
everything that did not clear the rope, the only scoring shots left were
boundaries. **Two bug reports, one cause** -- "I only ever get sixes" and "I get
out when the ball rolls to a fielder" were the same defect.

**21. Maintaining physics state by sampling it.** Even with the bounce rule
added, a third of shots were still catches: `update()` runs once a rendered
frame at 60Hz while the physics steps at 240, so a struck ball touches down and
is airborne again *between two frames* and the contact is never seen. Worth ten
points of catch rate. Bounce and bat contact come from Matter collision events
now, which fire at the step. **This is trap #4 wearing a different hat** -- the
same 60Hz sampling that once let the bat teleport through the ball. Anything
that must not be missed has to be an event, not a poll.

**22. Walking into trap #7 while fixing something else.** Built a "competent
player" harness -- correct stance and the blade angle from the measured reach
table -- and it returned 79% dot balls and 0.05 runs a ball, far worse than
random swinging. The game was fine. Aiming the pointer *at* the contact angle
makes the bat decelerate into the ball; a real swing aims past it so the blade
is still travelling at contact. **The broad, less clever sweep was the honest
measurement.** Third time a harness's own aim has produced a false verdict.

**19. Asserting a gap before measuring it. Three times.** The most repeated
mistake in the project, and it has never once meant the model was wrong.

- The test that caught #10 demanded the elite attack concede 20 fewer runs; the
  real gap was 12.6. The first instinct was to read the failure as the model
  having the *direction* wrong. It did not.
- The technique A/B demanded 20 and measured 12.6 the same way.
- The back-foot-to-a-yorker test demanded 15 points of separation in the
  bowled-or-lbw share; the real gap was 12.

Every time, the fix was the threshold and not the code. **Measure the effect
first, then write the threshold under the measured value**, and put the measured
number in a comment next to it so the next person does not re-guess it.

## Next steps

A design review reframed what comes after M2. The headline: **the input is
one-dimensional.** Cricket's skill loop is read the ball, choose a shot, execute
the timing — and the game had only the third part. That reordered the plan into
three tracks, of which the first is finished and the second is three quarters
done.

**Track 1 — playability. Done.** The innings ends, the ball is hittable, the HUD
is legible. What is left needs a human: play ten overs and judge the swing feel
with `MAX_SWING_SPEED` (0.42) and `SWING_RESPONSE` (0.30) in `config.ts`. Lower
response means more lag, which means more skill. There is no test for this and
there cannot be — give it a fixed budget and accept "good enough".

**Track 2 — shot selection. Phases 1–3 done, phase 4 outstanding.**

Done: footwork and commitment in the model, four lengths that pitch where they
should, and a keyboard-committed stance that moves the bat's pivot. See the two
measured tables above — the ladder and the reach — because those are what the
whole track was for.

**Phase 4 is the one that still matters, and it is the seam.** A human's shot
does not yet flow back through the model. The scene renders a `Delivery` the
simulation produced, but when you hit the ball, `field.ts` decides the outcome
from distance and height alone — it does not know which foot you were on, and
`Outcome.shot` is left undefined on the physics path. So:

1. `src/sim/bridge.ts` — take the physics result *and* the player's stance, and
   produce an `Outcome` carrying its `Shot`. It should import `shot.ts` and not
   `outcome.ts`; the AI's situational decision model is no use to a scene where
   a human presses a key.
2. Compare the two paths. Play the physics path headlessly against the same
   attack and check its outcome distribution lands near `playBall`'s for an
   average batter. If a human innings and a simulated one disagree about what a
   ball is worth, the tournament is unfair in one direction and nobody can tell
   which.

**Aim that harness carefully.** A previous automated playtest reported "no
contact at any timing" and it was the *test's* aim that was wrong — swinging at
a pointer horizontally right of the pivot puts the blade at pivot height, well
above a ball that has pitched. When a playtest says the game is unplayable,
check the test before changing the game.

**Track 3 — the field is a lie.** Four fielders on one horizontal line, so there
is no leg side, no off side, and field placement cannot exist. They carry a
single `distance` scalar, so **either fix starts by inventing the depth
coordinate** — that is the real cost, not the renderer. Cheaper: keep the
side-on view for the batting moment, then cut to a top-down radar the instant
the ball is struck, which is what broadcast does with a wagon wheel. Harder but
better: 2.5D with four or five depth lanes.

It unlocks three things that cannot exist without it: field settings, powerplay
fielding restrictions, and direction mapping (playing early sends it to leg,
late to off) — which is meaningless until there *is* a leg side. It would also
give wides somewhere to go; see the rough edges.

**Then M4** — ten franchises, single round robin, IPL playoff bracket
(Qualifier 1, Eliminator, Qualifier 2, Final), points table with net run rate as
the tiebreak. `netRunRateInnings()` already handles the rule people get wrong: a
side bowled out is charged the full twenty overs. Ties need a point each; there
is no super over. The HUD's colour bar is already where a franchise's colours go.

**Then M5** — `localStorage`, orange/purple cap tables, sound, mobile touch,
deploy. The feel layer belongs here and is where *Little Master Cricket* wins:
frame hold and a small shake on middled contact, ball trail, slow-motion on
anything clearing the rope, a crowd swell that tracks the ball, a crude replay
on sixes and wickets, and distinct audio for edge / middle / miss so players
learn by ear.

Ranked by payoff for the systems that sell "realistic": lateral movement off the
pitch (fake it — a small drift after the bounce scaled by the bowler's
`movement`), bowler archetypes as presets over the attributes that already
exist, and pressure — dot balls narrowing the timing window, which is why
cricket feels tense and is about twenty lines. **Ball age is weaker than it
looks**: twenty overs is one ball, barely past the hard phase, so it is a lot of
state for a small drift. Skip DRS; fun in theory, a UX nightmare.

## Known rough edges

- **96m off the latest-timed swing is generous.** A huge six is about 100m, so it
  is not absurd, but the top end could come down. Tune with bat density or
  restitution, not by slowing the delivery.
- **The hitting zone is still narrow**, though no longer impossible. The ball
  arrives at 39px into a blade arc of 10–114px, so it occupies about a third of
  the bat's reach. If the game still feels unfair rather than hard, the lever is
  the bounce — `restitution` in `bowl()` — and not the bat. Every 0.02 of
  restitution is worth about 1.5px of arrival height, and pitch length and
  flight time do not move with it.
- **Catches are still ~21% of shots**, against something nearer 5% in real
  cricket, and that is the 1D field rather than a tuning error: four fielders on
  one line cover a quarter of a 68m ground where nine spread over 360 degrees
  cover a fraction of the *area*. `CATCH_REACH` is down to 1.2m to absorb some
  of it, which is already smaller than a fielder's actual reach. Track 3 is the
  only real fix; tightening the reach further would just make fielders
  decorative.
- **`FIELD` has four fielders on a straight line**, at 18/24/52/58m. There is no
  leg side or off side — the view is purely side-on, so every shot is "down the
  ground", and field placement cannot exist. They have a `distance` scalar and
  no second coordinate, so any fix starts by inventing one. This is track 3.
- **Running between the wickets is not simulated.** Distance stands in for it,
  deliberately conservatively.
- **The human innings concedes no extras.** `bowl()` produces wides and no-balls
  and the scene rolls them away, because a side-on view has no leg side to bowl
  down and a bouncer over the head does not work either — measured, even at
  restitution 0.99 the ball tops out at 69px against a blade reaching 114px, so
  it would always be playable and never called. Track 3 gives them somewhere to
  go. Until then the two paths disagree about extras, and a season's bowling
  figures will show it.
- **A human's shot does not reach the model yet.** `Outcome.shot` is filled by
  the simulation and left undefined by the physics path, so the scorecard can
  explain an AI dismissal and not yours. That is phase 4.
- **The physics path still only produces `bowled` and `caught`.** The sim
  produces all five. That asymmetry is fine — a human innings genuinely cannot
  be run out when running is not simulated — but it means the two paths will
  give slightly different dismissal mixes, and a season's stats will show it.
- **The bowler is hardcoded** in `MatchScene.ts` as one 138kph seamer. M3
  replaces it.
- **The crowd is drawn with `Math.random`.** Fine — it is decoration and runs
  once. Nothing feeding the simulation may do this; the sim's randomness must
  come from a seed.
- **`window.__game` is exposed in dev builds only**, guarded by
  `import.meta.env.DEV`. It is the intended way to measure the physics.
- **The sim's dot-ball rate is 39–41% against a real ≈36%.** Small, and it is
  the one aggregate sitting outside its real-world value rather than inside it.
  If totals ever need lifting, this is the honest place to take it from.
- **Ties happen in roughly 1–6% of matches**, against ≈1% in real T20. There is
  no super over; ties stand, and M4's points table will need to award one point
  each.
- **The sim has no run-chase collapse and no "keeping wickets for the death".**
  `chooseIntent` reads wickets in hand and the required rate, but a batter never
  plans an over ahead. It reads as cricket in aggregate; it would not survive a
  close look at a single tense chase.
- **`tests/squads.ts` is a test fixture, not data.** It generates plausible
  players so calibration has a realistic league to run against. Real squads go
  in `src/` in M3; do not grow this file into them.
- **Not pushed anywhere.** No git remote is configured.

## Running it

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # 69 tests, no browser
npm run build
```

Click to face a delivery. Move the mouse to swing.
