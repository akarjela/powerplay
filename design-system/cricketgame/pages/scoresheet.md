# Page: scoresheet (the full scorecard)

Overrides `../MASTER.md` for the scoresheet panel (`hud/scoresheet.ts`).

## Where it appears

- From the result card after a match: **Full scoresheet**, beside the leave
  button. **Back** returns to the result card; the strip is hidden while the
  sheet is up, the way the innings replay hides it.
- From the season screen: a **Scoresheet** chip on every result that carries
  one (`Played.sheets`). Results from a save older than 2026-09-11 have no
  chip.

## Layout

A scrim over whatever is behind it, scrollable. One Ink 0 panel,
`min(1180px, 96vw)`, with the flag of the side that batted first along the
top edge (won/lost tone replaces it with `--ahead` / `--wicket`, as the result
card does).

| Region | Content |
|---|---|
| Head | `SCORESHEET` eyebrow, the match title in display face, the result line (`--fg-dim`; `--ahead` won, `--wicket` lost). Right: both scorelines as broadcast bugs, your code in gold |
| Sheets | Two innings side by side (stacked below 1000px). Each is a section with the batting side's flag on its head: code, "X batting", `1ST INNINGS` / `2ND INNINGS · TARGET n`, the total in display face |
| Batting grid | `Batter · how out · R · B · 4s · 6s · SR`. Runs in display face; the rest `--fg-dim`. `not out` in `--live`. The top scorer's name in gold. Then an **Extras** row (`--extra` violet, with `wd nb b lb` broken out) and a **Total** row on Ink 1 with a 2px rule: wickets, overs and run rate |
| Did not bat | Label plus names, `--fg-dim` |
| Fall of wickets | `1-25 Rickelton, 2.3` chips; the wicket-score in `--wicket`, the rest dim |
| Bowling grid | `Bowler · O · M · R · W · Econ`. Wickets in display face; the best figures' name in gold |
| Actions | Right-aligned: ghost `Back` (match) or none, primary leave/close |

## Rules

- Everything is tabular-nums in the data face; only totals, runs and wickets
  take the display face.
- How-out reads as a scorecard: `b X`, `ct b X`, `lbw b X`, `st b X`,
  `run out`, `not out`. No fielder is named because neither path knows one.
- Colour is semantic only: violet is extras, red is a wicket, gold marks the
  best on each card, cyan marks not out. Team colour is a flag, never text.
- Wide grids scroll inside their own block; the page never scrolls sideways.
