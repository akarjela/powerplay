import type { Delivery } from "./delivery";
import { IDEAL_FOOT, playedTheRightFoot } from "./shot";
import type { Commitment, Footwork, Shot } from "./shot";
import type { Outcome } from "./types";

export interface Play {
  stance: "front" | "back" | "neutral";

  effort: number;
}

export const DEFEND_BELOW = 0.30;
export const ATTACK_FROM = 0.72;

export function footworkOf(stance: Play["stance"]): Footwork {
  return stance === "front" ? "front" : "back";
}

export function commitmentOf(effort: number): Commitment {
  if (effort < DEFEND_BELOW) return "defend";
  if (effort < ATTACK_FROM) return "rotate";
  return "attack";
}

export function shotFromPlay(play: Play): Shot {
  return { footwork: footworkOf(play.stance), commitment: commitmentOf(play.effort) };
}

export function bridge(outcome: Outcome, delivery: Delivery, play: Play): Outcome {
  if (outcome.extra === "wide" || outcome.extra === "no-ball") return outcome;
  const shot = shotFromPlay(play);
  if (!outcome.wicket) return { ...outcome, shot };
  return { ...outcome, shot, description: `${outcome.description} ${readOf(shot, delivery)}` };
}

export function readOf(shot: Shot, delivery: Delivery): string {
  const foot = shot.footwork === "front" ? "Front" : "Back";
  if (playedTheRightFoot(shot.footwork, delivery.length)) return `${foot} foot, the right read; beaten anyway.`;
  const article = delivery.length === "yorker" ? "a yorker" : `a ${delivery.length} ball`;
  return `${foot} foot to ${article}; it wanted the ${IDEAL_FOOT[delivery.length]}.`;
}
