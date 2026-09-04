# Powerplay — handoff

_Last updated: 2026-09-03, late. M1, M2, **track 2, track 3, M3 and M4 all
complete** -- the bridge is built and measured. There is a real match
now -- a toss, a target if you are put in, the model chasing you if you are
not -- and a **season**: a round robin of ten, a points table with net run
rate, the IPL bracket, a champion, saved in localStorage. The ground is a
perspective camera's view of a stadium with a crowd of people in it, and the
players have faces. A headless harness plays the actual Matter world in Node,
which is how the physics was measured. **New this session:** a UI pass -- the
canvas is full-bleed, the HUD is a broadcast lower third in the DOM, fours,
sixes, wickets and fifties are full-screen moments, and the crowd moves --
and then the three items at the top of the list: the bridge, power at the
crease, and their innings watched ball by ball. Nothing is mid-edit; the
tree is clean and every test passes._

**Every session that touches UI starts with: "Read
`design-system/cricketgame/MASTER.md` first."** It holds the palette, the
type, the motion rules and the anti-patterns; `pages/match-hud.md` and
`pages/moments.md` override it for the strip and the moments.

## Status at a glance

Read this first; everything below is the detail behind it.

### Done

- **M1 — the bat.** Drag-to-swing on a pinned Matter bat at 240Hz, scale-true
  distances, a swing that lags the pointer. Timing is the skill.
- **M2 — the pure simulation.** Ball-by-ball T20 in `src/sim/`, seeded,
  Phaser-free, calibrated against real IPL aggregates over three generated
  seasons; the `Outcome` seam shared with the physics path.
- **Track 1 — playability.** The innings ends, the ball is hittable, the HUD
  is a broadcast strip.
- **Track 2, phases 1–3 — shot selection.** Four lengths that pitch where
  they should, a front/back foot committed on the keys that moves the bat's
  pivot, footwork in the model.
- **Track 3 — the second axis.** A bearing for every shot from where the bat
  met the ball; nine fielders per phase under the powerplay law; catches on
  the right side of the ground, cut-offs, gaps; wides and no-balls; a wagon
  wheel; a real perspective camera high and square of the wicket.
- **M3, the squads half.** Ten fictional franchises with authored elevens,
  kits and grounds; you bat against their real six, rotated legally; your
  batting order, strike rotation and scorecard are kept.
- **A real match.** Toss, two innings, a target when you are put in with the
  required rate on the strip, the model chasing you when you are not, a
  result card.
- **M4 — the season.** Round robin of ten, points table with net run rate,
  the IPL bracket to a champion, saved in localStorage; your fixtures played,
  the rest simulated.
- **An art pass.** People with faces, hair and kit detail; a stadium with
  tiers, rails, a roof, banners, masts and a crowd of several thousand
  people, baked to one texture.
- **A headless harness.** `tests/headless.ts` plays the real Matter world in
  Node from the scene's own constants. 150 tests in ~2s.
- **The UI pass.** Full-bleed canvas (the viewport is the frame; the match
  camera scales to cover it, anchored on the striker, capped so the straight
  rope stays in). A DOM strip over the canvas: score, chase, the current and
  required rates on one axis with the gap filled red or green, both batters,
  a ball-by-ball tracker of the over, the bowler's figures, the next-ball
  button. Full-screen moments for FOUR, SIX, WICKET, fifty and hundred, and a
  lower third at the end of an over. Shake on a wicket, push-in on a six, a
  tracer on a struck ball, a flash on the stands for a boundary. Soft
  shadows, radiating mowing stripes, floodlight bloom, a padded rope, and a
  crowd in four crossfaded frames that stands up for a boundary. All of it
  honours `prefers-reduced-motion`.
- **Track 2, phase 4 -- the bridge.** `src/sim/bridge.ts` reads the stance
  key and how hard the blade swung as the sim's `Shot`; `Outcome.shot` is
  set on every legal physics ball and a dismissal says which foot was
  played. `tests/bridge.test.ts` plays the same 600 deliveries through both
  paths and measures them side by side (below).
