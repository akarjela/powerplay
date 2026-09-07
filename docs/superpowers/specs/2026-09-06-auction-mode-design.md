# Auction mode — design

_2026-09-06. Approved in chat: an IPL-style mega auction, you play as one of
the ten franchise shells, technique drives bat speed (built separately)._

## What it is

A third tab next to Quick match and Season. You pick a franchise shell (its
name, kit, ground and colours), then all 110 authored players go into one
pool and ten sides -- you and nine AI -- buy elevens from it. The season that
follows is the ordinary season with those elevens instead of the authored
ones.

## The pure module: `src/sim/auction.ts`

No Phaser, no DOM, no `Math.random`. State is plain JSON so it can be saved
mid-auction and reloaded.

- **Pool.** Every player from `FRANCHISES`, keeping his id (so faces, caps
  and cards follow him), with `from` = the franchise he was authored for.
- **Worth and base price.** `overall` is the better of his batting value
  (power and technique) and his bowling value (pace, accuracy, movement,
  variation). `worth` maps overall to a price in cr; `base` is a tier of
  worth: 2.0 / 1.5 / 1.0 / 0.5 / 0.2. Lots are ordered by tier (marquee
  first) and shuffled within a tier by the seed.
- **Purse.** 100 cr a side. A side must end with 11 players.
- **A lot.** Opens with no bid. You may **bid** (at base, or one increment
  above the holder) or **pass**. After your bid the AI side with the highest
  ceiling raises by one increment if its ceiling allows, otherwise the lot is
  yours. If you pass with no bid, the lot resolves among the AI: the
  highest-ceiling side wins at one increment over the second-highest (or at
  base), or the player goes unsold. If you pass while an AI holds, it is
  sold to that side.
- **Ceilings.** `worth × need × noise`, capped by what the side can spend
  while still affording base for its remaining slots. `need` is 0 when the
  side is full, or when a non-bowler would leave it unable to reach five
  bowlers; a bowler is worth more to a side short of bowlers, and a top-order
  bat to a side short of them. Noise is seeded per lot and side, so the whole
  auction is a pure function of state and needs no saved rng.
- **Increments.** 0.25 to 5, 0.5 to 10, 1.0 above.
- **The end.** After the last lot, unsold players fill short sides at base,
  bowlers first to sides short of bowlers. A side that still has fewer than
  five bowlers makes part-timers of its best remaining batters (weak, fixed
  bowling ratings) so the innings model always has an attack. Batting order
  is by batting value, which puts bowlers at the tail.
- **Watchlist and skipping.** You star players before and during the
  auction. "Skip to my next star" resolves every lot up to it among the AI.

## Persistence

- `powerplay.auction.v1` holds the auction in progress.
- `Season.rosters?: Record<squadId, Squad>` is set when the season is created
  from an auction. `squadOf(season, id)` returns the roster or the authored
  squad; the season scene, the match scene and the team screen read squads
  through it. Old saves lack the field and behave as before.

## UI

`hud/screens/auctionScreen.ts` on the design system, tinted by your shell.
Header: wordmark, purse, squad count. Left: the lot as a player card with
rating bars, base, current bid and holder, Bid / Pass. Right: upcoming lots
with stars, skip, your squad with prices, the other sides' purses. Before
the first lot the same screen lists the pool by set for starring. When it is
done: your eleven in batting order and Start season.

`AuctionScene` mounts it and routes, like the other two scenes.

## Tests

`tests/auction.test.ts`: the pool and its order, base tiers, one lot passed
and one bid, a whole auction with you passing (everyone ends with 11, purses
never negative, deterministic on seed), a whole auction with you bidding on
a watchlist, part-timers, and a season played on the rosters.
