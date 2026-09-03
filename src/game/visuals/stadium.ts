import Phaser from "phaser";

import { BOUNDARY, CANVAS, PITCH_LENGTH, PX_PER_METRE } from "../config";
import { RING } from "../physics/field";
import type { Camera, Projected } from "../view/camera";

/**
 * The ground, drawn once through the camera.
 *
 * Everything here is a shape in the world -- a disc of turf, a rectangle of
 * pitch, a ring of stands -- projected point by point and filled. No image
 * assets, no perspective tricks: the rope curves because a projected circle
 * curves. The camera does not move, so this is drawn once and left alone.
 *
 * Colours are a floodlit evening: a warm horizon under a deep sky, two greens
 * in the mow, a pale strip of pitch, navy tiers of seating with a crowd in it.
 */

const SKY_TOP = 0x0a1633;
const SKY_HORIZON = 0x3b4a7a;
const SKY_GLOW = 0x8a6a4a;
const GRASS_DARK = 0x1f6a34;
const GRASS_LIGHT = 0x2a7f42;
const APRON = 0x2b5a2c;
const PITCH = 0xc9b283;
const PITCH_WORN = 0xb89e6c;
const TIER_LOWER = 0x4a5578;
const TIER_UPPER = 0x3a4566;
const WALKWAY = 0x6b7699;
const ROOF = 0x9aa3ba;
const ROOF_SHADOW = 0x232c48;
const HOARDINGS = [0x2563eb, 0xdc2626, 0x0f766e, 0xd97706];

const BOUNDARY_M = BOUNDARY / PX_PER_METRE;
const PITCH_M = PITCH_LENGTH / PX_PER_METRE;
const toRad = (deg: number) => (deg * Math.PI) / 180;

type Pt = Phaser.Math.Vector2;
const pt = (x: number, y: number): Pt => new Phaser.Math.Vector2(x, y);

/** Project a ring of ground points; null when any point is behind the camera. */
function circlePoints(camera: Camera, radiusM: number, from = 0, to = 360, step = 4): Pt[] {
  const points: Pt[] = [];
  for (let deg = from; deg <= to; deg += step) {
    const p = camera.ground(radiusM * Math.cos(toRad(deg)), radiusM * Math.sin(toRad(deg)));
    if (p) points.push(pt(p.sx, p.sy));
  }
  return points;
}

/** The part of a disc between two across-lines, as a projected polygon. */
function bandPoints(camera: Camera, radiusM: number, z0: number, z1: number, steps = 6): Pt[] {
  const front: Pt[] = [];
  const back: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const z = z0 + ((z1 - z0) * i) / steps;
    const half = Math.sqrt(Math.max(0, radiusM * radiusM - z * z));
    const a = camera.ground(half, z);
    const b = camera.ground(-half, z);
    if (a) front.push(pt(a.sx, a.sy));
    if (b) back.push(pt(b.sx, b.sy));
  }
  return [...front, ...back.reverse()];
}

export function drawStadium(scene: Phaser.Scene, camera: Camera): void {
  drawSky(scene);
  drawStands(scene, camera);
  drawFloodlights(scene, camera);
  drawTurf(scene, camera);
  drawPitch(scene, camera);
  drawMarkers(scene, camera);
}

function drawSky(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(-100);
  const bands = 48;
  const top = Phaser.Display.Color.ValueToColor(SKY_TOP);
  const mid = Phaser.Display.Color.ValueToColor(SKY_HORIZON);
  const glow = Phaser.Display.Color.ValueToColor(SKY_GLOW);
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c = t < 0.7
      ? Phaser.Display.Color.Interpolate.ColorWithColor(top, mid, 100, (t / 0.7) * 100)
      : Phaser.Display.Color.Interpolate.ColorWithColor(mid, glow, 100, ((t - 0.7) / 0.3) * 100);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
    g.fillRect(0, (CANVAS.height / bands) * i, CANVAS.width, CANVAS.height / bands + 1);
  }
}

/**
 * A ring of seating from 78m out, 30m tall, in 5-degree segments. Each
 * segment's inner face is a projected quad; the crowd is a speckle scattered
 * across that quad. Segments behind or beside the camera are skipped.
 */
