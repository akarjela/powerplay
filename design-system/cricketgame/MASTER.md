# Design System Master File — Powerplay

> **LOGIC:** When building a specific page or surface, first check
> `design-system/cricketgame/pages/[page-name].md`. If that file exists, its rules
> **override** this Master file. If not, strictly follow the rules below.
>
> **Every session that touches UI starts with: "Read design-system/cricketgame/MASTER.md first."**

---

**Project:** Powerplay (CricketGame)
**Generated:** 2026-09-03 by ui-ux-pro-max (`live sports broadcast scoreboard dark`)
**Overridden by hand:** 2026-09-03. The generator proposed a light "team red" palette;
this is a floodlit T20 broadcast, so the palette below replaces it entirely.
**Category:** Live sports broadcast graphics

---

## Direction

Modern sports broadcast graphics. Confident, high-contrast, slightly aggressive.
Data-dense: a broadcast viewer reads a lot at a glance. Hard edges and
chamfers, not rounded cards. Colour is *semantic* — a colour on the strip means
something happened — never decorative.

The one emotion the HUD exists to carry is **tension in a chase**: the required
rate should feel like pressure. Green means you are ahead, red means you are
behind, and the gap between the two rates is drawn, not just printed.

## Global Rules

### Color Palette

Dark-first and single-look. The game is played over a floodlit ground; there is
no light theme.

| Role | Hex | CSS Variable | Use |
|------|-----|--------------|-----|
| Ink 0 | `#05070C` | `--ink-0` | Strip base. Near-black with a blue cast |
| Ink 1 | `#0B0F1A` | `--ink-1` | Panels, cells |
| Ink 2 | `#151B2B` | `--ink-2` | Raised cells, ball-tracker empties |
| Line | `#263049` | `--line` | Hairlines between cells |
| Foreground | `#F5F7FB` | `--fg` | Primary figures and names |
| Foreground dim | `#9AA5BD` | `--fg-dim` | Labels, units, secondary stats |
| Foreground mute | `#5C6780` | `--fg-mute` | Captions, key hints |
| Live | `#00E5FF` | `--live` | The live marker, data highlights, the primary action |
| On live | `#04121A` | `--on-live` | Text on a live-coloured surface |
| Four | `#FFC400` | `--four` | A four. Amber |
| Six | `#FF5A1F` | `--six` | A six. Hot orange |
| Wicket | `#FF1E4A` | `--wicket` | A wicket. Red, always red |
| Ahead | `#22E58A` | `--ahead` | Run rate ahead of the ask |
| Behind | `#FF3B3B` | `--behind` | Run rate behind the ask |
| Extra | `#C084FC` | `--extra` | Wides and no-balls. Violet |
| Dot | `#2E3648` | `--dot` | A dot ball on the tracker |
| Milestone | `#FFD966` | `--milestone` | Fifty, hundred. Gold |

Contrast: every foreground on Ink 0/1 clears 7:1; `--fg-dim` on Ink 1 is 6.4:1;
`--fg-mute` is for captions only and is never the sole carrier of information.
Franchise colours appear only as a **flag** (a vertical bar on the leading edge
of the strip) and never as a text colour.

### Colour, the vivid layer (added 2026-09-04)

The base above is the broadcast strip. The **screens** -- team, season, the
cards -- are allowed to be loud, the way a T20 league is:

- **Team colours take over.** Once a side is chosen, its `primary` tints the
  page: the top band, a radial wash behind the header, the primary action
  (with `--on-team` picked for contrast by `onColour()`), the leading edge of
  every panel, your row in the table, your score cell on the strip.
  `teamTint(node, colours)` sets `--flag-primary`, `--flag-secondary` and
  `--on-team` on any element.
- **Brand gradient** before a side is chosen: `--brand-a` `#7C3AED` (purple)
  to `--brand-b` `#F97316` (orange) to `--milestone` gold, on the band and
  the background washes.
- **Franchise cards and fixture bugs are full-colour blocks** in the side's
  primary with the secondary as an edge; text on them is `--on-team`.
- **The trophy** (`trophyMark()` in dom.ts) marks the wordmark on both
  screens, the champion panel and the champion card. Gold is the one colour
  that means "the prize" and is never used for anything else.
