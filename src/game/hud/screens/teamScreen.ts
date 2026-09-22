import { FRANCHISES } from "../../../data/franchises";
import type { Franchise } from "../../../data/franchises";
import { nextFixture, standings } from "../../../sim/tournament";
import type { Fixture, Season } from "../../../sim/tournament";
import { button, el, hudRoot, ordinal, teamTint, trophyMark } from "../dom";
import { squadPanel } from "./squadPanel";
import type { Auction } from "../../../sim/auction";
import { SQUAD_SIZE, owned } from "../../../sim/auction";

export type Mode = "quick" | "season" | "auction";

const HINT: Record<Mode, string> = {
  quick: "Pick the side you bat for, then the side you face.",
  season: "Pick the franchise you carry through the season.",
  auction: "Pick the franchise whose purse you run. Every side rebuilds its eleven at the auction.",
};

const ACTION: Record<Mode, string> = {
  quick: "Play",
  season: "Start season",
  auction: "Start auction",
};

export interface TeamScreenHandlers {
  savedSeason: () => Season | null;
  onQuickMatch: (bat: Franchise, bowl: Franchise) => void;
  onNewSeason: (you: Franchise) => void;
  onContinueSeason: () => void;
  onAbandonSeason: () => void;
  savedAuction: () => Auction | null;
  onNewAuction: (you: Franchise) => void;
  onContinueAuction: () => void;
  onAbandonAuction: () => void;
}

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
    const mark = el("div", "wordmark");
    mark.append(trophyMark("mark"), el("span", undefined, "Powerplay"));
    head.append(mark);
    const tabs = el("div", "tabs");
    for (const [mode, label] of [["quick", "Quick match"], ["season", "Season"], ["auction", "Auction"]] as const) {
      const b = button("tab", label, () => {
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
    this.action = button("action-primary", "", () => this.go());
    head.append(this.action);
    screen.append(head);

    const grid = el("div", "franchises");
    for (const f of FRANCHISES) {
      const card = button("franchise", "", () => this.pick(f));
      teamTint(card, f.colours);
      const tag = el("span", "tag");
      card.append(
        el("span", "flag"),
        el("span", "code", f.code),
        el("span", "name", f.name),
        el("span", "ground", f.ground),
        tag,
      );
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
    if (this.mode !== "quick") {
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
    else if (this.mode === "auction" && this.batting) this.handlers.onNewAuction(this.batting);
  }

  private refresh(): void {
    const lead = this.batting;
    this.screen.classList.toggle("is-tinted", Boolean(lead));
    if (lead) teamTint(this.screen, lead.colours);
    for (const [mode, b] of this.tabs) b.classList.toggle("is-on", mode === this.mode);
    this.hint.textContent = HINT[this.mode];

    for (const f of FRANCHISES) {
      const { card, tag } = this.cards.get(f.id)!;
      const you = this.batting?.id === f.id;
      const them = this.bowling?.id === f.id;
      card.classList.toggle("is-you", you);
      card.classList.toggle("is-them", them);
      if (you) tag.textContent = this.mode === "quick" ? "You bat" : "Your side";
      else tag.textContent = them ? "You face" : "";
    }

    this.panels.replaceChildren();
    if (this.mode === "season") this.seasonPanels();
    else if (this.mode === "auction") this.auctionPanels();
    else this.quickPanels();

    const ready = this.mode === "quick" ? Boolean(this.batting && this.bowling) : Boolean(this.batting);
    this.action.textContent = ACTION[this.mode];
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
    if (saved) this.panels.append(this.savedPanel(saved));
    else if (!this.batting) this.panels.append(note("Nine league games, then the playoffs if you make the top four. Pick a side."));
    if (this.batting) this.panels.append(squadPanel(this.batting, "Your squad", true));
  }

  private auctionPanels(): void {
    const saved = this.handlers.savedAuction();
    if (saved) this.panels.append(this.savedAuctionPanel(saved));
    else if (!this.batting) this.panels.append(note("A purse of 100 cr, 110 players, nine other sides bidding. Build an eleven, then play the season with it. Pick a side."));
    if (this.batting) {
      const panel = el("section", "panel squad");
      teamTint(panel, this.batting.colours);
      const head = el("div", "panel-head");
      head.append(el("span", "label", "Your shell"), el("span", "who", this.batting.name));
      panel.append(head, el("div", "line", `${this.batting.ground}. The name, the kit and the ground are yours; the players go back into the pool.`));
      if (this.handlers.savedSeason()) panel.append(el("div", "line warn", "Starting the season after this auction replaces the season in progress."));
      this.panels.append(panel);
    }
  }

  private savedAuctionPanel(saved: Auction): HTMLElement {
    const you = FRANCHISES.find((f) => f.id === saved.you)!;
    const panel = el("section", "panel saved");
    teamTint(panel, you.colours);
    const mine = owned(saved, saved.you).length;
    const line = auctionStageLine(saved, mine);
    panel.append(
      el("span", "label", "Auction in progress"),
      el("div", "big", you.name),
      el("div", "line", line),
    );
    const row = el("div", "actions");
    row.append(
      button("primary", "Continue", () => this.handlers.onContinueAuction()),
      button("danger", "Abandon", () => {
        this.handlers.onAbandonAuction();
        this.refresh();
      }),
    );
    panel.append(row);
    if (this.batting) panel.append(el("div", "line warn", `Starting a new auction as ${this.batting.name} replaces this one.`));
    return panel;
  }

  private savedPanel(saved: Season): HTMLElement {
    const you = FRANCHISES.find((f) => f.id === saved.you)!;
    const table = standings(saved);
    const place = table.findIndex((s) => s.squad === saved.you) + 1;

    const panel = el("section", "panel saved");
    teamTint(panel, you.colours);
    panel.append(
      el("span", "label", "Season in progress"),
      el("div", "big", you.name),
      el("div", "line", `${ordinal(place)} after ${table[place - 1].played} games. ${whatIsNext(nextFixture(saved))}`),
    );

    const row = el("div", "actions");
    row.append(
      button("primary", "Continue", () => this.handlers.onContinueSeason()),
      button("danger", "Abandon", () => {
        this.handlers.onAbandonSeason();
        this.refresh();
      }),
    );
    panel.append(row);

    if (this.batting) panel.append(el("div", "line warn", `Starting a new season as ${this.batting.name} replaces this one.`));
    return panel;
  }

  destroy(): void {
    this.screen.remove();
  }
}

function auctionStageLine(saved: Auction, owned: number): string {
  switch (saved.stage) {
    case "done":
      return "The auction is over. Your eleven is waiting.";
    case "watch":
      return "The pool is open for starring; no lot has been called.";
    case "bidding":
      return `Lot ${saved.lot + 1} of ${saved.pool.length}. ${owned} of ${SQUAD_SIZE} bought, ${saved.purse[saved.you].toFixed(2)} cr left.`;
  }
}

function note(text: string): HTMLElement {
  return el("p", "note", text);
}

function whatIsNext(next: Fixture | null): string {
  if (!next) return "Season complete.";
  switch (next.stage) {
    case "league": return `Next: round ${next.round}.`;
    case "qualifier1": return "Next: Qualifier 1.";
    case "qualifier2": return "Next: Qualifier 2.";
    case "eliminator": return "Next: the Eliminator.";
    case "final": return "Next: the Final.";
  }
}
