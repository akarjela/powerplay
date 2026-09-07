import { franchiseById } from "../../../data/franchises";
import {
  MIN_BOWLERS, PURSE, SQUAD_SIZE, TIERS, baseOf, bid, currentLot, isStarred, nextPrice, open, owned, pass, passAll,
  roleOf, skipToStar, star, tierOf, toSquad, upcoming, youCanBid,
} from "../../../sim/auction";
import type { Auction, PoolPlayer } from "../../../sim/auction";
import { el, hudRoot, teamTint, trophyMark } from "../dom";
import { bowlerRole, ratingCell } from "./squadPanel";

export interface AuctionScreenHandlers {
  onChange: (auction: Auction) => void;
  onStartSeason: (auction: Auction) => void;
  onTeams: () => void;
  onAbandon: () => void;
}

const cr = (n: number) => n.toFixed(2);

export class AuctionScreen {
  private readonly screen: HTMLElement;
  private readonly body: HTMLElement;
  private readonly handlers: AuctionScreenHandlers;
  private state: Auction;
  private armed = false;

  constructor(auction: Auction, handlers: AuctionScreenHandlers) {
    this.state = auction;
    this.handlers = handlers;
    this.screen = el("div", "screen auction is-tinted");
    this.body = el("div", "auction-body");
    this.screen.append(this.body);
    hudRoot().append(this.screen);
    requestAnimationFrame(() => this.screen.classList.add("is-on"));
    this.render();
  }

  private set(next: Auction): void {
    if (next === this.state) return;
    this.state = next;
    this.armed = false;
    this.handlers.onChange(next);
    this.render();
  }

  private render(): void {
    const a = this.state;
    const you = franchiseById(a.you);
    teamTint(this.screen, you.colours);
    const top = this.screen.scrollTop;
    this.body.replaceChildren();

    const head = el("header", "screen-head");
    const mark = el("div", "wordmark");
    mark.append(trophyMark("mark"), el("span", undefined, "Auction"));
    head.append(mark, el("div", "who", you.name));
    const mine = owned(a, a.you);
    head.append(
      stat("Purse", cr(a.purse[a.you]), "cr left"),
      stat("Squad", `${mine.length}/${SQUAD_SIZE}`, `${mine.filter((p) => p.bowler).length} bowl`),
    );
    const teams = el("button", "ghost", "Teams");
    teams.type = "button";
    teams.addEventListener("click", () => this.handlers.onTeams());
    head.append(teams);
    this.body.append(head);

    const grid = el("div", "auction-grid");
    const left = el("div", "season-col");
    const right = el("div", "season-col");
    if (a.stage === "watch") left.append(this.poolPanel());
    else if (a.stage === "bidding") left.append(this.lotPanel());
    else left.append(this.donePanel());
    if (a.stage !== "done") right.append(this.upcomingPanel());
    right.append(this.minePanel(), this.roomPanel());
    grid.append(left, right);
    this.body.append(grid);
    this.screen.scrollTop = top;
  }

  private playerRow(p: PoolPlayer, extra: HTMLElement[] = []): HTMLElement {
    const a = this.state;
    const from = franchiseById(p.from);
    const row = el("div", `lot-row ${isStarred(a, p.id) ? "is-starred" : ""}`);
    teamTint(row, from.colours);
    const s = el("button", "star", isStarred(a, p.id) ? "Starred" : "Star");
    s.type = "button";
    s.setAttribute("aria-pressed", String(isStarred(a, p.id)));
    s.addEventListener("click", () => this.set(star(a, p.id)));
    row.append(
      s,
      el("span", "flag"),
      el("span", "name", p.name),
      el("span", "code", from.code),
      el("span", "role", roleLabel(p)),
      el("span", "money", `${cr(baseOf(p))}`),
      ...extra,
    );
    return row;
  }

  private poolPanel(): HTMLElement {
    const a = this.state;
    const panel = el("section", "panel pool");
    const head = el("div", "panel-head");
    head.append(el("span", "label", "The pool"), el("span", "who", `${a.pool.length} players · ${a.watch.length} starred`));
    panel.append(head);
    panel.append(el("p", "note", "Star the players you want. Once the auction opens you can skip straight to your next star, and every lot in between goes to the other sides."));
    for (const tier of TIERS) {
      const set = a.pool.filter((p) => tierOf(p) === tier);
      if (set.length === 0) continue;
      panel.append(el("div", "set-head", `${tier.name} · base ${cr(tier.base)} cr · ${set.length}`));
      for (const p of set) panel.append(this.playerRow(p));
    }
    const row = el("div", "actions");
    const go = el("button", "primary", "Open the auction");
    go.type = "button";
    go.addEventListener("click", () => this.set(open(a)));
    row.append(go, this.abandonButton());
    panel.append(row);
    return panel;
  }

