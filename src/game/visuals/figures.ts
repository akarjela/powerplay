import Phaser from "phaser";

import { BALL_RADIUS, BAT_LENGTH, BAT_WIDTH, GLOVE_LOCAL_X, GROUND_Y, STUMP_HEIGHT } from "../config";
import { Camera } from "../view/camera";
import type { Projected } from "../view/camera";

export interface Kit {
  primary: number;
  secondary: number;
}

export interface Look {
  skin: number;
  hair: number;
  beard: "none" | "stubble" | "full";
  glasses: boolean;

  build: number;
}

const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc98e5a, 0xa9703f, 0x8a5a2b, 0x6b4423];
const HAIRS = [0x1a1210, 0x2b1d14, 0x3d2a1a, 0x0f0f12, 0x4a3324];
const PAD = 0xf7f9fb;
const BOOT = 0x1c2534;
const SOLE = 0xd9d9d9;

function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function lookFor(id: string): Look {
  const h = hashOf(id);
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >>> 4) % HAIRS.length],
    beard: (["none", "stubble", "full", "stubble"] as const)[(h >>> 8) % 4],
    glasses: ((h >>> 12) % 5) === 0,
    build: 0.92 + ((h >>> 16) % 5) * 0.045,
  };
}

const darken = (colour: number, by: number) => {
  const c = Phaser.Display.Color.ValueToColor(colour);
  return Phaser.Display.Color.GetColor(c.red * (1 - by), c.green * (1 - by), c.blue * (1 - by));
};
const lighten = (colour: number, by: number) => {
  const c = Phaser.Display.Color.ValueToColor(colour);
  return Phaser.Display.Color.GetColor(
    c.red + (255 - c.red) * by, c.green + (255 - c.green) * by, c.blue + (255 - c.blue) * by,
  );
};

type G = Phaser.GameObjects.Graphics;
const pt = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

export function softShadow(g: G, x: number, y: number, w: number, h: number, peak = 0.42): void {
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const t = 1 - i / layers;
    g.fillStyle(0x03140a, (peak / layers) * (1 + i * 0.35)).fillEllipse(x, y, w * t, h * t);
  }
}

function drawFaceFront(g: G, x: number, y: number, r: number, look: Look): void {
  const skinShade = darken(look.skin, 0.22);

  g.fillStyle(look.skin).fillCircle(x - r * 0.95, y + r * 0.05, r * 0.28).fillCircle(x + r * 0.95, y + r * 0.05, r * 0.28);

  g.fillStyle(look.skin).fillEllipse(x, y, r * 2, r * 2.25);
  g.fillStyle(skinShade, 0.35).fillEllipse(x + r * 0.45, y + r * 0.2, r * 0.9, r * 1.6);

  g.fillStyle(look.hair).fillEllipse(x, y - r * 0.55, r * 2.05, r * 1.35);
  g.fillStyle(look.skin).fillEllipse(x, y + r * 0.05, r * 1.9, r * 1.55);
  g.fillStyle(look.hair).fillRect(x - r * 1.0, y - r * 0.4, r * 0.28, r * 0.75).fillRect(x + r * 0.72, y - r * 0.4, r * 0.28, r * 0.75);

  if (look.beard !== "none") {
    g.fillStyle(look.hair, look.beard === "full" ? 0.85 : 0.35);
    g.fillEllipse(x, y + r * 0.7, r * 1.75, r * 1.0);
    g.fillStyle(look.skin).fillEllipse(x, y + r * 0.45, r * 0.75, r * 0.45);
  }

  g.lineStyle(r * 0.16, look.hair, 0.9);
  g.lineBetween(x - r * 0.62, y - r * 0.32, x - r * 0.18, y - r * 0.36);
  g.lineBetween(x + r * 0.18, y - r * 0.36, x + r * 0.62, y - r * 0.32);
  if (look.glasses) {
    g.lineStyle(r * 0.1, 0x111827, 0.9);
    g.strokeEllipse(x - r * 0.4, y - r * 0.1, r * 0.55, r * 0.42);
    g.strokeEllipse(x + r * 0.4, y - r * 0.1, r * 0.55, r * 0.42);
    g.fillStyle(0x0f172a, 0.75).fillEllipse(x - r * 0.4, y - r * 0.1, r * 0.55, r * 0.42).fillEllipse(x + r * 0.4, y - r * 0.1, r * 0.55, r * 0.42);
  } else {
    g.fillStyle(0xffffff).fillEllipse(x - r * 0.38, y - r * 0.1, r * 0.42, r * 0.26).fillEllipse(x + r * 0.38, y - r * 0.1, r * 0.42, r * 0.26);
    g.fillStyle(0x1f1410).fillCircle(x - r * 0.36, y - r * 0.09, r * 0.11).fillCircle(x + r * 0.4, y - r * 0.09, r * 0.11);
  }
  g.lineStyle(r * 0.12, skinShade, 0.8);
  g.lineBetween(x + r * 0.02, y - r * 0.05, x + r * 0.12, y + r * 0.28);
  g.lineBetween(x + r * 0.12, y + r * 0.28, x - r * 0.05, y + r * 0.3);
  g.lineStyle(r * 0.13, darken(look.skin, 0.5), 0.85);
  g.lineBetween(x - r * 0.3, y + r * 0.62, x + r * 0.3, y + r * 0.62);
}

