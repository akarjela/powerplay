import Phaser from "phaser";

import { BALL_RADIUS, BAT_LENGTH, BAT_WIDTH, STUMP_HEIGHT } from "../config";
import type { Camera, Projected } from "../view/camera";

/**
 * The people, the stumps, the bat and the ball. Vector-drawn in world pixels
 * -- the same ~4x exaggeration the bat and ball use, so a player reads as
 * roughly 1.8m against a bat of 0.97m -- inside containers the scene places
 * and scales by projection. A figure never knows where it is on screen.
 *
 * Everyone has a face, a build and a kit. Skin, hair, beard and glasses are
 * dealt from a player's id so the same man looks the same every match, and
 * two fielders side by side do not look like the same drawing twice. The
 * batter wears the batting franchise's colours, the fielders the bowling
 * franchise's. There are no labels; the call names the fielder.
 */

export interface Kit {
  primary: number;
  secondary: number;
}

/** What a player looks like, apart from the kit. */
export interface Look {
  skin: number;
  hair: number;
  beard: "none" | "stubble" | "full";
  glasses: boolean;
  /** 0.9 slight, 1.1 broad. */
  build: number;
}

const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc98e5a, 0xa9703f, 0x8a5a2b, 0x6b4423];
const HAIRS = [0x1a1210, 0x2b1d14, 0x3d2a1a, 0x0f0f12, 0x4a3324];
const PAD = 0xf7f9fb;
const BOOT = 0x1c2534;
const SOLE = 0xd9d9d9;

/** A stable, cheap hash so a player id always deals the same look. */
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

/**
 * A head seen from the front: face, ears, hair, eyes under brows, a nose, a
 * mouth, maybe a beard, maybe glasses. Radius ~9 world px.
 */
