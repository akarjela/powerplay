# Powerplay — handoff

_Last updated: 2026-09-02. Milestone 1 complete: the batting works and has a real
skill curve. Nothing is mid-edit; the tree is clean and every test passes._

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

**Milestone 1 is done and the game is playable.** Timing genuinely matters:
swing early and the bat has already stopped, so you dribble it 8m; time it and
it carries 68m for six.

| | |
| --- | --- |
| Repo | Local git, 3 commits, `main`. **Not pushed to GitHub** — no remote set |
| Tests | 11 passing (`npm test`), ~200ms, no browser |
| Build / typecheck | Clean (`npm run build`, `npx tsc --noEmit`) |
| Dev server | `npm run dev` → http://localhost:5173 |
| Source | ~940 lines across 9 files |
| Node | 20.20.2 locally |

Stack versions, all current as of writing: Phaser 4.2.1, Vite 8.2.2,
TypeScript 6.0.2, Vitest 4.1.11.

### Measured behaviour

Not asserted — measured by stepping the Matter engine by hand from the console.

| | |
| --- | --- |
| Delivery pace | 126 kph actual against 138 intended; the gap is air resistance, which is real |
| Time to reach the batter | ~0.55s against 0.52s in the real world |
| Swing | ~100° in 100ms, reaches the pointer, slight overshoot as follow-through |
| Mistimed swing | 8m |
| Well-timed swing | 68m — six |
| Latest-timed swing | 96m (probably a touch generous; see rough edges) |

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

**The seam**

- `src/sim/types.ts` — `Outcome`, `Runs`, `Dismissal`, `Extra`, plus
  `countsAsBall` and `runsAgainstBowler`. Nothing here may import Phaser

**Scene and visuals**

- `src/game/scenes/MatchScene.ts` — the ball's lifecycle, camera, HUD
- `src/game/visuals/stadium.ts` — sky, floodlights, crowd, hoardings, outfield
- `src/game/visuals/figures.ts` — batsman, fielders, stumps, bat, ball sprite
- `src/main.ts` — game config, including the `runner.fps` override and the
  dev-only `window.__game` handle

**Tests**

- `tests/field.test.ts` — 11 tests over the pure outcome logic

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

## Next steps

**Immediate, and it needs a human.** Play ten overs and judge the swing feel.
Two knobs in `config.ts`:

- `MAX_SWING_SPEED` (0.42) — how fast the bat can move
- `SWING_RESPONSE` (0.30) — how hard it chases the pointer. Lower means more lag,
  which means more skill

There is no test for this and there cannot be. The plan flagged M1 as the
milestone that can swallow unlimited time: give it a fixed budget, accept "good
enough", and move on. A great tournament around a decent bat beats a perfect bat
with nothing behind it.

**Then M2 — the pure simulation.** `src/sim/` in full: `rng.ts` (mulberry32),
`delivery.ts` (bowler attributes to a `Delivery`), `outcome.ts` (batter vs bowler
to an `Outcome`, for AI-batted balls), `innings.ts`, `match.ts`. Done when a full
20-over innings resolves headlessly with a correct scorecard and the same seed
produces the same match twice.

The test that matters most in M2 is **calibration**: simulate a 45-match season
and assert plausible aggregates — team totals 150–200, strike rates 120–160,
economy 6–10. Without it, tuning one attribute silently breaks the tournament and
nothing tells you.

**Then M3** — `bridge.ts` converts a physics result into an `Outcome`; squad data
lands; you bat against a real attack whose attributes visibly change the
delivery. **M4** — ten franchises, single round robin (9 matches each), IPL
playoff bracket (Qualifier 1, Eliminator, Qualifier 2, Final), points table with
net run rate as the tiebreak. **M5** — `localStorage`, orange/purple cap tables,
sound, mobile touch, deploy.

## Known rough edges

- **96m off the latest-timed swing is generous.** A huge six is about 100m, so it
  is not absurd, but the top end could come down. Tune with bat density or
  restitution, not by slowing the delivery.
- **The hitting zone is narrow** because of the figure-scale/field-scale mismatch
  described above. If the game feels unfair rather than hard, this is the cause,
  and the fix is the delivery's release height and bounce, not the bat.
- **`FIELD` has four fielders on a straight line.** There is no leg side or off
  side — the view is purely side-on, so every shot is "down the ground". Real
  field placement needs either a second axis or an honest decision that this game
  does not have one.
- **Running between the wickets is not simulated.** Distance stands in for it,
  deliberately conservatively.
- **No LBW, run-out or stumped.** The `Dismissal` type lists them; only `bowled`
  and `caught` are produced.
- **The bowler is hardcoded** in `MatchScene.ts` as one 138kph seamer. M3
  replaces it.
- **The crowd is drawn with `Math.random`.** Fine — it is decoration and runs
  once. Nothing feeding the simulation may do this; the sim's randomness must
  come from a seed.
- **`window.__game` is exposed in dev builds only**, guarded by
  `import.meta.env.DEV`. It is the intended way to measure the physics.
- **Not pushed anywhere.** No git remote is configured.

## Running it

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # 11 tests, no browser
npm run build
```

Click to face a delivery. Move the mouse to swing.