function drawFaceProfile(g: G, x: number, y: number, r: number, look: Look): void {
  const skinShade = darken(look.skin, 0.22);
  g.fillStyle(look.skin).fillEllipse(x, y, r * 2, r * 2.2);

  g.fillStyle(look.skin).fillTriangle(x + r * 0.75, y - r * 0.05, x + r * 1.25, y + r * 0.3, x + r * 0.7, y + r * 0.42);
  g.fillStyle(look.skin).fillEllipse(x + r * 0.45, y + r * 0.78, r * 1.1, r * 0.8);

  g.fillStyle(look.hair).fillEllipse(x - r * 0.25, y - r * 0.5, r * 1.7, r * 1.35);
  g.fillStyle(look.skin).fillEllipse(x + r * 0.2, y + r * 0.05, r * 1.55, r * 1.55);
  g.fillStyle(look.hair).fillRect(x - r * 0.95, y - r * 0.5, r * 0.5, r * 1.0);

  g.fillStyle(look.skin).fillEllipse(x - r * 0.35, y + r * 0.05, r * 0.42, r * 0.55);
  g.lineStyle(r * 0.08, skinShade).strokeEllipse(x - r * 0.35, y + r * 0.05, r * 0.28, r * 0.36);
  if (look.beard !== "none") {
    g.fillStyle(look.hair, look.beard === "full" ? 0.85 : 0.35);
    g.fillEllipse(x + r * 0.35, y + r * 0.8, r * 1.4, r * 0.85);
  }

  g.lineStyle(r * 0.16, look.hair, 0.9).lineBetween(x + r * 0.2, y - r * 0.36, x + r * 0.8, y - r * 0.28);
  g.fillStyle(0xffffff).fillEllipse(x + r * 0.5, y - r * 0.1, r * 0.4, r * 0.26);
  g.fillStyle(0x1f1410).fillCircle(x + r * 0.58, y - r * 0.09, r * 0.11);
  g.lineStyle(r * 0.13, darken(look.skin, 0.5), 0.85).lineBetween(x + r * 0.55, y + r * 0.5, x + r * 0.95, y + r * 0.45);
}

const EDGE = 0x0a0f1c;
const TROUSER = 0xf3f4f6;
const TROUSER_SHADE = 0xd4d7dc;
const OUTLINE_ALPHA = 0.35;

