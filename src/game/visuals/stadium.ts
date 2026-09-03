import Phaser from "phaser";

import { BOUNDARY, CAMERA, PITCH_LENGTH, PX_PER_METRE } from "../config";

const CAMERA_DESIGN_FOCAL = CAMERA.focal;
import { RING } from "../physics/field";
import type { Camera, Projected, Viewport } from "../view/camera";
import type { Kit } from "./figures";

/**
 * The ground, drawn once through the camera and baked into a texture.
 *
 * Everything here is a shape in the world -- a disc of turf, a rectangle of
 * pitch, a ring of stands with people in it -- projected point by point and
 * filled. No image assets: the rope curves because a projected circle curves,
 * and the crowd is several thousand small people, each a torso and a head,
 * seated in rows on tiers that recede with the stand. Phaser re-executes a
 * Graphics object's commands every frame, so all of it is rendered once into
 * a single texture the size of the canvas and shown as an image. The camera
 * does not move, so nothing is lost.
 *
 * Colours are a floodlit evening: a deep sky, two greens in the mow, a pale
 * strip of pitch, seating in blocks under a pale roof, a crowd that leans
 * toward the home side's colours.
 */

const SKY_TOP = 0x081330;
const SKY_HORIZON = 0x2f3d6b;
const GRASS_DARK = 0x1f6a34;
const GRASS_LIGHT = 0x2a7f42;
const APRON = 0x2b5a2c;
const PITCH = 0xc9b283;
const PITCH_WORN = 0xb89e6c;
const SEAT_A = 0x3f4a70;
const SEAT_B = 0x35406a;
const AISLE = 0x262f52;
const WALKWAY = 0x6b7699;
const RAIL = 0xc7cde0;
const ROOF = 0x9aa3ba;
const ROOF_UNDER = 0x1e2745;
const HOARDINGS = [0x2563eb, 0xdc2626, 0x0f766e, 0xd97706];
const SHIRTS = [0xf8fafc, 0xe2e8f0, 0x1e293b, 0x7f1d1d, 0x1d4ed8, 0xf59e0b, 0x0f766e, 0x9333ea, 0xdc2626, 0x111827];
const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc98e5a, 0xa9703f, 0x8a5a2b, 0x6b4423];

const BOUNDARY_M = BOUNDARY / PX_PER_METRE;
const PITCH_M = PITCH_LENGTH / PX_PER_METRE;
const STAND_INNER_M = BOUNDARY_M + 9;
const STAND_HEIGHT_PX = 26 * PX_PER_METRE;
const BAY_DEG = 5;
const toRad = (deg: number) => (deg * Math.PI) / 180;

type Pt = Phaser.Math.Vector2;
const pt = (x: number, y: number): Pt => new Phaser.Math.Vector2(x, y);

/** Project a ring of ground points. */
function circlePoints(camera: Camera, radiusM: number, step = 3): Pt[] {
  const points: Pt[] = [];
  for (let deg = 0; deg <= 360; deg += step) {
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

/** A point on the stand's inner face at a bearing and a height. */
function standPoint(camera: Camera, deg: number, heightPx: number, radiusM = STAND_INNER_M): Projected | null {
  return camera.project({
    x: radiusM * Math.cos(toRad(deg)) * PX_PER_METRE,
    y: heightPx,
    z: radiusM * Math.sin(toRad(deg)) * PX_PER_METRE,
  });
}

const lerp = (a: Projected, b: Projected, t: number): Pt => pt(a.sx + (b.sx - a.sx) * t, a.sy + (b.sy - a.sy) * t);
const lerpP = (a: Projected, b: Projected, t: number): Projected => ({
  sx: a.sx + (b.sx - a.sx) * t,
  sy: a.sy + (b.sy - a.sy) * t,
  scale: a.scale + (b.scale - a.scale) * t,
  depth: a.depth + (b.depth - a.depth) * t,
});

/**
 * Draw the whole ground into one texture the size of the viewport and put it
 * on screen. `home` tints the crowd; a good share of them wear the batting
 * side's colours. The texture is keyed by kit and by size, so a resize bakes
 * a fresh one at the new resolution rather than stretching the old.
 */
export function drawStadium(scene: Phaser.Scene, camera: Camera, home: Kit, view: Viewport): Phaser.GameObjects.Image {
  const width = Math.ceil(view.width);
  const height = Math.ceil(view.height);
  const key = `stadium-${home.primary.toString(16)}-${home.secondary.toString(16)}-${width}x${height}`;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawSky(g, camera, { width, height });
    drawStands(g, camera, home, { width, height });
    drawFloodlights(g, camera);
    drawTurf(g, camera);
    drawPitch(g, camera);
    g.generateTexture(key, width, height);
    g.destroy();
  }
  return scene.add.image(0, 0, key).setOrigin(0).setDepth(-100);
}

function drawSky(g: Phaser.GameObjects.Graphics, camera: Camera, view: Viewport): void {
  const bands = 40;
  const top = Phaser.Display.Color.ValueToColor(SKY_TOP);
  const mid = Phaser.Display.Color.ValueToColor(SKY_HORIZON);
  for (let i = 0; i < bands; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, mid, bands - 1, i);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
    g.fillRect(0, (view.height / bands) * i, view.width, view.height / bands + 1);
  }
  // A scatter of stars, and a moon low over the far stand -- a fixed point in
  // the world, so it sits in the same place on the sky whatever the viewport.
  const rng = new Phaser.Math.RandomDataGenerator(["sky"]);
  const s = camera.focal / CAMERA_DESIGN_FOCAL;
  for (let i = 0; i < 90; i++) {
    g.fillStyle(0xffffff, rng.realInRange(0.2, 0.8)).fillCircle(rng.between(0, view.width), rng.between(0, 90 * s), rng.realInRange(0.5, 1.3) * s);
  }
  const moon = standPoint(camera, 20, 150 * PX_PER_METRE, BOUNDARY_M + 300);
  if (moon) {
    g.fillStyle(0xf5f0d8, 0.9).fillCircle(moon.sx, moon.sy, 14 * s);
    g.fillStyle(SKY_TOP, 0.9).fillCircle(moon.sx + 6 * s, moon.sy - 5 * s, 12 * s);
  }
}

