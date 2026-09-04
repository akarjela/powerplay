import type { Fate } from "../../sim/tournament";
import { el, hex, hudRoot, ordinal } from "./dom";

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
      trophy(),
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

function trophy(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 140");
  svg.setAttribute("class", "trophy");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `
    <defs>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff0b3"/><stop offset=".45" stop-color="#ffd966"/><stop offset="1" stop-color="#b8860b"/>
      </linearGradient>
    </defs>
    <path d="M18 22h84v8c0 30-16 50-42 56C34 80 18 60 18 30z" fill="url(#gold)"/>
    <path d="M18 30H6c0 22 12 34 26 36" fill="none" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>
    <path d="M102 30h12c0 22-12 34-26 36" fill="none" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>
    <rect x="52" y="86" width="16" height="18" fill="url(#gold)"/>
    <rect x="36" y="104" width="48" height="10" rx="2" fill="url(#gold)"/>
    <rect x="28" y="114" width="64" height="14" rx="3" fill="#7a5a10"/>
    <path d="M32 30c2 14 8 24 18 30" stroke="#fff8dc" stroke-width="4" stroke-linecap="round" opacity=".7"/>
  `;
  return svg;
}