function drawFaceFront(g: G, x: number, y: number, r: number, look: Look): void {
  const skinShade = darken(look.skin, 0.22);
  // Ears, behind the face.
  g.fillStyle(look.skin).fillCircle(x - r * 0.95, y + r * 0.05, r * 0.28).fillCircle(x + r * 0.95, y + r * 0.05, r * 0.28);
  // Face: a little longer than round, with a jaw.
  g.fillStyle(look.skin).fillEllipse(x, y, r * 2, r * 2.25);
  g.fillStyle(skinShade, 0.35).fillEllipse(x + r * 0.45, y + r * 0.2, r * 0.9, r * 1.6);
  // Hair: a cap of it above the brow line, with sideburns.
  g.fillStyle(look.hair).fillEllipse(x, y - r * 0.55, r * 2.05, r * 1.35);
  g.fillStyle(look.skin).fillEllipse(x, y + r * 0.05, r * 1.9, r * 1.55);
  g.fillStyle(look.hair).fillRect(x - r * 1.0, y - r * 0.4, r * 0.28, r * 0.75).fillRect(x + r * 0.72, y - r * 0.4, r * 0.28, r * 0.75);
  // Beard.
  if (look.beard !== "none") {
    g.fillStyle(look.hair, look.beard === "full" ? 0.85 : 0.35);
    g.fillEllipse(x, y + r * 0.7, r * 1.75, r * 1.0);
    g.fillStyle(look.skin).fillEllipse(x, y + r * 0.45, r * 0.75, r * 0.45);
  }
  // Brows, eyes, nose, mouth.
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

/** A head in profile, facing right: the batter's. */
function drawFaceProfile(g: G, x: number, y: number, r: number, look: Look): void {
  const skinShade = darken(look.skin, 0.22);
  g.fillStyle(look.skin).fillEllipse(x, y, r * 2, r * 2.2);
  // Nose and chin push forward.
  g.fillStyle(look.skin).fillTriangle(x + r * 0.75, y - r * 0.05, x + r * 1.25, y + r * 0.3, x + r * 0.7, y + r * 0.42);
  g.fillStyle(look.skin).fillEllipse(x + r * 0.45, y + r * 0.78, r * 1.1, r * 0.8);
  // Hair at the back and top.
  g.fillStyle(look.hair).fillEllipse(x - r * 0.25, y - r * 0.5, r * 1.7, r * 1.35);
  g.fillStyle(look.skin).fillEllipse(x + r * 0.2, y + r * 0.05, r * 1.55, r * 1.55);
  g.fillStyle(look.hair).fillRect(x - r * 0.95, y - r * 0.5, r * 0.5, r * 1.0);
  // Ear, on the near side.
  g.fillStyle(look.skin).fillEllipse(x - r * 0.35, y + r * 0.05, r * 0.42, r * 0.55);
  g.lineStyle(r * 0.08, skinShade).strokeEllipse(x - r * 0.35, y + r * 0.05, r * 0.28, r * 0.36);
  if (look.beard !== "none") {
    g.fillStyle(look.hair, look.beard === "full" ? 0.85 : 0.35);
    g.fillEllipse(x + r * 0.35, y + r * 0.8, r * 1.4, r * 0.85);
  }
  // Brow, eye, mouth.
  g.lineStyle(r * 0.16, look.hair, 0.9).lineBetween(x + r * 0.2, y - r * 0.36, x + r * 0.8, y - r * 0.28);
  g.fillStyle(0xffffff).fillEllipse(x + r * 0.5, y - r * 0.1, r * 0.4, r * 0.26);
  g.fillStyle(0x1f1410).fillCircle(x + r * 0.58, y - r * 0.09, r * 0.11);
  g.lineStyle(r * 0.13, darken(look.skin, 0.5), 0.85).lineBetween(x + r * 0.55, y + r * 0.5, x + r * 0.95, y + r * 0.45);
}

/** A batting helmet over a profile head: dome, peak, grille and strap. */
function drawHelmet(g: G, x: number, y: number, r: number, kit: Kit): void {
  const shell = darken(kit.primary, 0.1);
  g.fillStyle(shell).fillEllipse(x - r * 0.05, y - r * 0.35, r * 2.35, r * 1.9);
  g.fillStyle(lighten(shell, 0.25), 0.5).fillEllipse(x - r * 0.4, y - r * 0.75, r * 0.9, r * 0.5);
  g.fillStyle(kit.secondary, 0.95).fillRect(x - r * 1.15, y - r * 0.55, r * 2.3, r * 0.22);
  // Peak.
  g.fillStyle(shell).fillEllipse(x + r * 0.7, y - r * 0.18, r * 1.3, r * 0.36);
  // Grille: three bars from the peak to the chin.
  g.lineStyle(r * 0.12, 0xcbd5e1, 0.95);
  for (let i = 0; i < 3; i++) {
    const yy = y + r * (0.05 + i * 0.32);
    g.lineBetween(x + r * 0.55, yy, x + r * 1.35 - i * r * 0.08, yy + r * 0.05);
  }
  g.lineBetween(x + r * 1.3, y + r * 0.05, x + r * 1.15, y + r * 0.95);
  // Strap under the chin.
  g.lineStyle(r * 0.1, 0x334155, 0.9).lineBetween(x - r * 0.6, y + r * 0.6, x + r * 0.6, y + r * 1.25);
}

/** A cap over a front-facing head: crown, peak, badge. */
function drawCap(g: G, x: number, y: number, r: number, kit: Kit): void {
  const crown = darken(kit.primary, 0.08);
  g.fillStyle(crown).fillEllipse(x, y - r * 0.62, r * 2.1, r * 1.25);
  g.fillStyle(crown).fillRect(x - r * 1.05, y - r * 0.62, r * 2.1, r * 0.35);
  g.fillStyle(darken(kit.primary, 0.3)).fillEllipse(x, y - r * 0.28, r * 2.3, r * 0.42);
  g.fillStyle(kit.secondary).fillRect(x - r * 0.18, y - r * 1.0, r * 0.36, r * 0.36);
}

/** Helmet without the grille for a fielder close in? No; every fielder wears a cap. */

/**
 * A batsman at the crease, facing the bowler (to the right). Origin at the
 * feet. Pads with straps, gloves with fingers, a thigh guard, an arm guard,
 * a face under a grille.
 */
export function drawBatsman(scene: Phaser.Scene, handsLocalY: number, kit: Kit, look: Look): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const shade = darken(kit.primary, 0.35);
  const b = look.build;

  g.fillStyle(0x0b2413, 0.35).fillEllipse(0, 1, 44, 8);

  // Legs: back leg, front leg stepping toward the ball; trousers show above the pads.
  g.fillStyle(0xe8eaed);
  g.fillRoundedRect(-17 * b, -50, 14 * b, 50, 4);
  g.fillRoundedRect(2 * b, -48, 14 * b, 48, 4);
  g.fillStyle(0xd1d5db, 0.6).fillRoundedRect(-17 * b, -50, 5 * b, 50, 3);
  // Thigh guard under the trousers, a bulge on the front leg.
  g.fillStyle(0xdfe3e8).fillEllipse(9 * b, -46, 15 * b, 12);
  // Pads with three straps and a knee roll.
  for (const [px, top, h] of [[-16 * b, -44, 42], [3 * b, -42, 40]] as const) {
    g.fillStyle(PAD).fillRoundedRect(px, top, 12 * b, h, 4);
    g.fillStyle(0xe2e8f0).fillRoundedRect(px, top, 12 * b, 8, { tl: 4, tr: 4, bl: 0, br: 0 });
    g.lineStyle(1, 0xc8ced6).strokeRoundedRect(px, top, 12 * b, h, 4);
    g.lineStyle(1.2, 0x9ca3af, 0.9);
    for (const sy of [top + 12, top + 22, top + 32]) g.lineBetween(px - 1, sy, px + 12 * b + 1, sy);
  }
  // Boots with spikes' soles.
  g.fillStyle(SOLE).fillRoundedRect(-19 * b, -3, 18 * b, 3, 1);
  g.fillStyle(SOLE).fillRoundedRect(1 * b, -3, 19 * b, 3, 1);
  g.fillStyle(BOOT).fillRoundedRect(-19 * b, -8, 18 * b, 6, 2);
  g.fillStyle(BOOT).fillRoundedRect(1 * b, -8, 19 * b, 6, 2);
  g.fillStyle(kit.secondary, 0.9).fillRect(-14 * b, -7, 6 * b, 1.5).fillRect(6 * b, -7, 6 * b, 1.5);

  // Torso: shirt with a collar, a shaded back, a sash and a sponsor block.
  g.fillStyle(kit.primary).fillRoundedRect(-15 * b, -86, 28 * b, 42, 7);
  g.fillStyle(shade, 0.9).fillRoundedRect(-15 * b, -86, 9 * b, 42, { tl: 7, bl: 7, tr: 0, br: 0 });
  g.fillStyle(lighten(kit.primary, 0.18), 0.5).fillRoundedRect(2 * b, -84, 9 * b, 36, 4);
  g.fillStyle(kit.secondary, 0.95).fillRect(-15 * b, -66, 28 * b, 4);
  g.fillStyle(kit.secondary, 0.95).fillRect(-15 * b, -58, 28 * b, 2);
  g.fillStyle(0xffffff, 0.85).fillRoundedRect(-6 * b, -80, 12 * b, 7, 1.5);
  // Collar.
  g.fillStyle(kit.secondary).fillTriangle(-4 * b, -86, 8 * b, -86, 2 * b, -80);
  g.fillStyle(kit.primary).fillTriangle(-2 * b, -86, 6 * b, -86, 2 * b, -82);

  // Head under a helmet.
  const hx = 1;
  const hy = -95;
  drawFaceProfile(g, hx, hy, 9, look);
  drawHelmet(g, hx, hy, 9, kit);

  // Arms reaching down to the hands: back arm with an arm guard, front arm over it.
  g.lineStyle(7.5, kit.primary);
  g.lineBetween(-3, -78, 5, handsLocalY - 4);
  g.lineStyle(7.5, kit.primary);
  g.lineBetween(9, -78, 9, handsLocalY - 6);
  g.fillStyle(0xe2e8f0).fillRoundedRect(1, -66, 8, 12, 3); // arm guard
  g.lineStyle(5, look.skin);
  g.lineBetween(6, handsLocalY - 7, 9, handsLocalY - 1);
  // Gloves: a mitt with three finger sausages and a wrist band.
  g.fillStyle(0xf1f5f9).fillCircle(10, handsLocalY, 6.5);
  g.fillStyle(0xf1f5f9).fillCircle(11, handsLocalY - 7, 5.5);
  for (let i = 0; i < 3; i++) {
    g.fillStyle(0xe2e8f0).fillRoundedRect(8 + i * 2.6, handsLocalY - 2 + i * 1.5, 2.2, 7, 1);
  }
  g.fillStyle(kit.secondary, 0.85).fillRect(4, handsLocalY - 12, 12, 2.5);
  g.fillStyle(kit.primary, 0.85).fillCircle(9, handsLocalY - 6, 2);

  c.add(g);
  return c;
}