function drawStands(scene: Phaser.Scene, camera: Camera): void {
  const g = scene.add.graphics().setDepth(-90);
  const inner = BOUNDARY_M + 10;
  const height = 30 * PX_PER_METRE;
  const rng = Phaser.Math.RND;

  const corner = (deg: number, h: number): Projected | null =>
    camera.project({
      x: inner * Math.cos(toRad(deg)) * PX_PER_METRE,
      y: h,
      z: inner * Math.sin(toRad(deg)) * PX_PER_METRE,
    });

  // Hoardings first, a metre tall just beyond the rope.
  for (let deg = 0, i = 0; deg < 360; deg += 6, i++) {
    const r = BOUNDARY_M + 1.5;
    const a = camera.project({ x: r * Math.cos(toRad(deg)) * PX_PER_METRE, y: 0, z: r * Math.sin(toRad(deg)) * PX_PER_METRE });
    const b = camera.project({ x: r * Math.cos(toRad(deg + 6)) * PX_PER_METRE, y: 0, z: r * Math.sin(toRad(deg + 6)) * PX_PER_METRE });
    const at = camera.project({ x: r * Math.cos(toRad(deg)) * PX_PER_METRE, y: 1.2 * PX_PER_METRE, z: r * Math.sin(toRad(deg)) * PX_PER_METRE });
    const bt = camera.project({ x: r * Math.cos(toRad(deg + 6)) * PX_PER_METRE, y: 1.2 * PX_PER_METRE, z: r * Math.sin(toRad(deg + 6)) * PX_PER_METRE });
    if (!a || !b || !at || !bt || a.depth < 300) continue;
    g.fillStyle(HOARDINGS[i % HOARDINGS.length], 0.85);
    g.fillPoints([pt(a.sx, a.sy), pt(b.sx, b.sy), pt(bt.sx, bt.sy), pt(at.sx, at.sy)], true);
  }

  for (let deg = 0; deg < 360; deg += 5) {
    const bl = corner(deg, 0);
    const br = corner(deg + 5, 0);
    const tl = corner(deg, height);
    const tr = corner(deg + 5, height);
    if (!bl || !br || !tl || !tr || bl.depth < 300) continue;
    const onScreen = [bl, br, tl, tr].some((p) => p.sx > -100 && p.sx < CANVAS.width + 100);
    if (!onScreen) continue;

    const lerp = (a: Projected, b: Projected, t: number): Pt => pt(a.sx + (b.sx - a.sx) * t, a.sy + (b.sy - a.sy) * t);
    // Lower tier, walkway, upper tier, a shadow under the roof and the roof
    // edge, as stacked quads. Alternate bays a shade apart so the ring reads
    // as seating blocks rather than one band.
    const bay = (deg / 5) % 2 === 0 ? 0 : 0x0a0c14;
    const tiers: [number, number, number][] = [
      [0, 0.40, TIER_LOWER - bay], [0.40, 0.46, WALKWAY], [0.46, 0.88, TIER_UPPER - bay],
      [0.88, 0.94, ROOF_SHADOW], [0.94, 1, ROOF],
    ];
    for (const [t0, t1, colour] of tiers) {
      const p0 = lerp(bl, tl, t0);
      const p1 = lerp(br, tr, t0);
      const p2 = lerp(br, tr, t1);
      const p3 = lerp(bl, tl, t1);
      g.fillStyle(colour).fillPoints([p0, p1, p2, p3], true);
    }
    // The crowd: dots scattered over both tiers, denser and larger nearer.
    const dots = Math.round(22 * Math.min(1.6, 1400 / bl.depth));
    for (let i = 0; i < dots; i++) {
      const u = rng.frac();
      const v = rng.frac() < 0.45 ? rng.realInRange(0.03, 0.38) : rng.realInRange(0.48, 0.86);
      const bottom = lerp(bl, br, u);
      const top = lerp(tl, tr, u);
      const x = bottom.x + (top.x - bottom.x) * v;
      const y = bottom.y + (top.y - bottom.y) * v;
      const shade = [0xf2c777, 0xe8e3d6, 0xd97b5a, 0x8fb8e0, 0xc4a3d4, 0xf59e0b, 0x1e293b, 0x7f1d1d][rng.integerInRange(0, 7)];
      const size = Math.max(1.4, 3 * bl.scale * 1.4);
      g.fillStyle(shade, 0.6 + rng.frac() * 0.4).fillRect(x, y, size, size);
    }
  }
}

