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

export const hex = (colour: number) => `#${colour.toString(16).padStart(6, "0")}`;

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