- **Power at the crease.** A batter's power scales the ball's speed off the
  bat, centred on average; the striker's face changes with the order.
  Technique was tried two ways and measured inert or wrong; it stays out.
- **Their innings, watched.** A broadcast panel replays the simulated
  innings ball by ball with pacing, moments, a 3x speed and a skip -- before
  you bat when you chase, after your innings when you set a target.
- **LBW and run-outs on the physics path.** Forward and beaten on the
  stumps is lbw; a run is a roll for a run-out, applied identically by the
  scene and the harness.
- **Your fate in the season.** `fate()` in tournament.ts: champion,
  runner-up, or knocked out and where. A trophy card if you won, a card for
  the other endings, once, remembered on the save (`Season.told`). Your own
  fixture can be simulated instead of played.

### What is left

Ordered by how much a player would notice.

1. **The two paths do not value a ball identically**, and now that is a
   number rather than a worry. Over four seeds of 1200 balls from the
   harness's random player, the physics gives 1.34-1.40 runs a ball to the
   model's 0.96-1.05, 8-10% wickets to the model's 4-6%, and 18% boundaries
   to 10%. It punishes an attack harder (16-20% wickets against 5-13%) and
   pays a block more (about 1.0 a ball against 0.5). The physics path is
   both more generous and more dangerous. Whether to tune either path
   toward the other is a design call, not a bug; `MEASURE=1 npm test`
   prints the tables, `BRIDGE_SEED=x BRIDGE_BALLS=n` change the sweep.
2. **The physics path produces bowled, caught, lbw and run-out**; stumped
   does not exist there. Close enough that a season's stats will not show
   it unless you look.
3. **Fielders do not move on screen**, and deep point and third man are
   behind the camera. Left-handers do not exist. There is no keeper.
4. **The menu scenes are still Phaser text on a 1280x720 frame**, zoomed to
   fit. They work and they fill the window, but they are not on the design
   system; the strip, the cards and the innings replay are. Moving them to
   the DOM layer is the obvious next UI step.
5. **No sound, no touch, no deploy, no season history.** M5.
6. **Franchise names are not trademark-cleared.** Before anything ships.

### What is next

In order, with the reasoning in *Next steps* below:

1. Decide what to do with the two-path gap (see *What is left*).
2. Fielders who move to the ball; a keeper; left-handers.
3. The team and season screens onto the design system, in the DOM.
4. M5: sound, touch, deploy, season history.

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

**M1, M2, most of track 2, track 3, M4, and M3 bar the bridge are done.** The
game is a game: you pick a franchise, carry it through nine league games and
the playoffs, bat every one of your innings with a bat in your hand while the
model bats theirs, and the table adds up. A shot has a direction, the field
has a shape, the two decide the runs together, and the ground is a stadium
seen through a camera.

The two halves have met at the *delivery*, at the *squad*, and now at the
*outcome*: `bridge.ts` attaches the shot a human played to the judged ball,
and `tests/bridge.test.ts` plays the same deliveries through both paths and
compares them. They agree in aggregate to within 17% on runs a ball and two
points on wickets, and they disagree in an interesting way about how much an
attack costs; see *What is left*.

| | |
| --- | --- |
| Repo | Local git, `main`. **Not pushed to GitHub** — no remote set |
| Tests | 165 passing (`npm test`), ~4s, no browser. Includes 9 that play the real Matter world headlessly, 7 on the bridge and 3 on power through the same harness, 12 on the camera, 12 on the season |
| Build / typecheck | Clean (`npm run build`, `npx tsc --noEmit`) |
| Dev server | `npm run dev` → http://localhost:5173. Opens on the team screen: quick match or season. Fonts (Bebas Neue, Barlow Semi Condensed) come from Google Fonts with local fallbacks |
| Source | ~5,950 lines across 31 files in `src/` (plus ~430 of CSS); ~2,150 across 13 in `tests/` |
| Persistence | One season, as JSON under `powerplay.season.v1` in localStorage |
| Node | 20.20.2 locally |

Stack versions, all current as of writing: Phaser 4.2.1, Vite 8.2.2,
TypeScript 6.0.2, Vitest 4.1.11.