/**
 * A ring of seating in 5-degree bays. Each bay's inner face is a projected
 * quad; on it, rows of seats in two tiers, an aisle at the bay edge, a rail
 * and a walkway between tiers, a roof with its underside in shadow, and a
 * crowd -- one small person per seat, sized by the bay's depth, in shirts
 * of every colour with a run of the home side's among them, some standing,
 * some with a flag up.
 */
function drawStands(g: Phaser.GameObjects.Graphics, camera: Camera, home: Kit, view: Viewport): void {
  const rng = new Phaser.Math.RandomDataGenerator(["crowd"]);
  const shirts = [...SHIRTS, home.primary, home.primary, home.secondary];

  // Hoardings, a metre tall just beyond the rope, in blocks of colour.
  for (let deg = 0, i = 0; deg < 360; deg += 6, i++) {
    const r = BOUNDARY_M + 1.5;
    const a = standPoint(camera, deg, 0, r);
    const b = standPoint(camera, deg + 6, 0, r);
    const at = standPoint(camera, deg, 1.1 * PX_PER_METRE, r);
    const bt = standPoint(camera, deg + 6, 1.1 * PX_PER_METRE, r);
    if (!a || !b || !at || !bt || a.depth < 300) continue;
    g.fillStyle(HOARDINGS[i % HOARDINGS.length], 0.9);
    g.fillPoints([pt(a.sx, a.sy), pt(b.sx, b.sy), pt(bt.sx, bt.sy), pt(at.sx, at.sy)], true);
    g.fillStyle(0xffffff, 0.75).fillPoints([lerp(a, b, 0.2), lerp(a, b, 0.8), lerp(at, bt, 0.8), lerp(at, bt, 0.2)].map((p) => pt(p.x, p.y + (at.sy - a.sy) * 0.3)), true);
  }

  for (let deg = 0; deg < 360; deg += BAY_DEG) {
    const bl = standPoint(camera, deg, 0);
    const br = standPoint(camera, deg + BAY_DEG, 0);
    const tl = standPoint(camera, deg, STAND_HEIGHT_PX);
    const tr = standPoint(camera, deg + BAY_DEG, STAND_HEIGHT_PX);
    if (!bl || !br || !tl || !tr || bl.depth < 300) continue;
    if (![bl, br, tl, tr].some((p) => p.sx > -120 && p.sx < view.width + 120)) continue;

    const quad = (t0: number, t1: number, u0 = 0, u1 = 1): Pt[] => [
      lerp(lerpP(bl, br, u0), lerpP(tl, tr, u0), t0),
      lerp(lerpP(bl, br, u1), lerpP(tl, tr, u1), t0),
      lerp(lerpP(bl, br, u1), lerpP(tl, tr, u1), t1),
      lerp(lerpP(bl, br, u0), lerpP(tl, tr, u0), t1),
    ];

    const bay = (deg / BAY_DEG) % 2 === 0;
    // Front wall, lower tier seats, walkway, upper tier seats, roof shadow, roof.
    g.fillStyle(0x2a3357).fillPoints(quad(0, 0.06), true);
    g.fillStyle(bay ? SEAT_A : SEAT_B).fillPoints(quad(0.06, 0.44), true);
    g.fillStyle(WALKWAY).fillPoints(quad(0.44, 0.49), true);
    g.fillStyle(bay ? SEAT_B : SEAT_A).fillPoints(quad(0.49, 0.86), true);
    g.fillStyle(ROOF_UNDER).fillPoints(quad(0.86, 0.94), true);
    g.fillStyle(ROOF).fillPoints(quad(0.94, 1.0), true);
    // Aisle down the bay edge, and a rail along the front and the walkway.
    g.fillStyle(AISLE).fillPoints(quad(0.06, 0.86, 0, 0.07), true);
    g.lineStyle(Math.max(1, 1.6 * bl.scale), RAIL, 0.9);
    g.strokePoints([lerp(bl, tl, 0.06), lerp(br, tr, 0.06)], false);
    g.strokePoints([lerp(bl, tl, 0.49), lerp(br, tr, 0.49)], false);
    // Seat rows, faint.
    g.lineStyle(1, 0x1f2747, 0.5);
    for (const t of [0.14, 0.22, 0.30, 0.38, 0.57, 0.65, 0.73, 0.81]) {
      g.strokePoints([lerp(bl, tl, t), lerp(br, tr, t)], false);
    }

    // The crowd. Seat pitch ~0.85m: a bay of 7.6m holds nine across.
    const s = bl.scale;
    const across = 9;
    const rows: number[] = [0.10, 0.17, 0.24, 0.31, 0.38, 0.53, 0.60, 0.67, 0.74, 0.81];
    const homeBay = rng.frac() < 0.3;
    for (const v of rows) {
      for (let k = 0; k < across; k++) {
        if (rng.frac() < 0.08) continue; // an empty seat
        const u = 0.1 + (k + 0.5 + rng.realInRange(-0.2, 0.2)) / across * 0.88;
        const base = lerp(lerpP(bl, br, u), lerpP(tl, tr, u), v);
        const standing = rng.frac() < 0.12;
        const h = (standing ? 20 : 13) * s;
        const w = 10 * s;
        const shirt = homeBay && rng.frac() < 0.6 ? (rng.frac() < 0.7 ? home.primary : home.secondary) : shirts[rng.between(0, shirts.length - 1)];
        g.fillStyle(shirt, 0.95).fillRoundedRect(base.x - w / 2, base.y - h, w, h, w * 0.3);
        const skin = SKINS[rng.between(0, SKINS.length - 1)];
        g.fillStyle(skin).fillCircle(base.x, base.y - h - 3 * s, 3.4 * s);
        g.fillStyle(0x1a1210, 0.9).fillEllipse(base.x, base.y - h - 4.4 * s, 6.4 * s, 3 * s);
        if (standing && rng.frac() < 0.5) {
          // An arm up, and sometimes a flag in it.
          g.lineStyle(2.2 * s, skin).lineBetween(base.x + w * 0.4, base.y - h * 0.8, base.x + w * 0.9, base.y - h - 10 * s);
          if (rng.frac() < 0.6) {
            g.fillStyle(rng.frac() < 0.7 ? home.primary : home.secondary, 0.95)
              .fillTriangle(base.x + w * 0.9, base.y - h - 10 * s, base.x + w * 0.9 + 12 * s, base.y - h - 7 * s, base.x + w * 0.9, base.y - h - 2 * s);
          }
        }
      }
    }
    // A banner on the front rail of some bays.
    if (rng.frac() < 0.25) {
      g.fillStyle(0xf8fafc, 0.9).fillPoints(quad(0.0, 0.055, 0.15, 0.85), true);
      g.fillStyle(rng.frac() < 0.5 ? home.primary : 0xdc2626, 0.85).fillPoints(quad(0.012, 0.043, 0.2, 0.8), true);
    }
  }

  // Roof lights: a run of small lamps along the roof edge.
  for (let deg = 2.5; deg < 360; deg += BAY_DEG) {
    const p = standPoint(camera, deg, STAND_HEIGHT_PX * 0.93);
    if (!p || p.depth < 300 || p.sx < 0 || p.sx > view.width) continue;
    g.fillStyle(0xfff6d0, 0.9).fillCircle(p.sx, p.sy, Math.max(1, 2.2 * p.scale));
  }
}

