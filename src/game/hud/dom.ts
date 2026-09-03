/**
 * The DOM layer under #hud. The scoreboard, the cards and the moments are
 * HTML over the canvas rather than Phaser text: real type at any viewport,
 * layout in CSS, and `prefers-reduced-motion` for free. Phaser draws the
 * world; this draws what a broadcast would put over it.
 */

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

/** The player asked for less motion; the scene's shakes and pushes honour it too. */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