### Measured behaviour

Not asserted — measured by stepping the Matter engine by hand. Until this
session that meant the browser console; it now means `tests/headless.ts`, which
builds the scene's world from the scene's constants and steps it in Node.
`MEASURE=1 npm test` prints every table below.

| | |
| --- | --- |
| Delivery pace | 126 kph actual against 138 intended; the gap is air resistance, which is real |
| Where each length pitches | yorker 1.8m, full 4.2m, good 7.4m, short 9.4m in front of the striker |
| Height at the bat, by length | yorker 19px, full 29px, good 34px, short 39px |
| Time to reach the batter | 533ms measured, against 0.52s in the real world |
| The blade's arc | 10–114px above the ground, pivoting 62px up |
| Swing | ~100° in 100ms, reaches the pointer, slight overshoot as follow-through |
| Well-timed swing | 68m — six |

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

### Measured direction and field

From `tests/physics.test.ts`: 600 balls from a 62/64/58/55 seamer in the
middle overs, played by a deliberately dumb batter — random stance, a swing
starting anywhere from 260 to 560ms after release, aimed anywhere from a 5°
push to a 130° slog. The bands in that file sit under and over these numbers.

| | |
| --- | --- |
| Contact | 86% of legal balls (the blade sweeps a wide arc; this player always swings) |
| Where the bat met the ball | median 12–15px in front of the pivot, p10 −10px, p90 +41px |
| Timing → contact | swings started before 380ms met the ball 29px in front; after 460ms, 5px |
| Direction of struck balls | leg 35%, straight (±15°) 36%, off 29% |
| Early vs late, good length on the stumps | early (>28px) median bearing +49°, late (<4px) −19° |
| Outcomes of struck balls | 0: 30%, 1: 25%, 2: 15%, 3: 4%, 4: 18%, 6: 3%, caught 4.8% |
| Fielded (stopped by a man, ring or deep) | 66% of struck balls |
| Missed and bowled | 38% of misses |
| Extras | 17 wides and 1 no-ball in 600, all scored as such |
| Slowest ball to resolve | 2.6s; median 0.8s |
| A 20 m/s ground shot rolls | ~25m before the outfield and Matter's drag stop it |

The old one-line field caught 21% of shots and the median shot finished at
the rope. Neither number appears in the new game and both were structural, not
tuning; see failed attempts 24–27.

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

### Measured franchises

Three seasons of the ten authored squads, `tests/franchises.test.ts`.

| | |
| --- | --- |
| First-innings total / wickets / strike rate | 164.6 / 6.5 / 141 — inside the calibration bands |
| Win share, best to worst | Chennai 67%, Bengaluru 56%, Hyderabad 52%, Lucknow 52%, Mumbai 48%, Pune 48%, Delhi 44%, Kolkata 44%, Jaipur 44%, Ahmedabad 33% |
| Bengaluru bat / Hyderabad bat | 167 / 146 a match — the batting side outscores the bowling side, as authored |

27 games a side is a standard error near ten points, so the middle of that
table is noise. What it says reliably: nobody is a bye and nobody is a lock,
and **batting quality moves results more than bowling quality does**. Hyderabad
was authored as the best attack in the league and finished last on the first
pass (22%); it took two nudges to their top order to make them competitive.
That is a property of the sim, not the squads, and it is worth knowing before
M4 hands out a trophy.

## Files that matter

Nothing is mid-edit. In dependency order:

**Configuration — read this first.** Every tuning knob and both scale
compromises live in one file, and now every Matter body too.

- `src/game/config.ts` — `PX_PER_METRE`, `PHYSICS_FPS`, the swing constants,
  `DELIVERY_SHAPE`, the stance offsets, and new this session: `GRAVITY_Y`, the
  `*_BODY` options, `ROLL_DECEL`, the bat's collision category, and
  `DEPTH_PX_PER_METRE`. The bodies moved here so the headless harness builds
  the same world the scene does

**Physics**

- `src/game/physics/swing.ts` — pure. The swing controller's arithmetic and
  the soft-hands rule, shared by `bat.ts` and the harness