function drawFloodlights(g: Phaser.GameObjects.Graphics, camera: Camera): void {
  for (const deg of [42, 138, -42, -138]) {
    const r = BOUNDARY_M + 24;
    const base = standPoint(camera, deg, 0, r);
    const top = standPoint(camera, deg, 32 * PX_PER_METRE, r);
    if (!base || !top || base.depth < 300) continue;
    const w = Math.max(3, 10 * top.scale);
    // A lattice mast: two legs and cross-braces.
    g.lineStyle(Math.max(1.5, 3 * top.scale), 0x0a1428, 1);
    g.lineBetween(top.sx - w, top.sy, base.sx - w * 1.6, base.sy);
    g.lineBetween(top.sx + w, top.sy, base.sx + w * 1.6, base.sy);
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      const y = top.sy + (base.sy - top.sy) * t;
      const half = w + (w * 0.6) * t;
      g.lineBetween(top.sx - half, y, top.sx + half, y);
    }
    const headW = 130 * top.scale;
    const headH = 48 * top.scale;
    g.fillStyle(0x16233f).fillRect(top.sx - headW / 2, top.sy - headH, headW, headH);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        g.fillStyle(0xfff6d0, 0.95).fillCircle(
          top.sx - headW / 2 + headW * (0.1 + col * 0.16),
          top.sy - headH * (0.8 - row * 0.3),
          Math.max(1.5, 5.5 * top.scale),
        );
      }
    }
    g.fillStyle(0xfff6d0, 0.05).fillCircle(top.sx, top.sy - headH / 2, 140 * top.scale);
    g.fillStyle(0xfff6d0, 0.04).fillCircle(top.sx, top.sy - headH / 2, 80 * top.scale);
  }
}

