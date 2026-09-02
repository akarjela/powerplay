# Powerplay

A cricket game: drag-to-swing batting physics, with a stats-driven IPL-style
tournament around it.

Inspired by Bennett Foddy's [Little Master Cricket](https://www.foddy.net/legacy/Cricket.html),
which nails the swing and deliberately has nothing behind it — no opponent, no
consequence, every ball identical to the last. This keeps the bat and adds the
part that makes you keep playing.

**Status: Milestone 1.** The batting works. Teams, squads and the tournament are
not built yet — see the milestones below.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 11 tests, no browser
```

Click to face a delivery, drag to swing.

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
- [ ] **M2 — the pure sim.** Ball-by-ball model, deterministic under a seed, full
      scorecards resolved headlessly.
- [ ] **M3 — the two halves meet.** Squad data; you bat against a real attack
      whose attributes change the delivery, your bowling innings simulates.
- [ ] **M4 — the tournament.** Ten fictional franchises, round robin, IPL playoff
      bracket, points table with net run rate.
- [ ] **M5 — persistence and polish.**

Teams and players are fictional throughout. Real IPL franchise names and player
likenesses are licensed, and this is meant to be publishable.

## Layout

| Path | |
| --- | --- |
| `src/sim/` | Pure. No Phaser, no DOM. The `Outcome` seam lives here. |
| `src/game/config.ts` | Every scale decision, including the one compromise |
| `src/game/physics/bat.ts` | The pivot constraint and swing controller |
| `src/game/physics/field.ts` | Pure outcome resolution — distances to runs |
| `src/game/scenes/MatchScene.ts` | Rendering and the ball's lifecycle |
| `tests/` | Vitest, no browser |