- `src/game/physics/bat.ts` — the pivot constraint; Phaser wiring around
  `swing.ts`. Still the file that decides whether the game feels good
- `src/game/physics/direction.ts` — pure. **The second axis.** Bearing from
  contact, the plan geometry, the side-on projection, and the region names
- `src/game/physics/field.ts` — pure. Three nine-man fields by phase, catch
  and cut-off reach, rolling and the rest prediction, and `judgeBall` — the
  one function that decides what a ball was, called by scene and harness alike
- `src/game/humanInnings.ts` — pure. The innings you are batting: the score,
  and now the batting order (who is on strike, each man's runs and balls,
  how he got out), a target and what is still required, and a `summary` in
  the shape the result and the table read

**The bridge**

- `src/sim/bridge.ts` -- pure. `shotFromPlay` (stance key and swing effort
  to a `Shot`), `bridge` (attach it to a judged `Outcome`; a dismissal gains
  the read), `readOf`. Effort thresholds `DEFEND_BELOW` 0.30 and
  `ATTACK_FROM` 0.72 were set from the harness's effort quantiles
- `src/game/hud/inningsView.ts` -- their innings replayed from the
  `BallEvent` log, paced like a broadcast, with the moments

**The seam**

- `src/sim/types.ts` — `Outcome`, `Runs`, `Dismissal`, `Extra`, plus
  `countsAsBall` and `runsAgainstBowler`. Nothing here may import Phaser.
  Unchanged this session, on purpose

**The simulation.** Pure: no Phaser, no DOM, no `Math.random`.

- `src/sim/rng.ts`, `player.ts`, `delivery.ts`, `shot.ts`, `outcome.ts`,
  `match.ts` — as before
- `src/sim/innings.ts` — `chooseBowler` is exported now, taking an
  overs-bowled function rather than the figures map, so the scene rotates
  the attack you face by the same rule

**The season**

- `src/sim/tournament.ts` — pure and serialisable. `createSeason` (circle
  method, home games balanced), `standings` (points, then NRR, then wins),
  `playoffs` (Q1, Eliminator, Q2, Final appearing as their inputs exist),
  `nextFixture`, `simulateFixture`, `playedFrom` for a match you batted in.
  A tied playoff goes to the higher-placed side; there is no super over
- `src/game/season/store.ts` — load/save/clear the one saved season

**Data**

- `src/data/franchises.ts` — the ten franchises: id, code, city, name,
  ground, colours, and an authored eleven each. `LEAGUE` is the squads alone

**The camera**

- `src/game/view/camera.ts` — pure. A pinhole camera in world pixels: X along
  the pitch, Y up, Z across to leg. `project`, `ground`, the physics/plan
  constructors, and `toPhysicsPlane`, which maps the pointer back onto the
  bat's plane exactly. `MATCH_CAMERA` is built from `CAMERA` in config.ts. It
  looks dead level with a shifted principal point -- see failed attempt 30
  for why it must not tilt

**The broadcast layer** -- DOM, over the canvas, under `#hud`. The scene
assembles a model each ball; nothing here knows the game.

- `src/game/hud/hud.css` -- the tokens from MASTER.md as CSS variables, the
  strip, the cards, the moments, and the reduced-motion overrides
- `src/game/hud/scoreboard.ts` -- the strip. `render(model)`; the one
  element that takes the pointer is the next-ball button
- `src/game/hud/moments.ts` -- `showMoment`: FOUR, SIX, WICKET, milestone,
  end of over. Never two at once
- `src/game/hud/card.ts` -- the toss and result cards on a scrim
- `src/game/hud/dom.ts` -- `hudRoot`, `el`, `reducedMotion()`

**The viewport**

- `src/game/view/camera.ts` also has `cameraForViewport` and
  `viewportScale`: the design camera scaled to cover the window, anchored on
  the striker's feet, capped so the straight rope stays on screen
- `src/game/view/fit.ts` -- the menu scenes zoom their 1280x720 frame to fit
- `src/game/visuals/crowd.ts` -- the crowd as four crossfaded frames;
  `react()` on a boundary or a wicket

