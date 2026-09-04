import type { Fate } from "../../sim/tournament";
import { el, hex, hudRoot, ordinal, trophyMark } from "./dom";

export interface FateSpec {
  fate: Fate;
  team: { name: string; primary: number; secondary: number };

  by?: string;

  onClose: () => void;

  onNewSeason?: () => void;
}

let current: HTMLElement | undefined;

export function showFate(spec: FateSpec): void {
  hideFate();
  const { fate, team } = spec;
  const scrim = el("div", "scrim fate");
  scrim.style.pointerEvents = "auto";
  const card = el("div", `fate-card ${fate.kind}`);
  card.style.setProperty("--flag-primary", hex(team.primary));
  card.style.setProperty("--flag-secondary", hex(team.secondary));

  if (fate.kind === "champion") {
    card.append(
      trophyMark(),
      el("div", "eyebrow", "Champions"),
      el("div", "title", team.name),
      el("div", "line", "Nine league games, the playoffs, the final. Your season. Take a bow."),
    );
  } else if (fate.kind === "runner-up") {
    card.append(
      el("div", "eyebrow", "Runners-up"),
      el("div", "title", "Beaten in the final"),
      el("div", "line", spec.by ? `${spec.by} lift the trophy. ${team.name} were one match from it.` : `${team.name} were one match from it.`),
    );
  } else if (fate.stage === "league") {
    card.append(
      el("div", "eyebrow", "Season over"),
      el("div", "title", "Out at the league stage"),
      el("div", "line", `${team.name} finished ${ordinal(fate.place)}. The top four go on without you.`),
    );
  } else {
    const stage = fate.stage === "eliminator" ? "the Eliminator" : "Qualifier 2";
    card.append(
      el("div", "eyebrow", "Knocked out"),
      el("div", "title", `Beaten in ${stage}`),
      el("div", "line", spec.by ? `${spec.by} go through. ${team.name} finished ${ordinal(fate.place)} in the league and go home.` : `${team.name} go home.`),
    );
  }

  const actions = el("div", "actions");
  const close = el("button", "primary", fate.kind === "champion" ? "Take a bow" : "See the table");
  close.type = "button";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    hideFate();
    spec.onClose();
  });
  actions.append(close);
  if (spec.onNewSeason) {
    const fresh = el("button", "ghost", "New season");
    fresh.type = "button";
    fresh.addEventListener("click", (e) => {
      e.stopPropagation();
      hideFate();
      spec.onNewSeason?.();
    });
    actions.append(fresh);
  }
  card.append(actions);
  scrim.append(card);
  hudRoot().appendChild(scrim);
  current = scrim;
  requestAnimationFrame(() => scrim.classList.add("is-on"));
}

export function hideFate(): void {
  current?.remove();
  current = undefined;
}