/**
 * A fielder in the bowling side's kit, facing the camera, crouched and ready.
 * Origin at the feet. Cap, sunglasses on some, a face on all.
 */
export function drawFielder(scene: Phaser.Scene, kit: Kit, look: Look): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const shade = darken(kit.primary, 0.35);
  const trousers = darken(kit.primary, 0.5);
  const b = look.build;

  g.fillStyle(0x0b2413, 0.35).fillEllipse(0, 1, 32, 7);

  // Legs, apart, knees a little bent; socks and boots.
  g.fillStyle(trousers).fillRoundedRect(-11 * b, -30, 8 * b, 30, 2.5).fillRoundedRect(3 * b, -30, 8 * b, 30, 2.5);
  g.fillStyle(darken(trousers, 0.3), 0.6).fillRoundedRect(-11 * b, -30, 3 * b, 30, 2).fillRoundedRect(3 * b, -30, 3 * b, 30, 2);
  g.fillStyle(0xe5e7eb).fillRect(-10.5 * b, -7, 7 * b, 3).fillRect(3.5 * b, -7, 7 * b, 3);
  g.fillStyle(SOLE).fillRoundedRect(-12 * b, -1.5, 10 * b, 2, 1).fillRoundedRect(2 * b, -1.5, 10 * b, 2, 1);
  g.fillStyle(BOOT).fillRoundedRect(-12 * b, -5, 10 * b, 4, 1.5).fillRoundedRect(2 * b, -5, 10 * b, 4, 1.5);

  // Shirt: shoulders, a shaded side, a collar, a trim, a sponsor block.
  g.fillStyle(kit.primary).fillRoundedRect(-12 * b, -58, 24 * b, 30, 6);
  g.fillStyle(shade, 0.85).fillRoundedRect(-12 * b, -58, 7 * b, 30, { tl: 6, bl: 6, tr: 0, br: 0 });
  g.fillStyle(lighten(kit.primary, 0.18), 0.45).fillRoundedRect(2 * b, -56, 6 * b, 24, 3);
  g.fillStyle(kit.secondary, 0.95).fillRect(-12 * b, -44, 24 * b, 2.5);
  g.fillStyle(0xffffff, 0.8).fillRoundedRect(-5 * b, -54, 10 * b, 6, 1.5);
  g.fillStyle(kit.secondary).fillTriangle(-4 * b, -58, 4 * b, -58, 0, -53);
  g.fillStyle(look.skin).fillTriangle(-2.5 * b, -58, 2.5 * b, -58, 0, -54.5);
  // Belt.
  g.fillStyle(0x111827).fillRect(-11 * b, -31, 22 * b, 2.5);

  // Arms down to hands on knees.
  g.lineStyle(5, kit.primary);
  g.lineBetween(-10 * b, -52, -16 * b, -38);
  g.lineBetween(10 * b, -52, 16 * b, -38);
  g.lineStyle(4.2, look.skin);
  g.lineBetween(-16 * b, -38, -14 * b, -27);
  g.lineBetween(16 * b, -38, 14 * b, -27);
  g.fillStyle(look.skin).fillCircle(-14 * b, -26, 3).fillCircle(14 * b, -26, 3);

  // Neck, head, cap.
  g.fillStyle(darken(look.skin, 0.15)).fillRect(-3, -64, 6, 7);
  drawFaceFront(g, 0, -67, 8.2, look);
  drawCap(g, 0, -67, 8.2, kit);

  c.add(g);
  return c;
}