**Scenes and visuals**

- `src/game/scenes/SelectScene.ts` — two modes. Quick match: the side you
  bat for and the side you face, both elevens with rating bars. Season: the
  franchise you carry, and a way back into a saved season
- `src/game/scenes/SeasonScene.ts` — the table, the fixture in hand (play it
  if it is yours, simulate it if not, or sim to your next), recent results,
  the bracket, the champion
- `src/game/scenes/MatchScene.ts` — a match: toss card, your innings with the
  bat, the model's innings before or after, a result card, the fixture
  recorded into the season if there is one. Plus everything it did before:
  bowler rotation, the field per phase, bearing at contact, the camera, the
  radar. `layout()` rebuilds everything viewport-sized on resize;
  `renderHud()` builds the strip's model; `announce()` is the moments and
  the game feel
- `src/game/visuals/stadium.ts` — the ground as projected shapes, baked to
  a texture the size of the viewport: sky, a radial-graded turf with mowing
  stripes radiating from the square, a padded rope, pitch, hoardings, a ring
  of stands in bays with rails, a walkway, a roof with lights, banners,
  lattice masts with bloom, light pools and haze. `bakeCrowd` draws the
  people alone, one frame at a time, for `crowd.ts`
- `src/game/visuals/figures.ts` — people. Faces (front and profile), hair,
  beards, glasses, skin tones dealt from the player id via `lookFor`;
  helmets with grilles, caps, pads, gloves, kit details. Containers the
  scene positions and scales by projection. No labels
- `src/game/visuals/radar.ts` — the plan view and wagon wheel
- `src/main.ts` — game config, the two scenes, the dev-only `window.__game`

**Tests**

- `tests/headless.ts` — **the harness.** Phaser's bundled Matter, required by
  absolute path, building the scene's world from `config.ts` and swinging with
  `swing.ts`. Read its header before writing a playtest
- `tests/physics.test.ts` — 9 tests over the real physics path: the pitch
  ladder, contact rate, direction split, early-to-leg, catch rate, run spread,
  bowled rate, extras, pacing. `MEASURE=1` prints the tables
- `tests/tournament.test.ts` — 12 tests: the fixture list (45, nine each,
  five a round, home games balanced), the table (points, ties, NRR with the
  bowled-out rule), the bracket to a champion, tied playoffs, replay
- `tests/camera.test.ts` — 8 tests: framing, no foreshortening along the
  pitch, the leg side receding, ball size, exact pointer inversion
- `tests/direction.test.ts` — 13 tests over the direction model as arithmetic
- `tests/field.test.ts` — 27 tests: the field settings and the powerplay law,
  scoring with a plan, cut-offs, catches on the right side of the ground,
  rolling, and the judge including wides, no-balls and balls hit behind
- `tests/franchises.test.ts` — 10 tests: shape and uniqueness of the squads,
  and three seasons held to the calibration bands and a balance check
- `tests/calibration.test.ts`, `innings.test.ts`, `shot.test.ts`,
  `humanInnings.test.ts`, `rng.test.ts` — as before
- `tests/squads.ts` — still the *generated* league for calibration. Kept
  deliberately: the calibration bands were fitted to it, and the authored
  franchises are tested against those bands rather than replacing them

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

**23. Verifying with a pipeline, and reading the wrong exit code.** Ran
`npm test 2>&1 | tail -3 && npx tsc --noEmit && echo ok` and watched it print
`ok`. A pipeline's exit status is the *last* command's -- `tail` always succeeds
-- so a failing test suite sailed through the `&&` chain, and a broken test got
committed and stayed broken across two more commits that "verified" the same
way. The failure was real: the three-run threshold moved 45m to 52m and an M1
assertion still expected 48m to be three.

**Never pipe a check through `tail` or `grep` and then trust `&&`.** Either run
the check bare, or `set -o pipefail` first. The tail was there to keep the
output short, which is a fine goal and cost a genuine regression.

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