function limb(g: G, x0: number, y0: number, w0: number, x1: number, y1: number, w1: number, colour: number, shade?: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [
    pt(x0 + nx * w0 / 2, y0 + ny * w0 / 2),
    pt(x1 + nx * w1 / 2, y1 + ny * w1 / 2),
    pt(x1 - nx * w1 / 2, y1 - ny * w1 / 2),
    pt(x0 - nx * w0 / 2, y0 - ny * w0 / 2),
  ];
  g.fillStyle(colour).fillPoints(pts, true);
  if (shade !== undefined) {
    const mid = pt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    const in0 = pt(pts[0].x - nx * w0 * 0.3, pts[0].y - ny * w0 * 0.3);
    const in1 = pt(pts[1].x - nx * w1 * 0.3, pts[1].y - ny * w1 * 0.3);
    g.fillStyle(shade, 0.55).fillPoints([pts[0], mid, pts[1], in1, in0], true);
  }
  g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokePoints(pts, true, true);
}

function boot(g: G, x: number, y: number, dir: number, kit: Kit, w = 14): void {
  const lead = dir === 0 ? 0 : dir * w * 0.25;
  g.fillStyle(SOLE).fillRoundedRect(x - w / 2 + lead * 0.4, y - 2.5, w, 2.5, 1);
  g.fillStyle(BOOT).fillRoundedRect(x - w / 2 + lead * 0.4, y - 7.5, w, 5.5, { tl: 2.5, tr: 2.5, bl: 1, br: 1 });
  g.fillStyle(kit.secondary, 0.9).fillRect(x - w / 2 + 3 + lead * 0.4, y - 6.5, w - 6, 1.6);
  g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokeRoundedRect(x - w / 2 + lead * 0.4, y - 7.5, w, 7.5, 2);
}

function torso(g: G, hipX: number, hipY: number, hipW: number, shoulderY: number, shoulderW: number, lean: number, kit: Kit, side: boolean): void {
  const shade = darken(kit.primary, 0.32);
  const pts = [
    pt(hipX - hipW / 2, hipY),
    pt(hipX + hipW / 2, hipY),
    pt(hipX + lean + shoulderW / 2, shoulderY),
    pt(hipX + lean - shoulderW / 2, shoulderY),
  ];
  g.fillStyle(kit.primary).fillPoints(pts, true);

  if (side) {
    g.fillStyle(shade, 0.85).fillPoints([pts[0], pt(hipX - hipW * 0.15, hipY), pt(hipX + lean - shoulderW * 0.15, shoulderY), pts[3]], true);
    g.fillStyle(lighten(kit.primary, 0.2), 0.45).fillPoints([pt(hipX + hipW * 0.2, hipY - 4), pt(hipX + hipW * 0.45, hipY - 4), pt(hipX + lean + shoulderW * 0.4, shoulderY + 6), pt(hipX + lean + shoulderW * 0.15, shoulderY + 6)], true);
  } else {
    g.fillStyle(shade, 0.7).fillPoints([pts[0], pt(hipX - hipW * 0.28, hipY), pt(hipX + lean - shoulderW * 0.3, shoulderY), pts[3]], true);
  }

  const t0 = 0.42;
  const t1 = 0.56;
  const at = (t: number, k: number) => (pt(hipX + (lean) * t + (k - 0.5) * (hipW + (shoulderW - hipW) * t), hipY + (shoulderY - hipY) * t));
  g.fillStyle(kit.secondary, 0.95).fillPoints([at(t0, 0.05), at(t0, 0.32), at(t1 + 0.34, 0.95), at(t1 + 0.34, 0.68)], true);

  g.fillStyle(0xffffff, 0.85).fillRect(hipX + lean * 0.75 - 6, shoulderY + 9, 12, 5);

  g.fillStyle(kit.secondary).fillTriangle(hipX + lean - 5, shoulderY, hipX + lean + 5, shoulderY, hipX + lean, shoulderY + 5);
  g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokePoints(pts, true, true);
}

