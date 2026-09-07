# Powerplay

A browser cricket game: **drag-to-swing batting physics, wrapped in a
stats-driven T20 tournament.**

You pick one of ten fictional franchises and carry it through a season: nine
league games, a points table with net run rate, the playoff bracket, a final,
a trophy. Every innings of yours you bat with a bat in your hand, on a nine-man
field drawn through a perspective camera of a floodlit stadium, against the
opposition's real attack. The model bats theirs, ball by ball, and you watch it
on a broadcast scorecard. Or skip the season and play a quick match. Or run
one franchise's purse through an auction first: 110 players, nine AI sides
bidding against you, and the season played with the eleven you bought.

The reference is Bennett Foddy's
[Little Master Cricket](https://www.foddy.net/legacy/Cricket.html), which nails
the swing and deliberately has nothing behind it. This keeps the bat and adds
the part that makes you keep playing.

Swing timing is the whole game. Mistime it and the bat has already stopped, so
you dribble it to mid-off. Time it and you clear the rope.

## Playing

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 187 tests in ~4s, no browser
npm run build   # dist/
```

- Pick a side and an opponent for a quick match, a side for a season, or a
  side whose purse you run at the auction.
- Win the toss and you choose: bat first, or bowl and chase.
- Click **Next ball** (or the ground, or space) to face a delivery. Move the
  mouse to swing; the bat follows the pointer with a lag, and that lag is the
  skill.
- **Left / right arrows** (or A / D) commit to the back or front foot before
  the ball arrives. A yorker wants the front foot; a short ball wants the back.
  Get it wrong and the bat does not reach.
- **Esc** leaves a match.

The strip along the bottom is a broadcast lower third: score, chase, the
current and required rates on one axis with the gap between them filled red or
green, both batters, the over ball by ball, the bowler's figures.

## How it is built

**TypeScript, Phaser 4, Matter, Vite, Vitest.** No image assets: the ground,
the crowd and every player are drawn as vectors and baked where they are
static.

### The one rule

> **The simulation is pure. Phaser only draws it.**

`src/sim/` imports nothing from Phaser, touches no DOM, and takes randomness
from a seeded generator passed in. The whole match model is testable in
milliseconds with no canvas, the other fixtures in a tournament round resolve
headlessly and instantly, and a shared seed reproduces a season exactly.

The seam is one type. `Outcome` in `src/sim/types.ts` is produced identically
whether a human hit the ball or the model rolled it, so one scorecard consumes
both. `src/sim/bridge.ts` closes the loop the other way: it reads what the
player did with the bat as the same `Shot` the model would have chosen, and
`tests/bridge.test.ts` plays the same deliveries through both paths and
measures whether they value a ball alike.

### The bat is pinned, not positioned

`src/game/physics/bat.ts` pins the handle with a Matter constraint and drives
the blade toward the pointer with a velocity-targeting controller at 240Hz.
It carries angular momentum, so the ball genuinely leaves faster off a full
swing than off a nudge, and it lags the pointer. A bat teleported to the
pointer angle each frame looks identical and feels dead.

### What is honest and what is not

Field distances are true to the Laws of Cricket: a 20.12m pitch, a 68m
boundary, run thresholds that mean what they say, delivery speeds from real
bowlers' attributes. The bat and ball are about four times life size, declared
at the top of `src/game/config.ts`, because a 36mm ball at a scale that fits
a 68m ground on screen is a fraction of a pixel and Matter would tunnel
straight through the bat.

### Measured, not asserted

Every number that matters was measured by stepping the physics engine by hand,
first in the browser console and now in `tests/headless.ts`, which builds the
scene's world from the scene's own constants and plays it in Node. The
simulation is calibrated against real IPL aggregates over three generated
seasons. Thresholds in tests sit under measured values, and the measured
values are printed with `MEASURE=1 npm test`. `HANDOFF.md` keeps the tables,
and a list of forty-odd things that looked correct and were not.

### The broadcast layer

The scoreboard, the moments (FOUR, SIX, WICKET, a fifty, the end of an over),
the toss and result cards, the opposition's innings replay, the team and
season screens, and the end-of-season trophy are all DOM over the canvas,
under `src/game/hud/`, on the design system in
`design-system/cricketgame/MASTER.md`. Everything honours
`prefers-reduced-motion`.

## Layout

| Path | |
| --- | --- |
| `src/sim/` | Pure. The ball-by-ball model, the season, the `Outcome` seam, the bridge |
| `src/data/franchises.ts` | The ten franchises and their elevens |
| `src/game/config.ts` | Every scale decision and every Matter body, in one place |
| `src/game/physics/` | The bat, the swing controller, the direction model, the field and the judge |
| `src/game/view/camera.ts` | Pure. The pinhole camera the ground is drawn through, and the full-bleed viewport scaling |
| `src/game/visuals/` | The stadium, the crowd, the players, the ball, the radar |
| `src/game/hud/` | The DOM layer: the strip, the moments, the cards, the replay, the screens |
| `src/game/scenes/` | Phaser scenes: the match, and thin shells for the team and season screens |
| `tests/headless.ts` | The real Matter world, played in Node |
| `tests/` | Vitest. Physics, calibration, the bridge, the camera, the season |
| `design-system/` | The palette, type and motion rules the UI is built on |
| `HANDOFF.md` | The state of the project in detail, the measurements, and the traps |

## Status

Done: the bat, the pure simulation, shot selection with footwork, the second
axis and nine-man fields, a real match with a toss, a season with playoffs
and a champion, the bridge between the two paths, a full UI pass. Left: a
design decision on how the two paths value a ball (they are measured, and
close, and not identical), sound, touch input, deployment, season history.
`HANDOFF.md` has the ordered list.

Teams are fictional throughout. Players carry the real first names of their
IPL counterparts with changed surnames, so the elevens read as familiar
without using a licensed full name or likeness. Neither the franchise names
nor the player names have been cleared against a trademark register.