**24. Reading Matter's velocity as per-step.** The rest prediction summed
`velocity × 4` a frame, because the physics steps four times a frame. Matter
normalises velocity to its 16.667ms base delta, so it is already per *frame*
whatever `PHYSICS_FPS` is — trap #5 from the other side. Every firm push was
predicted to the rope, and the measured boundary rate was 43% of scoring shots
while the physics itself said 22%. A unit test asking what 20 m/s rolls to
caught it at 88m. **A prediction of the physics needs its own test against a
number you can do in your head.**

**25. Believing a rolling ball stops.** Matter has friction and air drag and no
rolling resistance, so a struck ball that had finished bouncing decayed
exponentially and, for any purpose that matters, never stopped. Measured: the
median shot in a random sweep finished at 68m, and every ground shot in a gap
was four. The one-line field's 21% catch rate had been sitting on top of this
the whole time — trap #13 again, a bug behind a bug. `ROLL_DECEL` exists
because of this; so does judging a ball the moment it is rolling.

**26. Trusting the smaller restitution.** The bat's is 0.35 and the ball's is
0.70 because the bounce off the pitch needs it. Matter resolves a contact with
the *larger* of the two, so a bat that was barely moving still returned a
138kph ball at 70% of its speed, and a defensive push reached the rope 22% of
the time. The fix is `contactDamping()` — soft hands — applied the frame after
the collision because the solver runs after the event. This is the bat/ball
mass ratio being 32:1 wearing a different hat; see the rough edges.

**27. A sweep that only slogged.** The first harness player swung 70–130° at
every ball and reported 48% boundaries, which looked like a broken outfield. It
was a broken *player*: nobody slogs 120 balls. Widening the aim to 5–130° —
pushes as well as slogs — put boundaries at 22% and dots at 30%, and every
downstream number moved with it. Trap #7 and #22 said "check the harness's
aim"; this one says **check the harness's *distribution* of aims**. The
measured tables in this file come from the wide sweep and say so.

**28. A ball that would not resolve, for a reason the judge could not see.**
One ball in a thousand hopped in place for six seconds: restitution 0.7
against the ground produces an endless series of shrinking bounces that never
quite satisfy "on the turf and still", and Matter's resting threshold does not
catch it. `isRolling` is generous about small hops now, and a ball still
bobbling 1.8s after its first bounce is judged anyway. **Anything the physics
can do forever needs a clock as well as a condition.**

**29. Screenshots of an automated tab, again.** The Chrome extension's tab
throttles `requestAnimationFrame`; four screenshots 1.5s apart showed the ball
crawling. Nothing was wrong. Driving `window.__game` with `world.step()` and
`scene.update()` in a loop played twelve balls correctly in one call. Trap #6,
still live, and the harness exists so nobody has to fall into it again.

**30. Tilting the camera down.** The obvious way to frame a ground from a high
camera is to point it at the pitch. Do that and the bat's plane tilts away from
the image plane by the same angle: the swing foreshortens by a few percent,
verticals converge, and the pointer-to-bat mapping stops being exact -- the
camera test caught the inversion off by pixels. The camera looks dead level
and the *frame* is shifted down instead, via `principal` in config, the way a
shift lens keeps a building's verticals vertical. The plane is then exactly
parallel, the mapping is a similarity, and the swing is the side-on swing
scaled by 0.93.

**31. Recommending the broadcast angle.** The first answer to "the players are
too close" was a true broadcast camera from behind the bowler's arm. That
puts the swing plane edge-on: the drag-to-swing arc, which is the entire
mechanic, becomes a foreshortened stub, which is why broadcast-angle cricket
games use canned shot animations. A high camera square of the wicket gets the
depth without losing the swing. **Before moving the camera, ask what the
mechanic looks like from there.**

**32. A depth cue instead of a camera.** Before the camera there was a
constant -- pixels of vertical offset per metre across -- lifting the leg side
and lowering the off side on the side-on picture. It put square leg on the
batter's toes at 0.8 and needed to be asymmetric at 1.5/0.7 to fit between the
stands and the scoreboard. It was a projection with the perspective taken out,
and the perspective was the part that mattered.