function drawHelmet(g: G, x: number, y: number, r: number, kit: Kit): void {
  const shell = darken(kit.primary, 0.12);
  g.fillStyle(shell).fillEllipse(x - r * 0.05, y - r * 0.3, r * 2.4, r * 2.0);
  g.fillStyle(lighten(shell, 0.3), 0.45).fillEllipse(x - r * 0.45, y - r * 0.8, r * 0.9, r * 0.45);
  g.fillStyle(kit.secondary, 0.95).fillRect(x - r * 1.2, y - r * 0.5, r * 2.4, r * 0.2);

  g.fillStyle(shell).fillPoints([pt(x + r * 0.2, y - r * 0.3), pt(x + r * 1.55, y - r * 0.25), pt(x + r * 1.5, y - r * 0.05), pt(x + r * 0.2, y - r * 0.05)], true);

  g.lineStyle(r * 0.11, 0xd7dde8, 0.95);
  for (let i = 0; i < 3; i++) {
    const yy = y + r * (0.05 + i * 0.3);
    g.lineBetween(x + r * 0.5, yy, x + r * 1.35 - i * r * 0.06, yy + r * 0.04);
  }
  g.lineBetween(x + r * 1.3, y - r * 0.05, x + r * 1.15, y + r * 0.95);
  g.lineStyle(r * 0.1, 0x334155, 0.9).lineBetween(x - r * 0.6, y + r * 0.6, x + r * 0.6, y + r * 1.25);
  g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokeEllipse(x - r * 0.05, y - r * 0.3, r * 2.4, r * 2.0);
}

function drawCap(g: G, x: number, y: number, r: number, kit: Kit): void {
  const crown = darken(kit.primary, 0.1);
  g.fillStyle(crown).fillEllipse(x, y - r * 0.6, r * 2.15, r * 1.3);
  g.fillStyle(crown).fillRect(x - r * 1.07, y - r * 0.6, r * 2.15, r * 0.36);
  g.fillStyle(darken(kit.primary, 0.32)).fillEllipse(x, y - r * 0.26, r * 2.4, r * 0.4);
  g.fillStyle(kit.secondary).fillRect(x - r * 0.18, y - r * 1.02, r * 0.36, r * 0.36);
  g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokeEllipse(x, y - r * 0.6, r * 2.15, r * 1.3);
}

function drawShades(g: G, x: number, y: number, r: number): void {
  g.fillStyle(0x0b0f1a, 0.92).fillRoundedRect(x - r * 0.72, y - r * 0.28, r * 0.62, r * 0.36, r * 0.1).fillRoundedRect(x + r * 0.1, y - r * 0.28, r * 0.62, r * 0.36, r * 0.1);
  g.lineStyle(r * 0.08, 0x0b0f1a).lineBetween(x - r * 0.1, y - r * 0.18, x + r * 0.1, y - r * 0.18);
}