/** Stumps at a point along the pitch, projected: three of them with bails, grooved. */
export function drawStumps(
  scene: Phaser.Scene,
  camera: Camera,
  physicsX: number,
  fromPhysics: (x: number, y: number) => { x: number; y: number; z: number },
  groundY: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(500 - 0.5);
  const base = camera.project(fromPhysics(physicsX, groundY));
  if (!base) return g;
  const s = base.scale;
  const height = STUMP_HEIGHT * s;
  g.fillStyle(0x0b2413, 0.3).fillEllipse(base.sx, base.sy + 1, 18 * s, 4 * s);
  for (let i = -1; i <= 1; i++) {
    const x = base.sx + i * 5 * s - 1.6 * s;
    g.fillStyle(0xf5f0e1).fillRoundedRect(x, base.sy - height, 3.2 * s, height, 1.2 * s);
    g.fillStyle(0xd6cdb4).fillRect(x + 2.2 * s, base.sy - height, 1 * s, height);
  }
  g.fillStyle(0xe2b04a);
  g.fillRoundedRect(base.sx - 6.5 * s, base.sy - height - 3 * s, 5.5 * s, 2.6 * s, 1);
  g.fillRoundedRect(base.sx + 1 * s, base.sy - height - 3 * s, 5.5 * s, 2.6 * s, 1);
  return g;
}

