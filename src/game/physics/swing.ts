import {
  MAX_SWING_SPEED, STANCE_OFFSET, STANCE_RESPONSE, SWING_RESPONSE, SWING_SMOOTHING,
} from "../config";
import type { Stance } from "../config";

export interface Point {
  x: number;
  y: number;
}

export function settlePivot(pivot: Point, home: Point, stance: Stance): Point {
  const offset = STANCE_OFFSET[stance];
  pivot.x += (home.x + offset.x - pivot.x) * STANCE_RESPONSE;
  pivot.y += (home.y + offset.y - pivot.y) * STANCE_RESPONSE;
  return pivot;
}

export function swingTarget(pointer: Point, pivot: Point): number {
  return Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) - Math.PI / 2;
}

export function nextAngularVelocity(angle: number, angularVelocity: number, target: number, speed = 1): number {
  let error = target - angle;
  while (error > Math.PI) error -= Math.PI * 2;
  while (error < -Math.PI) error += Math.PI * 2;

  const cap = MAX_SWING_SPEED * speed;
  const wanted = Math.max(-cap, Math.min(cap, error * SWING_RESPONSE * speed));
  return angularVelocity + (wanted - angularVelocity) * SWING_SMOOTHING;
}

export function swingEffort(angularVelocity: number, speed = 1): number {
  return Math.min(1, Math.abs(angularVelocity) / (MAX_SWING_SPEED * speed));
}

export function contactDamping(angularVelocityAtContact: number, power = 0.5, speed = 1): number {
  const effort = swingEffort(angularVelocityAtContact, speed);
  return (0.55 + 0.45 * effort) * powerFactor(power);
}

export function powerFactor(power: number): number {
  return 0.85 + 0.3 * Math.max(0, Math.min(1, power));
}

export function batSpeedFactor(technique: number): number {
  const t = Math.max(0, Math.min(1, technique));
  return t < 0.5 ? 0.7 + 0.6 * t : 0.9 + 0.2 * t;
}