  private lotPanel(): HTMLElement {
    const a = this.state;
    const p = currentLot(a)!;
    const from = franchiseById(p.from);
    const panel = el("section", "panel lot");

    const head = el("div", "panel-head");
    head.append(el("span", "label", `Lot ${a.lot + 1} of ${a.pool.length} · ${tierOf(p).name}`), el("span", "who", `Base ${cr(baseOf(p))} cr`));
    panel.append(head);

    const who = el("div", "lot-who");
    const bug = el("div", "bug");
    teamTint(bug, from.colours);
    bug.append(el("span", "code", from.code), el("span", "name", from.name));
    const name = el("div", "lot-name");
    name.append(el("div", "big", p.name), el("div", "sub", roleLabel(p)));
    who.append(bug, name);
    panel.append(who);

    panel.append(ratings(p));

    const price = el("div", "price-row");
    const sold = a.holder !== null && a.price !== null;
    const holder = sold ? franchiseById(a.holder!) : null;
    const bidCell = el("div", "price-cell is-bid");
    bidCell.append(el("span", "label", sold ? "Current bid" : "No bids yet"));
    const fig = el("div", "fig", sold ? cr(a.price!) : cr(baseOf(p)));
    bidCell.append(fig);
    if (holder) {
      const h = el("span", "holder");
      teamTint(h, holder.colours);
      h.append(el("span", "flag"), el("span", "code", holder.code));
      bidCell.append(h);
    } else {
      bidCell.append(el("span", "holder mute", "opens at base"));
    }
    price.append(bidCell);
    panel.append(price);

    const can = youCanBid(a);
    const row = el("div", "actions");
    const b = el("button", "primary", `Bid ${cr(nextPrice(a))}`);
    b.type = "button";
    b.disabled = !can.ok;
    b.addEventListener("click", () => this.set(bid(a)));
    const ps = el("button", "ghost", sold ? `Let ${holder!.code} have him` : "Pass");
    ps.type = "button";
    ps.addEventListener("click", () => this.set(pass(a)));
    const s = el("button", `ghost star ${isStarred(a, p.id) ? "is-on" : ""}`, isStarred(a, p.id) ? "Starred" : "Star");
    s.type = "button";
    s.addEventListener("click", () => this.set(star(a, p.id)));
    row.append(b, ps, s);
    panel.append(row);
    if (!can.ok && can.why) panel.append(el("p", "note", can.why));

    if (a.last) {
      const prev = a.pool.find((x) => x.id === a.last!.player)!;
      const line = el("div", `last ${a.last.sale ? (a.last.sale.to === a.you ? "is-yours" : "") : "is-unsold"}`);
      if (a.last.sale) {
        const to = franchiseById(a.last.sale.to);
        line.append(el("span", "word", a.last.sale.to === a.you ? "Yours" : "Sold"), el("span", "text", `${prev.name} to ${to.name} for ${cr(a.last.sale.price)} cr`));
      } else {
        line.append(el("span", "word", "Unsold"), el("span", "text", `${prev.name} found no buyer`));
      }
      panel.append(line);
    }
    return panel;
  }

  private upcomingPanel(): HTMLElement {
    const a = this.state;
    const panel = el("section", "panel next");
    const head = el("div", "panel-head");
    head.append(el("span", "label", a.stage === "watch" ? "First up" : "Coming up"), el("span", "who", `${a.pool.length - a.lot - (a.stage === "bidding" ? 1 : 0)} to come`));
    panel.append(head);
    for (const p of upcoming(a, 8)) panel.append(this.playerRow(p));
    if (a.stage === "bidding") {
      const row = el("div", "actions");
      const nextStar = a.pool.slice(a.lot + 1).some((p) => isStarred(a, p.id));
      const skip = el("button", "ghost", "Skip to my next star");
      skip.type = "button";
      skip.disabled = !nextStar;
      skip.addEventListener("click", () => this.set(skipToStar(pass(a))));
      const rest = el("button", "danger", this.armed ? `Sure? Pass on all ${a.pool.length - a.lot} lots` : "Pass on the rest");
      rest.type = "button";
      rest.addEventListener("click", () => {
        if (this.armed) this.set(passAll(a));
        else {
          this.armed = true;
          this.render();
        }
      });
      row.append(skip, rest);
      panel.append(row);
      if (!nextStar) panel.append(el("p", "note", "Nothing starred ahead. Star a player in the list to skip to him."));
    }
    return panel;
  }

  private minePanel(): HTMLElement {
    const a = this.state;
    const you = franchiseById(a.you);
    const mine = owned(a, a.you).sort((x, y) => a.sold[y.id].price - a.sold[x.id].price);
    const panel = el("section", "panel mine");
    teamTint(panel, you.colours);
    const head = el("div", "panel-head");
    head.append(el("span", "label", "Your squad"), el("span", "who", `${mine.length} of ${SQUAD_SIZE}`));
    panel.append(head);
    if (mine.length === 0) panel.append(el("p", "note", "Nobody bought yet."));
    for (const p of mine) {
      const row = el("div", "mine-row");
      row.append(el("span", "name", p.name), el("span", "role", roleLabel(p)), el("span", "money", cr(a.sold[p.id].price)));
      panel.append(row);
    }
    const bowlers = mine.filter((p) => p.bowler).length;
    const foot = el("div", "line");
    foot.textContent = `Spent ${cr(PURSE - a.purse[a.you])} cr, ${cr(a.purse[a.you])} cr left.`;
    panel.append(foot);
    if (bowlers < MIN_BOWLERS) panel.append(el("div", "line warn", `${MIN_BOWLERS - bowlers} more who can bowl, or part-timers will bowl for you.`));
    return panel;
  }

