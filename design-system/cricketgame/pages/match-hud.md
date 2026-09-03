# Page: match-hud (the bottom strip)

Overrides `../MASTER.md` for the in-match scoreboard.

## Layout

One row, full width, `height: min(15vh, 112px)`, anchored to the bottom of the
viewport, over the canvas. Grid columns, left to right:

| Cell | Content | Width |
|---|---|---|
| Flag | 6px primary + 3px secondary franchise bar | 9px |
| Score | `CODE` label over the score in `--t-score`; overs beside it in `--t-big` with `OV` label | auto |
| Chase | Chasing: `TARGET n` label, `NEED r OFF b` in `--t-big`. Batting first: `v CODE · PHASE` and projected total | auto |
| Rates | The comparison: two bars on one axis, `CRR` and `RRR` (or `PAR`, 8.25, when batting first). Ahead = `--ahead`, behind = `--behind`. The **gap** is filled and labelled with the signed difference | 1fr, min 160px |
| Batters | Two rows: striker (live marker) and non-striker. Name, runs, `(balls)`, SR. Striker in `--fg`, non-striker in `--fg-dim` | auto |
| This over | Six (or more) ball dots in a row; empty = `--dot` outline; dot ball = `--dot` filled; runs = `--ink-2` with the number; four = `--four`; six = `--six`; wicket = `--wicket` with `W`; wide/no-ball = `--extra` with `wd`/`nb`. Label `THIS OVER` and the over's runs | auto |
| Bowler | Name over `overs-maidens-runs-wickets` figures and `ECON` | auto |
| Action | The primary button: `NEXT BALL` (or `TAKE GUARD`, `SEE RESULT`). Below it the stance readout (`FRONT FOOT` / `BACK FOOT` / `NO STANCE`) and the key hint | auto |

At 1280px wide, every cell is present. Below 1100px the key hint and the
bowler's ECON drop. Below 900px the non-striker row drops.

## Pressure

The rates cell is the tension. The axis spans 0 → max(12, RRR + 2) runs per
over. CRR is a solid bar; RRR is a hollow marker line. When CRR < RRR the gap
between them fills `--behind` at 35% and the difference reads `−1.42`; when
ahead it fills `--ahead` and reads `+0.80`. The whole cell's hairline turns
`--behind` when the required rate exceeds 12, and the label reads `PRESSURE`.

## Pointer

`pointer-events: none` on the strip. `pointer-events: auto` on the button only,
so the swing (mouse move over the canvas) is never intercepted.
