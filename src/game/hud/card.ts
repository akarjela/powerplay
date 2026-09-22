import { button, el, hex, hudRoot } from "./dom";

export interface CardSpec {
  title: string;
  lines: { text: string; strong?: boolean }[];

  prompt: string;
  colours: { primary: number; secondary: number };
  tone?: "won" | "lost" | "neutral";

  choices?: { label: string; primary?: boolean; onPick: () => void }[];
}

let current: HTMLElement | undefined;

export function showCard(spec: CardSpec, onClick: () => void): void {
  hideCard();
  const scrim = el("div", "scrim");
  const card = el("div", `card ${spec.tone ?? ""}`);
  card.style.setProperty("--flag-primary", hex(spec.colours.primary));
  card.style.setProperty("--flag-secondary", hex(spec.colours.secondary));
  card.append(el("div", "title", spec.title));
  for (const line of spec.lines) card.append(el("div", `line ${line.strong ? "strong" : ""}`, line.text || " "));
  scrim.style.pointerEvents = "auto";
  if (spec.choices && spec.choices.length > 0) {
    const row = el("div", "choices");
    for (const choice of spec.choices) {
      row.append(button(choice.primary ? "primary" : "ghost", choice.label, (e) => {
        e.stopPropagation();
        hideCard();
        choice.onPick();
      }));
    }
    card.append(row);
    scrim.addEventListener("click", (e) => e.stopPropagation());
  } else {
    card.append(el("div", "prompt", spec.prompt));

    scrim.style.cursor = "pointer";
    scrim.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  scrim.append(card);
  hudRoot().appendChild(scrim);
  current = scrim;
  requestAnimationFrame(() => scrim.classList.add("is-on"));
}

export function hideCard(): void {
  current?.remove();
  current = undefined;
}