function drawFloodlights(scene: Phaser.Scene, camera: Camera): void {
  const g = scene.add.graphics().setDepth(-85);
  for (const deg of [42, 138, -42, -138]) {
    const r = BOUNDARY_M + 26;
    const base = camera.project({ x: r * Math.cos(toRad(deg)) * PX_PER_METRE, y: 0, z: r * Math.sin(toRad(deg)) * PX_PER_METRE });
    const top = camera.project({ x: r * Math.cos(toRad(deg)) * PX_PER_METRE, y: 32 * PX_PER_METRE, z: r * Math.sin(toRad(deg)) * PX_PER_METRE });
    if (!base || !top || base.depth < 300) continue;
    const w = Math.max(3, 9 * top.scale);
    g.fillStyle(0x0a1428).fillRect(top.sx - w / 2, top.sy, w, base.sy - top.sy);
    const headW = 120 * top.scale;
    const headH = 50 * top.scale;
    g.fillStyle(0x16233f).fillRect(top.sx - headW / 2, top.sy - headH, headW, headH);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        g.fillStyle(0xfff6d0, 0.95).fillCircle(
          top.sx - headW / 2 + headW * (0.14 + col * 0.18),
          top.sy - headH * (0.7 - row * 0.4),
          Math.max(1.5, 6 * top.scale),
        );
      }
    }
    g.fillStyle(0xfff6d0, 0.06).fillCircle(top.sx, top.sy - headH / 2, 110 * top.scale);
  }
}

function drawTurf(scene: Phaser.Scene, camera: Camera): void {
  const g = scene.add.graphics().setDepth(-50);

  // The apron beyond the rope, then the outfield on top of it.
  g.fillStyle(APRON).fillPoints(circlePoints(camera, BOUNDARY_M + 10, 0, 360, 3), true);
  g.fillStyle(GRASS_DARK).fillPoints(circlePoints(camera, BOUNDARY_M, 0, 360, 3), true);

  // Mowing stripes across the ground, parallel to the pitch.
  for (let z = -BOUNDARY_M; z < BOUNDARY_M; z += 12) {
    const band = bandPoints(camera, BOUNDARY_M, z, Math.min(BOUNDARY_M, z + 6));
    if (band.length > 3) g.fillStyle(GRASS_LIGHT, 0.6).fillPoints(band, true);
  }

  // The thirty-yard circle, faint, and the rope, not faint.
  const ring = circlePoints(camera, RING, 0, 360, 3);
  g.lineStyle(1.5, 0xf8fafc, 0.35).strokePoints(ring, true);
  const rope = circlePoints(camera, BOUNDARY_M, 0, 360, 2);
  g.lineStyle(4, 0xf8fafc, 0.95).strokePoints(rope, true);
  // A shadow under the rope so it reads as a rope and not a line.
  g.lineStyle(2, 0x0f2d1c, 0.35).strokePoints(circlePoints(camera, BOUNDARY_M - 0.4, 0, 360, 2), true);
}

function drawPitch(scene: Phaser.Scene, camera: Camera): void {
  const g = scene.add.graphics().setDepth(-40);
  const quad = (x0: number, x1: number, z0: number, z1: number): Pt[] => {
    const corners = [camera.ground(x0, z0), camera.ground(x1, z0), camera.ground(x1, z1), camera.ground(x0, z1)];
    return corners.filter((c): c is Projected => c !== null).map((c) => pt(c.sx, c.sy));
  };
  // The strip, from behind the striker's crease to behind the bowler's.
  g.fillStyle(PITCH).fillPoints(quad(-2.4, PITCH_M + 2.4, -1.55, 1.55), true);
  // Worn patches on a good length at each end.
  g.fillStyle(PITCH_WORN, 0.7).fillPoints(quad(5, 9, -0.9, 0.9), true);
  g.fillStyle(PITCH_WORN, 0.7).fillPoints(quad(PITCH_M - 9, PITCH_M - 5, -0.9, 0.9), true);
  // Creases: popping creases 1.22m in front of each stumps, bowling creases.
  g.fillStyle(0xf8fafc, 0.9);
  for (const x of [1.22, PITCH_M - 1.22]) g.fillPoints(quad(x - 0.05, x + 0.05, -1.4, 1.4), true);
  for (const x of [0, PITCH_M]) g.fillPoints(quad(x - 0.04, x + 0.04, -1.32, 1.32), true);
}

function drawMarkers(scene: Phaser.Scene, camera: Camera): void {
  for (let d = -20; d <= 60; d += 10) {
    if (d === 0) continue;
    const p = camera.ground(d, -4);
    if (!p) continue;
    scene.add.text(p.sx, p.sy, `${Math.abs(d)}m`, {
      fontFamily: "system-ui, sans-serif", fontSize: `${Math.round(11 * p.scale)}px`, color: "#8fbf9a",
    }).setOrigin(0.5, 0).setAlpha(0.8).setDepth(-30);
  }
}
