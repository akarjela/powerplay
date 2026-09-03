# Page: moments (full-screen typographic events)

Overrides `../MASTER.md` for FOUR, SIX, WICKET, FIFTY, HUNDRED and OVER.

All are full-viewport, centred, display face, `pointer-events: none`, and are
removed from the DOM when done. Hard in, soft out. Under reduced motion every
one becomes a 200ms opacity fade with no transform and no flash.

| Moment | Personality | In | Hold | Out | Colour |
|---|---|---|---|---|---|
| FOUR | Quick and clean: the word slams in from slightly large, a horizontal rule sweeps out beneath it | 120ms scale 1.15→1 | 500ms | 250ms fade + slight rise | `--four` on a diagonal `--four` band at 12% |
| SIX | Explosive: the word bursts from 0.4→1.08→1 with a white flash and a radial shock ring; letters spread by tracking | 180ms | 650ms | 300ms | `--six`, white flash 90ms |
| WICKET | A gut punch: the word drops a few pixels *down* with a hard stop, the whole frame dims to 60%, a red bar cuts across | 90ms | 800ms | 350ms | `--wicket` on `rgba(0,0,0,.4)` scrim |
| FIFTY / HUNDRED | Earned: the number counts up 47→50 in 300ms over the batter's name, gold rule underlines it | 300ms count | 700ms | 300ms | `--milestone` |
| OVER | A lower-third summary, not full-screen text: `END OF OVER n` with the six balls and the over's runs; slides *up* from the strip 8px | 160ms | 1100ms | 220ms | `--fg` on `--ink-1` |

Never two moments at once: a later one replaces an earlier one immediately.