function drawTurf(g: Phaser.GameObjects.Graphics, camera: Camera): void {
  g.fillStyle(APRON).fillPoints(circlePoints(camera, BOUNDARY_M + 9), true);
  g.fillStyle(GRASS_DARK).fillPoints(circlePoints(camera, BOUNDARY_M), true);

  // Mowing stripes across the ground, parallel to the pitch.
  for (let z = -BOUNDARY_M; z < BOUNDARY_M; z += 12) {
    const band = bandPoints(camera, BOUNDARY_M, z, Math.min(BOUNDARY_M, z + 6));
    if (band.length > 3) g.fillStyle(GRASS_LIGHT, 0.6).fillPoints(band, true);
  }
  // Lighter toward the middle where the floodlights concentrate.
  g.fillStyle(0xffffff, 0.04).fillPoints(circlePoints(camera, 34), true);

  const ring = circlePoints(camera, RING);
  g.lineStyle(1.5, 0xf8fafc, 0.35).strokePoints(ring, true);
  g.lineStyle(2, 0x0f2d1c, 0.35).strokePoints(circlePoints(camera, BOUNDARY_M - 0.4, 2), true);
  g.lineStyle(4, 0xf8fafc, 0.95).strokePoints(circlePoints(camera, BOUNDARY_M, 2), true);
}

function drawPitch(g: Phaser.GameObjects.Graphics, camera: Camera): void {
  const quad = (x0: number, x1: number, z0: number, z1: number): Pt[] => {
    const corners = [camera.ground(x0, z0), camera.ground(x1, z0), camera.ground(x1, z1), camera.ground(x0, z1)];
    return corners.filter((c): c is Projected => c !== null).map((c) => pt(c.sx, c.sy));
  };
  g.fillStyle(PITCH).fillPoints(quad(-2.4, PITCH_M + 2.4, -1.55, 1.55), true);
  g.fillStyle(PITCH_WORN, 0.7).fillPoints(quad(5, 9, -0.9, 0.9), true);
  g.fillStyle(PITCH_WORN, 0.7).fillPoints(quad(PITCH_M - 9, PITCH_M - 5, -0.9, 0.9), true);
  // Creases.
  g.fillStyle(0xf8fafc, 0.9);
  for (const x of [1.22, PITCH_M - 1.22]) g.fillPoints(quad(x - 0.05, x + 0.05, -1.4, 1.4), true);
  for (const x of [0, PITCH_M]) g.fillPoints(quad(x - 0.04, x + 0.04, -1.32, 1.32), true);
  for (const z of [-1.32, 1.32]) {
    g.fillPoints(quad(0, 1.22, z - 0.04, z + 0.04), true);
    g.fillPoints(quad(PITCH_M - 1.22, PITCH_M, z - 0.04, z + 0.04), true);
  }
}