**33. Phaser re-executes a Graphics object every frame.** A crowd of a few
thousand rectangles drawn into one `Graphics` is a few thousand draw commands
*per frame*, forever. `generateTexture` once and show an image. The old
speckle crowd had been paying this cost quietly since M1.

**34. A vector person is a budget, not a limit.** "Stick figures" was fair:
a head circle and three rectangles. Ears, a hair cap, brows, eyes with
pupils, a nose line, a mouth, a beard on some, glasses on a few, a shaded
side, a collar, a trim, straps, soles, fingers -- each is two lines of code
and the sum is a person at 90px. The features are dealt from the player id
so they are stable; nothing here is an asset, and the repo still has none.

**40. Bands fitted on one seed, again.** The bridge test's first bands came
from one sweep of 600 balls and held with room to spare. Adding one random
draw per ball (the run-out roll) shifted the sequence and the wicket gap
went from 1.9 points to 7.9. Four seeds at 1200 balls showed the model's
wicket rate is 4-6%, and the 7.1% the bands were built on was a high draw.
Trap 9, in the one file that had cited it. **A band is not measured until
it has been measured on more than one seed.**

**38. Technique as the width of the blade.** The obvious hitting-zone lever,
and measured, nothing: contact 85.4% against 85.5% for technique 92 against
12. Side-on, `BAT_WIDTH` is the blade's *thickness*, and the ball meets the
face however thick the edge is. Then as the hands (swing response): it moved
boundaries like a second power and wickets the wrong way, 9.9% against 7.7%,
because a quicker bat is only a faster bat at contact. Left out; the reasons
are on `powerFactor` in swing.ts. The general form: **an attribute needs a
mechanism the physics actually has**, and on this path not getting out is
the player's own timing.

**39. A first attribute lever that measured half a point.** Power as a
scale on the *effort term* of `contactDamping` moved boundaries from 17.9%
to 18.5%, because the random player's median effort is 0.48 and the term
was already small there. Scaling the whole exit speed instead gave 17.0% to
21.1%. Trap 14 again: measure the lever's inputs.

**35. Screenshots of an automated tab, a third time -- now for CSS.** The
Chrome extension's tab throttles `setTimeout` to one-second ticks and does
not start CSS animations, so every moment appeared not to render and a
300ms wait took a second. Trap #6 and #29 for the DOM. What worked: seek
the animations by hand -- `document.getAnimations().forEach(a => { a.pause();
a.currentTime = 300 })` -- and screenshot the paused frame. Pair with
`await import('/src/game/hud/moments.ts')` to reach a module's exports in
the page, since Vite serves the same instance.

**36. Covering a 4:3 window by height.** Scale the design frame to cover a
tall viewport and the off side is cropped past the straight rope: a
straight six leaves the screen. `viewportScale` caps at the rope and
reveals sky instead. Measured before the assertion this time: 16:10 already
brushes the cap at 1.150 against a 1.25 cover.

**37. Mowing stripes that met in a point.** Radiating wedges from the centre
of the pitch at 9 degrees and 7% contrast read as a sunburst, not grass.
Starting them 13m out, at 5 degrees and 4%, they are a mown outfield.
Nothing was wrong with the idea; the contrast was.

## Next steps

**Phase 4 of track 2 — the bridge, still.** A human's shot does not flow
back through the model. `Outcome.shot` is undefined on the physics path, so
the scorecard can explain an AI dismissal and not yours. It matters more
now that a season table sits on top of both paths: a human innings and a
simulated one should value a ball the same way, and nobody has measured
whether they do. `tests/headless.ts` makes the comparison cheap. See the
previous version of this section for the two steps; they have not changed.

**Things the season now makes visible**, in the order a player will notice:

- **Your batters' attributes do nothing.** The bat is the same bat for
  Malhotra and for the number eleven. Power could scale `contactDamping`'s
  ceiling; technique could widen the hitting zone by a few pixels. Small,
  legible, and it would make the batting order mean something.
- **You never bowl.** Their innings is a card. A live scorecard of the
  simulated innings -- ball by ball, skippable -- would make it a match you
  watched rather than a number you were told.