export function drawBatsman(scene: Phaser.Scene, handsLocalY: number, kit: Kit, look: Look): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const b = look.build;

  softShadow(g, 2, 1, 56, 10);

  limb(g, -6 * b, -56, 13 * b, -13 * b, -6, 11 * b, TROUSER, TROUSER_SHADE);
  limb(g, 5 * b, -56, 13 * b, 13 * b, -6, 11 * b, TROUSER);
  for (const [px, top, h, w] of [[-13 * b, -46, 40, 11 * b], [13 * b, -44, 38, 11 * b]] as const) {
    g.fillStyle(PAD).fillRoundedRect(px - w / 2, top, w, h, 3);
    g.fillStyle(0xe5e7eb).fillRoundedRect(px - w / 2, top, w, 7, { tl: 3, tr: 3, bl: 0, br: 0 });
    g.lineStyle(1.1, 0xb8c0cc, 0.9);
    for (const sy of [top + 11, top + 21, top + 31]) g.lineBetween(px - w / 2 - 1, sy, px + w / 2 + 1, sy);
    g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokeRoundedRect(px - w / 2, top, w, h, 3);
  }
  boot(g, -13 * b, 0, 1, kit);
  boot(g, 13 * b, 0, 1, kit);

  g.fillStyle(0xe8ebef).fillEllipse(8 * b, -50, 14 * b, 10);
  torso(g, 0, -56, 20 * b, -90, 26 * b, 5, kit, true);

  const hx = 7;
  const hy = -99;
  drawFaceProfile(g, hx, hy, 7.5, look);
  drawHelmet(g, hx, hy, 7.5, kit);

  const gx = GLOVE_LOCAL_X;
  limb(g, 1, -84, 8, gx - 3, handsLocalY - 4, 6, kit.primary, darken(kit.primary, 0.32));
  g.fillStyle(0xe5e7eb).fillRoundedRect(gx - 4, -72, 7, 11, 3);
  limb(g, 9, -84, 8, gx + 1, handsLocalY - 6, 6, kit.primary);
  limb(g, gx - 1, handsLocalY - 8, 5, gx, handsLocalY - 1, 4.5, look.skin);

  g.fillStyle(0xf1f5f9).fillRoundedRect(gx - 6, handsLocalY - 4, 12, 9, 4).fillRoundedRect(gx - 4.5, handsLocalY - 11, 11, 8, 4);
  for (let i = 0; i < 3; i++) g.fillStyle(0xdbe1ea).fillRoundedRect(gx - 2 + i * 2.6, handsLocalY - 2 + i * 1.4, 2.2, 6, 1);
  g.fillStyle(kit.secondary, 0.9).fillRect(gx - 6, handsLocalY - 13, 12, 2.2);
  g.fillStyle(kit.primary, 0.9).fillCircle(gx - 0.5, handsLocalY - 7, 1.8);
  g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokeRoundedRect(gx - 6, handsLocalY - 11, 12.5, 16, 4);

  c.add(g);
  return c;
}

export function drawFielder(scene: Phaser.Scene, kit: Kit, look: Look): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const trousers = darken(kit.primary, 0.48);
  const b = look.build;

  softShadow(g, 0, 1, 44, 9);

  limb(g, -6 * b, -54, 11 * b, -12 * b, -28, 9 * b, trousers, darken(trousers, 0.3));
  limb(g, -12 * b, -28, 9 * b, -11 * b, -6, 8 * b, trousers, darken(trousers, 0.3));
  limb(g, 6 * b, -54, 11 * b, 12 * b, -28, 9 * b, trousers);
  limb(g, 12 * b, -28, 9 * b, 11 * b, -6, 8 * b, trousers);
  g.fillStyle(0xe5e7eb).fillRect(-14 * b, -8, 7 * b, 2.5).fillRect(7.5 * b, -8, 7 * b, 2.5);
  boot(g, -11 * b, 0, 0, kit, 12);
  boot(g, 11 * b, 0, 0, kit, 12);
  g.fillStyle(0x111827).fillRect(-10 * b, -56, 20 * b, 2.5);

  torso(g, 0, -56, 19 * b, -88, 27 * b, 0, kit, false);

  limb(g, -12 * b, -84, 7, -16 * b, -60, 6, kit.primary, darken(kit.primary, 0.32));
  limb(g, -16 * b, -60, 5, -13 * b, -34, 4.5, look.skin);
  limb(g, 12 * b, -84, 7, 16 * b, -60, 6, kit.primary);
  limb(g, 16 * b, -60, 5, 13 * b, -34, 4.5, look.skin);
  g.fillStyle(look.skin).fillCircle(-13 * b, -32, 3).fillCircle(13 * b, -32, 3);

  g.fillStyle(darken(look.skin, 0.15)).fillRect(-3, -95, 6, 8);
  drawFaceFront(g, 0, -98, 7.5, look);
  if (look.glasses) drawShades(g, 0, -98, 7.5);
  drawCap(g, 0, -98, 7.5, kit);

  c.add(g);
  return c;
}

