# Powerplay

A cricket game: drag-to-swing batting physics, with a stats-driven IPL-style
tournament around it.

Inspired by Bennett Foddy's [Little Master Cricket](https://www.foddy.net/legacy/Cricket.html),
which nails the swing and deliberately has nothing behind it — no opponent, no
consequence, every ball identical to the last. This keeps the bat and adds the
part that makes you keep playing.

**Status: M1, M2 and M4 done, M3 nearly.** Pick one of ten fictional
franchises and carry it through a season: nine league games, a points table
with net run rate, the playoff bracket, a champion. You bat every innings of
yours with a drag-to-swing bat on a nine-man field drawn through a perspective
camera; the model bats theirs and chases your totals. Or play a quick match. The tournament is not built yet — see the milestones
below, and `HANDOFF.md` for the state in detail.

Swing timing is the whole game: mistime it and the bat has already stopped, so
you dribble it 8m. Time it and you clear the rope.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 145 tests, no browser
```

Quick match or season. Click to face a delivery, move the mouse to swing,
arrow keys to pick a foot. Esc leaves a match.

## The architecture, in one rule

> **The simulation is pure. Phaser only draws it.**

`src/sim/` imports nothing from Phaser, touches no DOM, and takes randomness from
a seeded generator passed in. That is what makes the match model testable in
milliseconds with no canvas, lets the other fixtures in a tournament round
resolve headlessly and instantly, and makes a shared seed reproduce a whole
season exactly.

The seam is one type. `Outcome` is produced identically whether a human hit the
ball or the model rolled it, so a single scorecard implementation consumes both
and the two paths cannot drift apart.

## What is honest and what is not

Field **distances** are true to the Laws of Cricket: a 20.12m pitch, a 68m
boundary, and run thresholds that mean what they say.

Gameplay **objects** are not, and cannot be. A cricket ball is 36mm across; at
any scale that fits a 68m ground on screen it is a fraction of a pixel. Matter
cannot solve a sub-pixel body at 140kph — it tunnels straight through the bat —
and you could not see it if it could. So the bat and ball are ~4x exaggerated,
declared in `src/game/config.ts` rather than buried as magic numbers.

Speeds stay real. A 138kph delivery is measured leaving the hand at 8.94 px/step
and arriving at the batter 0.55s later, against 0.52s in the real world; the
difference is air resistance, which is also real.

## Three bugs worth remembering

Found by measuring rather than watching, and all three looked like "the swing
feels bad" from the outside:

1. **The outfield was painted, not simulated.** No static body at ground level,
   so the ball fell straight through the pitch and passed ~100px *below* the
   bat's arc. Unhittable at every timing.
2. **The bat tunnelled through the ball.** At 60Hz a full swing moves the blade
   tip ~22px per step — wider than the ball and wider than the blade. Matter has
   no continuous collision detection, so the physics runs at 240Hz instead.
3. **Rescaling per-step units by hand.** Matter normalises `setVelocity`,
   `setAngularVelocity` and `frictionAir` against a fixed 16.667ms base delta, so
   they must *not* be rescaled when the step rate changes. Doing it "correctly"
   turned a 138kph delivery into a 34kph one.

A fourth, non-bug: a backgrounded browser tab pauses `requestAnimationFrame`
entirely, so the ball appears frozen and the physics looks broken when nothing
is wrong. Step the engine by hand to measure it.

## Why the bat is pinned rather than positioned

`src/game/physics/bat.ts` pins the handle with a Matter `worldConstraint` and
drives the blade toward the pointer with a PD controller. Two consequences, both
deliberate:

- It carries **angular momentum**, so the ball genuinely leaves faster off a full
  swing than off a nudge — the collision solver computes that for free. A bat
  teleported to the pointer angle each frame looks identical and feels dead,
  because a teleported body has no velocity to transfer.
- It **lags the pointer**. That lag is the entire skill: swing early and you are
  through the shot, swing late and you edge it. Remove it and there is nothing
  left to be good at.

## Milestones

- [x] **M1 — the batting feels right.** Matter bat on a pivot, scale-true field,
      fielders, catches, boundaries, live score.
- [x] **M2 — the pure sim.** Ball-by-ball model, deterministic under a seed, full
      scorecards resolved headlessly.
- [x] **The field is a plan.** A bearing for every shot from where the bat met
      the ball, nine fielders per phase under the powerplay law, gaps and
      cut-offs, wides and no-balls, a wagon wheel.
- [ ] **M3 — the two halves meet.** Squad data ✓; you bat against a real attack
      whose attributes change the delivery ✓; a human's shot flows back through
      the model — not yet.
- [x] **M4 — the tournament.** Ten fictional franchises, round robin, IPL playoff
      bracket, points table with net run rate, saved between sessions.
- [ ] **M5 — polish.** Sound, touch, a crowd that reacts, deploy.

Teams and players are fictional throughout. Real IPL franchise names and player
likenesses are licensed, and this is meant to be publishable.

## Layout

| Path | |
| --- | --- |
| `src/sim/` | Pure. No Phaser, no DOM. The `Outcome` seam lives here. |
| `src/game/config.ts` | Every scale decision, including the one compromise |
| `src/game/physics/bat.ts` | The pivot constraint and swing controller |
| `src/game/physics/direction.ts` | Pure. The second axis: bearing, plan, projection |
| `src/game/physics/field.ts` | Pure. Nine-man fields, reach, rolling, and the judge |
| `src/game/view/camera.ts` | Pure. The perspective camera the ground is drawn through |
| `src/sim/tournament.ts` | Pure. Fixtures, the table, the bracket |
| `src/data/franchises.ts` | The ten franchises and their elevens |
| `src/game/scenes/SelectScene.ts` | Quick match or season; pick the sides |
| `src/game/scenes/SeasonScene.ts` | The table and the fixture in hand |
| `src/game/scenes/MatchScene.ts` | Rendering and the ball's lifecycle |
| `tests/headless.ts` | The real Matter world, played in Node |
| `tests/` | Vitest, no browser |
