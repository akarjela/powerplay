import { el, hex, hudRoot } from "./dom";

/** The toss card and the result card: a panel on a scrim, over the ground. */
export interface CardSpec {
  title: string;
  lines: { text: string; strong?: boolean }[];
  prompt: string;
  colours: { primary: number; secondary: number };
  tone?: "won" | "lost" | "neutral";
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
  card.append(el("div", "prompt", spec.prompt));
  scrim.append(card);
  // The scrim takes the pointer so the click lands here, not on the canvas.
  scrim.style.pointerEvents = "auto";
  scrim.style.cursor = "pointer";
  scrim.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  hudRoot().appendChild(scrim);
  current = scrim;
  requestAnimationFrame(() => scrim.classList.add("is-on"));
}

export function hideCard(): void {
  current?.remove();
  current = undefined;
}