- Semantic colours on the strip (four, six, wicket, ahead, behind, live) are
  unchanged and are not overridden by team colours.

### Typography

- **Display:** `Bebas Neue`, fallback `Impact, "Arial Narrow Bold", sans-serif`.
  Scores, overs, the moment overlays, section labels. Always uppercase; it has
  no lowercase.
- **Data:** `Barlow Semi Condensed`, fallback `"Arial Narrow", system-ui, sans-serif`,
  with `font-variant-numeric: tabular-nums`. Names, rates, figures, buttons.
- **Google Fonts:** https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap

Scale (the strip is sized in viewport height so it never exceeds 15vh):

| Token | Size | Use |
|---|---|---|
| `--t-score` | `clamp(30px, 5.2vh, 54px)` | The team score |
| `--t-big` | `clamp(20px, 3.2vh, 34px)` | Overs, the rate figures |
| `--t-data` | `clamp(13px, 1.9vh, 18px)` | Names, figures |
| `--t-label` | `clamp(10px, 1.3vh, 12px)` | Labels, tracking 0.12em, uppercase |
| `--t-moment` | `clamp(96px, 26vw, 420px)` | FOUR / SIX / WICKET |

### Spacing

Tight. The strip uses `--space-xs` 4px, `--space-sm` 8px, `--space-md` 12px,
`--space-lg` 20px. Cells are separated by a 1px `--line`, not by margin.

### Shape

- Corners: **0**. A chamfer (`clip-path` cut of 6–10px on one corner) is the
  only permitted softening, used on the leading edge of a cell.
- The strip's leading edge carries a 6px + 3px franchise flag (primary,
  secondary), the way a broadcast lower-third carries a team bug.
- No drop shadows on the strip. Depth comes from Ink 0 → Ink 1 → Ink 2.

### Motion

- Ordinary state changes: 150–220ms, `cubic-bezier(.2,.8,.2,1)`.
- Moments (FOUR/SIX/WICKET/FIFTY/OVER): hard in, soft out. Total on screen
  under 1.4s. No slide-in-from-top. Each has its own personality; see
  `pages/moments.md`.
- Game feel (camera shake, push-in, flashes): every effect under 600ms.
- **`prefers-reduced-motion: reduce`** turns every moment into a 200ms fade
  with no transform, and disables shake, push-in and crowd surges.

## Component Specs

### The strip (bottom scoreboard)

See `pages/match-hud.md`. Height `min(15vh, 112px)`, full width, sits over the
canvas with `pointer-events: none` except for the primary action.

### Primary action

The next-ball button. `--live` fill, `--on-live` text, display face, uppercase,
chamfered leading corner, a 2px `--live` outline on focus-visible. It pulses
(scale 1 → 1.03, 900ms) only while the game is waiting on the player, and never
under reduced motion. It is the only element on the strip that takes the pointer.

### Cards (toss, result)

Ink 1 panel, franchise flag along the top edge, display title, data lines.
Full-viewport scrim `rgba(2,4,10,.55)`. Prompt in `--live`.

## Anti-Patterns (Do NOT Use)

- ❌ Rounded-corner-everything, dashboard cards, drop shadows on the strip
- ❌ Franchise colour as a text colour
- ❌ Two numbers where a comparison is meant (rates are a drawn gap)
- ❌ Toasts. A four is a moment, not a notification
- ❌ Emojis as icons; use inline SVG or typography
- ❌ Instant state changes on the strip; 150–220ms transitions
- ❌ Any effect over 600ms; any moment over 1.4s
- ❌ Light mode

## Pre-Delivery Checklist

- [ ] Strip ≤ 15vh at every viewport; legible at 1280px wide
- [ ] `prefers-reduced-motion` respected by every moment and every effect
- [ ] Focus visible on the primary action; `cursor: pointer` on it
- [ ] Required vs current rate is a drawn comparison
- [ ] Ball tracker shows every delivery of the over with runs/wicket/extra colour
- [ ] Nothing on the strip depends on colour alone (labels carry the meaning)
- [ ] No horizontal scroll; canvas is full-bleed with no bars
