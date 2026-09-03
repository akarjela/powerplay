import type { BallMark } from "../humanInnings";
import { el, hudRoot } from "./dom";

/**
 * Full-screen typographic moments: FOUR, SIX, WICKET, a fifty or a hundred,
 * and the end of an over. Not toasts. Each has its own timing and personality
 * in hud.css; this only builds the markup and removes it when the animation
 * ends. Spec: design-system/cricketgame/pages/moments.md.
 *
 * Never two at once: a new moment replaces whatever is up.
 */

export type Moment =
  | { kind: "four" }
  | { kind: "six" }
  | { kind: "wicket"; how: string }
  | { kind: "milestone"; runs: 50 | 100; batter: string; balls: number }
  | { kind: "over"; number: number; balls: readonly BallMark[]; runs: number };

const DURATION: Record<Moment["kind"], number> = { four: 900, six: 1150, wicket: 1250, milestone: 1300, over: 1480 };

let current: HTMLElement | undefined;
let timer: number | undefined;

export function showMoment(m: Moment): void {
  clearMoment();
  const node = el("div", `moment ${m.kind === "over" ? "over-end" : m.kind}`);
  node.style.setProperty("--rm-duration", `${DURATION[m.kind]}ms`);

  switch (m.kind) {
    case "four":
      node.append(el("div", "band"), el("div", "word", "FOUR"));
      break;
    case "six":
      node.append(el("div", "flash"), el("div", "ring"), el("div", "word", "SIX"));
      break;
    case "wicket": {
      const wrap = el("div");
      wrap.append(el("div", "word", "WICKET"), el("div", "sub", m.how));
      node.append(el("div", "bar"), wrap);
      break;
    }
    case "milestone": {
      const wrap = el("div");
      const word = el("div", "word", String(m.runs - 3));
      wrap.append(word, el("div", "sub", `${m.batter} · ${m.balls} balls`));
      node.append(el("div", "rule"), wrap);
      countUp(word, m.runs - 3, m.runs, 300);
      break;
    }
    case "over": {
      const panel = el("div", "panel");
      const balls = el("div", "balls");
      for (const b of m.balls) {
        const kind = b.kind === "boundary" && b.label === "6" ? "six" : b.kind;
        balls.append(el("span", `ball ${kind}`, b.label));
      }
      panel.append(el("span", "head", `End of over ${m.number}`), balls, el("span", "runs", `${m.runs} run${m.runs === 1 ? "" : "s"}`));
      node.append(panel);
      break;
    }
  }

  hudRoot().appendChild(node);
  current = node;
  timer = window.setTimeout(clearMoment, DURATION[m.kind] + 60);
}

export function clearMoment(): void {
  window.clearTimeout(timer);
  current?.remove();
  current = undefined;
}

function countUp(node: HTMLElement, from: number, to: number, ms: number): void {
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    node.textContent = String(Math.round(from + (to - from) * t));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
