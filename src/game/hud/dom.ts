import type { BallMark } from "../humanInnings";

export function hudRoot(): HTMLElement {
  let root = document.getElementById("hud");
  if (!root) {
    root = document.createElement("div");
    root.id = "hud";
    document.body.appendChild(root);
  }
  return root;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(
  className: string | undefined,
  label: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

export const hex = (colour: number) => `#${colour.toString(16).padStart(6, "0")}`;

export const fmt2 = (n: number) => n.toFixed(2);

export const surname = (name: string) => name.split(" ").pop() ?? name;

export function ballChip(mark: BallMark): HTMLSpanElement {
  const kind = mark.kind === "boundary" && mark.label === "6" ? "six" : mark.kind;
  return el("span", `ball ${kind}`, mark.label);
}

export function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function onColour(colour: number): string {
  const r = (colour >> 16) & 255;
  const g = (colour >> 8) & 255;
  const b = colour & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 150 ? "#0b0f1a" : "#ffffff";
}

export function teamTint(node: HTMLElement, colours: { primary: number; secondary: number }): void {
  node.style.setProperty("--flag-primary", hex(colours.primary));
  node.style.setProperty("--flag-secondary", hex(colours.secondary));
  node.style.setProperty("--on-team", onColour(colours.primary));
}

export function trophyMark(className = "trophy"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 140");
  svg.setAttribute("class", className);
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