export function drawKeeper(scene: Phaser.Scene, kit: Kit, look: Look): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const trousers = darken(kit.primary, 0.48);
  const b = look.build;

  softShadow(g, 0, 1, 46, 9);

  limb(g, -4 * b, -30, 11 * b, -15 * b, -26, 10 * b, trousers, darken(trousers, 0.3));
  limb(g, -15 * b, -26, 9 * b, -14 * b, -6, 8 * b, trousers, darken(trousers, 0.3));
  limb(g, 4 * b, -30, 11 * b, 15 * b, -26, 10 * b, trousers);
  limb(g, 15 * b, -26, 9 * b, 14 * b, -6, 8 * b, trousers);

  for (const px of [-14 * b, 14 * b]) {
    g.fillStyle(PAD).fillRoundedRect(px - 4 * b, -24, 8 * b, 18, 3);
    g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokeRoundedRect(px - 4 * b, -24, 8 * b, 18, 3);
  }
  boot(g, -14 * b, 0, 0, kit, 12);
  boot(g, 14 * b, 0, 0, kit, 12);

  torso(g, 0, -34, 18 * b, -60, 26 * b, 0, kit, false);

  limb(g, -10 * b, -56, 7, -6 * b, -34, 5.5, kit.primary, darken(kit.primary, 0.32));
  limb(g, 10 * b, -56, 7, 6 * b, -34, 5.5, kit.primary);
  g.fillStyle(0xf1f5f9).fillRoundedRect(-10, -36, 9, 12, 3.5).fillRoundedRect(1, -36, 9, 12, 3.5);
  g.fillStyle(0xdbe1ea);
  for (const x of [-9, -6, -3, 2, 5, 8]) g.fillRoundedRect(x, -41, 2.2, 6, 1);
  g.fillStyle(kit.secondary, 0.9).fillRect(-10, -26, 20, 2);
  g.lineStyle(1, EDGE, OUTLINE_ALPHA).strokeRoundedRect(-10, -36, 20, 12, 3.5);

  g.fillStyle(darken(look.skin, 0.15)).fillRect(-3, -67, 6, 8);
  drawFaceFront(g, 0, -70, 7.5, look);
  drawCap(g, 0, -70, 7.5, kit);

  c.add(g);
  return c;
}

export function drawStumps(
  scene: Phaser.Scene,
  camera: Camera,
  physicsX: number,
  depth: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  const base = camera.project(Camera.fromPhysics(physicsX, GROUND_Y));
  if (!base) return g;
  const s = base.scale;
  const height = STUMP_HEIGHT * s;
  softShadow(g, base.sx, base.sy + 1, 26 * s, 5 * s, 0.3);
  for (let i = -1; i <= 1; i++) {
    const x = base.sx + i * 5.2 * s - 2 * s;
    g.fillStyle(0xfaf5e4).fillRoundedRect(x, base.sy - height, 4 * s, height, 1.4 * s);
    g.fillStyle(0xd9cfb4).fillRect(x + 2.6 * s, base.sy - height, 1.2 * s, height);
    g.lineStyle(Math.max(0.6, 0.9 * s), EDGE, 0.55).strokeRoundedRect(x, base.sy - height, 4 * s, height, 1.4 * s);
  }
  g.fillStyle(0xe6b654);
  g.fillRoundedRect(base.sx - 7 * s, base.sy - height - 3.2 * s, 6 * s, 2.8 * s, 1);
  g.fillRoundedRect(base.sx + 1 * s, base.sy - height - 3.2 * s, 6 * s, 2.8 * s, 1);
  g.lineStyle(Math.max(0.6, 0.8 * s), EDGE, 0.5).strokeRoundedRect(base.sx - 7 * s, base.sy - height - 3.2 * s, 14 * s, 2.8 * s, 1);
  return g;
}

