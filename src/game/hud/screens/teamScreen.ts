import { FRANCHISES } from "../../../data/franchises";
import type { Franchise } from "../../../data/franchises";
import type { Batter, Bowler } from "../../../sim/player";
import { nextFixture, standings } from "../../../sim/tournament";
import type { Season } from "../../../sim/tournament";
import { el, hex, hudRoot } from "../dom";

/**
 * The team sheet: pick your side, and theirs -- or your side, and a season.
 *
 * Two modes. Quick match: the first click is the side you bat for, the
 * second the side you face, and both elevens are laid out below with their
 * ratings as bars, because the attributes are the whole point of the
 * squads. Season: one click picks the franchise you carry through a round
 * robin and the playoffs; if a season is already saved, it can be continued
 * instead. DOM, on the design system; the scene behind it only paints.
 */

export type Mode = "quick" | "season";

export interface TeamScreenHandlers {
  savedSeason: () => Season | null;
  onQuickMatch: (bat: Franchise, bowl: Franchise) => void;
  onNewSeason: (you: Franchise) => void;
  onContinueSeason: () => void;
  onAbandonSeason: () => void;
}

const ORDINAL = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

export class TeamScreen {
  private readonly root: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly handlers: TeamScreenHandlers;
  private mode: Mode;
  private batting?: Franchise;
  private bowling?: Franchise;

  private readonly tabs = new Map<Mode, HTMLButtonElement>();
  private readonly cards = new Map<string, { card: HTMLElement; tag: HTMLElement }>();
  private readonly hint: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly panels: HTMLElement;

  constructor(handlers: TeamScreenHandlers, initialMode: Mode) {
    this.handlers = handlers;
    this.mode = initialMode;
    this.root = hudRoot();
    const screen = el("div", "screen team");
    this.screen = screen;

    const head = el("header", "screen-head");
    head.append(el("div", "wordmark", "Powerplay"));
    const tabs = el("div", "tabs");
    for (const [mode, label] of [["quick", "Quick match"], ["season", "Season"]] as const) {
      const b = el("button", "tab", label);
      b.type = "button";
      b.addEventListener("click", () => {
        this.mode = mode;
        this.batting = undefined;
        this.bowling = undefined;
        this.refresh();
      });
      this.tabs.set(mode, b);
      tabs.append(b);
    }
    head.append(tabs);
    this.hint = el("div", "hint");
    head.append(this.hint);
    this.action = el("button", "action-primary");
    this.action.type = "button";
    this.action.addEventListener("click", () => this.go());
    head.append(this.action);
    screen.append(head);

    const grid = el("div", "franchises");
    for (const f of FRANCHISES) {
      const card = el("button", "franchise");
      card.type = "button";
      card.style.setProperty("--flag-primary", hex(f.colours.primary));
      card.style.setProperty("--flag-secondary", hex(f.colours.secondary));
      const tag = el("span", "tag");
      card.append(
        el("span", "flag"),
        el("span", "code", f.code),
        el("span", "name", f.name),
        el("span", "ground", f.ground),
        tag,
      );
      card.addEventListener("click", () => this.pick(f));
      this.cards.set(f.id, { card, tag });
      grid.append(card);
    }
    screen.append(grid);

    this.panels = el("div", "panels");
    screen.append(this.panels);

    this.root.append(screen);
    requestAnimationFrame(() => screen.classList.add("is-on"));
    this.refresh();
  }

  private pick(f: Franchise): void {
    if (this.mode === "season") {
      this.batting = this.batting?.id === f.id ? undefined : f;
      this.bowling = undefined;
    } else if (this.batting?.id === f.id) {
      this.batting = this.bowling;
      this.bowling = undefined;
    } else if (this.bowling?.id === f.id) {
      this.bowling = undefined;
    } else if (!this.batting) {
      this.batting = f;
    } else {
      this.bowling = f;
    }
    this.refresh();
  }

  private go(): void {
    if (this.mode === "quick" && this.batting && this.bowling) this.handlers.onQuickMatch(this.batting, this.bowling);
    else if (this.mode === "season" && this.batting) this.handlers.onNewSeason(this.batting);
  }

  private refresh(): void {
    for (const [mode, b] of this.tabs) b.classList.toggle("is-on", mode === this.mode);
    this.hint.textContent = this.mode === "quick"
      ? "Pick the side you bat for, then the side you face."
      : "Pick the franchise you carry through the season.";

    for (const f of FRANCHISES) {
      const { card, tag } = this.cards.get(f.id)!;
      const you = this.batting?.id === f.id;
      const them = this.bowling?.id === f.id;
      card.classList.toggle("is-you", you);
      card.classList.toggle("is-them", them);
      tag.textContent = you ? (this.mode === "season" ? "Your side" : "You bat") : them ? "You face" : "";
    }

    this.panels.replaceChildren();
    if (this.mode === "season") this.seasonPanels();
    else this.quickPanels();

    const ready = this.mode === "quick" ? Boolean(this.batting && this.bowling) : Boolean(this.batting);
    this.action.textContent = this.mode === "quick" ? "Play" : "Start season";
    this.action.hidden = !ready;
  }