/** The bat: grip, splice and blade, drawn around its own centre so it rotates. */
export function makeBat(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const half = BAT_LENGTH / 2;

  // Handle, at the top (the pivot end), with grip rings.
  g.fillStyle(0x2f2a24).fillRoundedRect(-3, -half, 6, 18, 3);
  for (let i = 0; i < 4; i++) {
    g.fillStyle(0x1b1814).fillRect(-3, -half + 3 + i * 4, 6, 1.5);
  }
  // Splice.
  g.fillStyle(0xd9c391).fillTriangle(-3, -half + 17, 3, -half + 17, 0, -half + 26);
  // Blade, widening slightly toward the toe, with a grain and an edge.
  g.fillStyle(0xe3cd9a).fillRoundedRect(-BAT_WIDTH / 2, -half + 17, BAT_WIDTH, half * 2 - 17, 3);
  g.fillStyle(0xf0e0b8, 0.7).fillRect(-BAT_WIDTH / 2 + 1.5, -half + 20, 2.5, half * 2 - 24);
  g.fillStyle(0xc9b07a, 0.6).fillRect(BAT_WIDTH / 2 - 3, -half + 20, 1.5, half * 2 - 24);
  g.lineStyle(1, 0xbfa678).strokeRoundedRect(-BAT_WIDTH / 2, -half + 17, BAT_WIDTH, half * 2 - 17, 3);
  // A sticker.
  g.fillStyle(0xdc2626, 0.85).fillRect(-BAT_WIDTH / 2 + 2, -half + 26, BAT_WIDTH - 4, 6);
  g.fillStyle(0xffffff, 0.8).fillRect(-BAT_WIDTH / 2 + 3, -half + 28, BAT_WIDTH - 6, 1.5);

  c.add(g);
  return c;
}

/** The ball: red, seamed, with a shadow on the grass beneath it and a trail. */
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

  /** A wide is drawn faint: it is past you, and the bat will not meet it. */
  setGhost(ghost: boolean): void {
    this.gfx.setAlpha(ghost ? 0.45 : 1);
  }

  setDepth(depth: number): void {
    this.gfx.setDepth(depth + 3);
    this.trail.setDepth(depth + 2);
  }

  /**
   * Both projected: the ball where it is, the shadow on the turf beneath it.
   * `hot` is a struck ball still in the air: its trail is longer and whiter,
   * the way a tracer reads on a broadcast.
   */
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