export function makeBat(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const half = BAT_LENGTH / 2;

  g.fillStyle(0x2f2a24).fillRoundedRect(-3, -half, 6, 18, 3);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0x1b1814).fillRect(-3, -half + 3 + i * 4, 6, 1.5);
  }

  g.fillStyle(0xd9c391).fillTriangle(-3, -half + 17, 3, -half + 17, 0, -half + 26);

  g.fillStyle(0xe3cd9a).fillRoundedRect(-BAT_WIDTH / 2, -half + 17, BAT_WIDTH, half * 2 - 17, 3);
  g.fillStyle(0xf0e0b8, 0.7).fillRect(-BAT_WIDTH / 2 + 1.5, -half + 20, 2.5, half * 2 - 24);
  g.fillStyle(0xc9b07a, 0.6).fillRect(BAT_WIDTH / 2 - 3, -half + 20, 1.5, half * 2 - 24);
  g.lineStyle(1, 0xbfa678).strokeRoundedRect(-BAT_WIDTH / 2, -half + 17, BAT_WIDTH, half * 2 - 17, 3);

  g.fillStyle(0xdc2626, 0.85).fillRect(-BAT_WIDTH / 2 + 2, -half + 26, BAT_WIDTH - 4, 6);
  g.fillStyle(0xffffff, 0.8).fillRect(-BAT_WIDTH / 2 + 3, -half + 28, BAT_WIDTH - 6, 1.5);

  c.add(g);
  return c;
}

export class BallSprite {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly history: { x: number; y: number; w: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.trail = scene.add.graphics().setDepth(499);
    this.shadow = scene.add.ellipse(0, 0, 18, 5, 0x0a1f12, 0.45).setDepth(-20).setVisible(false);

    this.gfx = scene.add.graphics().setDepth(503);
    this.gfx.fillStyle(0xc0392b).fillCircle(0, 0, BALL_RADIUS);
    this.gfx.fillStyle(0x8e2a20).fillCircle(-1.5, 1.5, BALL_RADIUS - 2);
    this.gfx.fillStyle(0xe06b5c, 0.6).fillCircle(-2, -2, 2);
    this.gfx.lineStyle(1.4, 0xf3f4f6).beginPath();
    this.gfx.arc(0, 0, BALL_RADIUS - 1, -0.9, 0.9);
    this.gfx.strokePath();
    this.gfx.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.gfx.setVisible(visible);
    this.shadow.setVisible(visible);
    if (!visible) {
      this.history.length = 0;
      this.trail.clear();
    }
  }

  setGhost(ghost: boolean): void {
    this.gfx.setAlpha(ghost ? 0.45 : 1);
  }

  setDepth(depth: number): void {
    this.gfx.setDepth(depth + 3);
    this.trail.setDepth(depth + 2);
  }

  update(ball: Projected, shadow: Projected, heightPx: number, hot = false): void {
    this.gfx.setPosition(ball.sx, ball.sy).setScale(ball.scale);

    const fade = Phaser.Math.Clamp(1 - heightPx / 420, 0.25, 1);
    this.shadow.setPosition(shadow.sx, shadow.sy + 2 * shadow.scale)
      .setScale(shadow.scale * fade, shadow.scale * fade * 0.8)
      .setAlpha(0.45 * fade);

    this.history.push({ x: ball.sx, y: ball.sy, w: ball.scale });
    const keep = hot ? 24 : 14;
    while (this.history.length > keep) this.history.shift();

    this.trail.clear();
    for (let i = 1; i < this.history.length; i++) {
      const t = i / this.history.length;
      this.trail.lineStyle(BALL_RADIUS * (hot ? 1.3 : 0.9) * t * this.history[i].w, hot ? 0xfff1e6 : 0xef8a7d, t * (hot ? 0.7 : 0.4));
      this.trail.lineBetween(
        this.history[i - 1].x, this.history[i - 1].y,
        this.history[i].x, this.history[i].y,
      );
    }
  }
}