  private quickPanels(): void {
    if (this.batting) this.panels.append(squadPanel(this.batting, "Your batting order", true));
    else this.panels.append(note("Click a card to choose the side you bat for."));
    if (this.bowling) this.panels.append(squadPanel(this.bowling, "Their attack", false));
    else if (this.batting) this.panels.append(note("Now click the side you want to face."));
  }

  private seasonPanels(): void {
    const saved = this.handlers.savedSeason();
    if (saved) {
      const you = FRANCHISES.find((f) => f.id === saved.you)!;
      const table = standings(saved);
      const place = table.findIndex((s) => s.squad === saved.you) + 1;
      const next = nextFixture(saved);
      const panel = el("section", "panel saved");
      panel.style.setProperty("--flag-primary", hex(you.colours.primary));
      panel.style.setProperty("--flag-secondary", hex(you.colours.secondary));
      panel.append(el("span", "label", "Season in progress"));
      panel.append(el("div", "big", you.name));
      panel.append(el("div", "line", `${ORDINAL(place)} after ${table[place - 1].played} games. ${next ? (next.stage === "league" ? `Next: round ${next.round}.` : `Next: ${next.stage === "qualifier1" ? "Qualifier 1" : next.stage === "qualifier2" ? "Qualifier 2" : next.stage === "eliminator" ? "the Eliminator" : "the Final"}.`) : "Season complete."}`));
      const row = el("div", "actions");
      const go = el("button", "primary", "Continue");
      go.type = "button";
      go.addEventListener("click", () => this.handlers.onContinueSeason());
      const drop = el("button", "danger", "Abandon");
      drop.type = "button";
      drop.addEventListener("click", () => {
        this.handlers.onAbandonSeason();
        this.refresh();
      });
      row.append(go, drop);
      panel.append(row);
      if (this.batting) panel.append(el("div", "line warn", `Starting a new season as ${this.batting.name} replaces this one.`));
      this.panels.append(panel);
    } else if (!this.batting) {
      this.panels.append(note("Nine league games, then the playoffs if you make the top four. Pick a side."));
    }
    if (this.batting) this.panels.append(squadPanel(this.batting, "Your squad", true));
  }

  destroy(): void {
    this.screen.remove();
  }
}

function note(text: string): HTMLElement {
  return el("p", "note", text);
}

/**
 * An eleven with rating bars. For the side you bat for that is the batting
 * attributes; for the side you face it is the six bowlers first, with the
 * ball's attributes, because that is what you are about to meet.
 */
function squadPanel(f: Franchise, title: string, batting: boolean): HTMLElement {
  const panel = el("section", "panel squad");
  panel.style.setProperty("--flag-primary", hex(f.colours.primary));
  panel.style.setProperty("--flag-secondary", hex(f.colours.secondary));
  const head = el("div", "panel-head");
  head.append(el("span", "label", title), el("span", "who", f.name));
  panel.append(head);

  const labels = batting ? ["Pow", "Tec", "Agg"] : ["Pace", "Acc", "Mov", "Var"];
  const table = el("div", `ratings cols-${labels.length}`);
  const header = el("div", "row head");
  header.append(el("span", "name"), el("span", "role"));
  for (const l of labels) header.append(el("span", "col", l));
  table.append(header);

  const rows: { name: string; values: number[]; role: string }[] = batting
    ? f.squad.batters.map((b: Batter, i) => ({
      name: `${i + 1}. ${b.name}`, values: [b.power, b.technique, b.aggression],
      role: f.squad.bowlers.some((w) => w.id === b.id) ? "all-rounder" : "",
    }))
    : [
      ...f.squad.bowlers.map((w: Bowler) => ({
        name: w.name, values: [w.pace, w.accuracy, w.movement, w.variation],
        role: w.pace < 35 ? "spin" : w.pace > 70 ? "fast" : "seam",
      })),
      ...f.squad.batters.filter((b) => !f.squad.bowlers.some((w) => w.id === b.id)).map((b) => ({
        name: b.name, values: [], role: "bat",
      })),
    ];

  for (const r of rows) {
    const row = el("div", "row");
    row.append(el("span", "name", r.name), el("span", "role", r.role));
    for (let i = 0; i < labels.length; i++) {
      const v = r.values[i];
      const cell = el("span", "col");
      if (v !== undefined) {
        const bar = el("span", `bar ${v >= 75 ? "elite" : v >= 55 ? "good" : v >= 40 ? "fair" : "weak"}`);
        bar.style.setProperty("--v", `${v}%`);
        bar.title = String(v);
        cell.append(bar);
      }
      row.append(cell);
    }
    table.append(row);
  }
  panel.append(table);
  return panel;
}