- **No season history.** One season, overwritten. A list of past champions
  is a few lines in the store.
- **Batting moves results more than bowling** (see the franchise
  measurements). A season table will show it. If the bowling sides never
  make the playoffs, the lever is `movement`'s weight in `delivery.ts`.

**Then M5** — sound, mobile touch, deploy, and the feel layer: frame hold on
middled contact, slow-motion over the rope, a crowd that reacts (the crowd is
a texture now; a second texture of raised arms swapped in for a moment would
do), distinct audio for edge, middle and miss. Fielders who visibly move.
Left-handers. A keeper.

## Known rough edges

- **The physics path still only produces `bowled` and `caught`.** The sim
  produces all five. The two dismissal mixes differ and a season's stats
  will show it.
- **No stance is bridged as back foot** -- played from the crease. The
  physics has already punished it geometrically; this is only the name.
- **The innings replay's timers are wall-clock** (`setTimeout`), so a
  backgrounded tab pauses it, which is what you would want.
- **The bat/ball mass ratio is 32:1** and Matter takes the larger
  restitution, so a dead bat returns the ball hard. `contactDamping()` covers
  it. If the swing ever feels wrong at the *soft* end, look here before the
  controller.
- **The direction model is fitted to the harness's timing distribution.**
  If playtesters report everything going to one side, re-measure
  `NEUTRAL_AHEAD` against how people actually time it.
- **Fielders do not move on screen.** Deep point and third man are behind
  the camera and are on the radar only.
- **The strip is DOM and the radar is canvas.** They sit in different
  layers. Fine until something needs to be drawn over the strip.
- **The pointer is not tracked over the next-ball button.** Everything else
  on the strip is `pointer-events: none`, so the swing is never intercepted;
  the button is at the far right, away from the bat.
- **The mouse must travel `viewportScale` times further on a bigger window**
  for the same swing, exactly as FIT mode stretched it before. If the feel
  drifts across monitors, this is where.
- **A wide is only slightly visible as a wide.** 1.4m outside off, faint,
  through the bat, called at the keeper.
- **A ball is judged the moment it is rolling**, from a predicted rest
  point, and vanishes mid-roll as the call comes up.
- **Catch reach uses wall-clock time**; on a throttled tab it under-counts
  catches. The harness uses simulated time.
- **A tied playoff goes to the higher-placed side.** No super over.
- **The season is one localStorage key.** No history, no export, and a
  change to the `Season` shape needs a version bump in `store.ts` or old
  saves will be read as garbage (they are validated loosely and dropped).
  `told` was added as optional, which an old save simply lacks.
- **The fate card is shown a tick after the season scene creates**, so a
  restart's shutdown cannot hide it. Under the automated tab it looked
  flaky for exactly that reason.
- **The season's rng is per fixture** (`seed:fixtureId`), so replaying a
  fixture after a reload bowls the same balls. Deliberate; also means a
  player can retry a match by reloading. Decide whether that is a feature.
- **The crowd is a texture.** It cannot react. A second baked texture with
  arms up, swapped in on a six, is the cheap version of a reacting crowd.
- **Franchise names are not trademark-cleared.**
- **Everything is a right-hander.**
- **The sim has no direction**, so the radar shows only your innings.
- **Running between the wickets is not simulated.**
- **Ties happen in roughly 1–6% of matches.** A point each in the league.
- **`tests/squads.ts` is a test fixture, not data.**
- **Not pushed anywhere.** No git remote is configured.

## Running it

```bash
npm install
npm run dev              # http://localhost:5173  (?bat=pun&bowl=hyd to pick sides)
npm test                 # 145 tests, no browser, ~2s
MEASURE=1 npm test       # the same, printing every measured table
npm run build
```

Quick match: pick the side you bat for and the side you face. Season: pick
your franchise and play nine league games and the playoffs; the others
simulate. Click to face a delivery. Move the mouse to swing. Left/right (or
A/D) for back and front foot. Esc leaves a match. The radar top right is
where the shot went.