  private roomPanel(): HTMLElement {
    const a = this.state;
    const panel = el("section", "panel room");
    panel.append(el("span", "label", "The room"));
    const sides = a.squads.slice().sort((x, y) => a.purse[y] - a.purse[x]);
    for (const id of sides) {
      const f = franchiseById(id);
      const row = el("div", `room-row ${id === a.you ? "is-you" : ""}`);
      teamTint(row, f.colours);
      const bar = el("span", "purse");
      bar.style.setProperty("--v", `${(a.purse[id] / PURSE) * 100}%`);
      row.append(el("span", "flag"), el("span", "code", f.code), el("span", "n", `${owned(a, id).length}/${SQUAD_SIZE}`), bar, el("span", "money", cr(a.purse[id])));
      panel.append(row);
    }
    return panel;
  }

  private donePanel(): HTMLElement {
    const a = this.state;
    const you = franchiseById(a.you);
    const squad = toSquad(owned(a, a.you), a.you, you.name);
    const panel = el("section", "panel done");
    teamTint(panel, you.colours);
    panel.append(el("span", "label", "Auction complete"), el("div", "big", you.name));
    panel.append(el("div", "line", `Eleven bought for ${cr(PURSE - a.purse[a.you])} cr. ${a.filled.filter((id) => a.sold[id].to === a.you).length} came unsold at base.`));

    const table = el("div", "ratings cols-3");
    const header = el("div", "row head");
    header.append(el("span", "name"), el("span", "role"));
    for (const l of ["Pow", "Tec", "Agg"]) header.append(el("span", "col", l));
    table.append(header);
    squad.batters.forEach((b, i) => {
      const row = el("div", "row");
      const bowls = squad.bowlers.find((w) => w.id === b.id);
      const p = a.pool.find((x) => x.id === b.id)!;
      row.append(el("span", "name", `${i + 1}. ${b.name}`), el("span", "role", bowls ? (p.bowler ? bowlerRole(bowls.pace) : "part-timer") : ""));
      row.append(ratingCell(b.power), ratingCell(b.technique), ratingCell(b.aggression));
      table.append(row);
    });
    panel.append(table);
    const partTimers = squad.bowlers.filter((w) => !a.pool.find((p) => p.id === w.id)?.bowler).length;
    if (partTimers > 0) panel.append(el("div", "line warn", `${partTimers} part-timer${partTimers === 1 ? "" : "s"} will have to bowl.`));

    const row = el("div", "actions");
    const go = el("button", "primary", "Start season");
    go.type = "button";
    go.addEventListener("click", () => this.handlers.onStartSeason(a));
    row.append(go, this.abandonButton());
    panel.append(row);
    return panel;
  }

  private abandonButton(): HTMLButtonElement {
    const drop = el("button", "danger", "Abandon");
    drop.type = "button";
    drop.addEventListener("click", () => this.handlers.onAbandon());
    return drop;
  }

  destroy(): void {
    this.screen.remove();
  }
}

function stat(label: string, fig: string, unit: string): HTMLElement {
  const cell = el("div", "stat");
  cell.append(el("span", "label", label), el("span", "fig", fig), el("span", "unit", unit));
  return cell;
}

function roleLabel(p: PoolPlayer): string {
  const role = roleOf(p);
  if (role === "bat") return "bat";
  const kind = bowlerRole(p.bowler!.pace);
  return role === "all-rounder" ? `all-rounder · ${kind}` : kind;
}

function ratings(p: PoolPlayer): HTMLElement {
  const wrap = el("div", "lot-ratings");
  const bat = el("div", "ratings cols-3");
  const bh = el("div", "row head");
  bh.append(el("span", "name"), el("span", "role"));
  for (const l of ["Pow", "Tec", "Agg"]) bh.append(el("span", "col", l));
  const br = el("div", "row");
  br.append(el("span", "name", "Batting"), el("span", "role"), ratingCell(p.batter.power), ratingCell(p.batter.technique), ratingCell(p.batter.aggression));
  bat.append(bh, br);
  wrap.append(bat);
  if (p.bowler) {
    const bowl = el("div", "ratings cols-4");
    const wh = el("div", "row head");
    wh.append(el("span", "name"), el("span", "role"));
    for (const l of ["Pace", "Acc", "Mov", "Var"]) wh.append(el("span", "col", l));
    const wr = el("div", "row");
    wr.append(el("span", "name", "Bowling"), el("span", "role", bowlerRole(p.bowler.pace)), ratingCell(p.bowler.pace), ratingCell(p.bowler.accuracy), ratingCell(p.bowler.movement), ratingCell(p.bowler.variation));
    bowl.append(wh, wr);
    wrap.append(bowl);
  }
  return wrap;
}
