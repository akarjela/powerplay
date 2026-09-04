import Phaser from "phaser";

import { BOUNDARY, CAMERA, PITCH_LENGTH, PX_PER_METRE } from "../config";
import { RING } from "../physics/field";
import type { Camera, Projected, Viewport } from "../view/camera";
import type { Kit } from "./figures";

const SKY_TOP = 0x081330;
const SKY_HORIZON = 0x2f3d6b;
const GRASS_EDGE = 0x175a2c;
const GRASS_LIGHT = 0x2c8646;
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

const SQUARE_M = PITCH_M / 2;

const DESIGN_FOCAL = CAMERA.focal;
const STAND_INNER_M = BOUNDARY_M + 9;
const STAND_HEIGHT_PX = 26 * PX_PER_METRE;
const BAY_DEG = 5;
const toRad = (deg: number) => (deg * Math.PI) / 180;

type Pt = Phaser.Math.Vector2;
const pt = (x: number, y: number): Pt => new Phaser.Math.Vector2(x, y);

function discPoints(camera: Camera, centreM: number, radiusM: number, step = 3): Pt[] {
  const points: Pt[] = [];
  for (let deg = 0; deg <= 360; deg += step) {
    const p = camera.ground(centreM + radiusM * Math.cos(toRad(deg)), radiusM * Math.sin(toRad(deg)));
    if (p) points.push(pt(p.sx, p.sy));
  }
  return points;
}

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
    drawLightPools(g, camera, { width, height });
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

  const rng = new Phaser.Math.RandomDataGenerator(["sky"]);
  const s = camera.focal / DESIGN_FOCAL;
  for (let i = 0; i < 90; i++) {
    g.fillStyle(0xffffff, rng.realInRange(0.2, 0.8)).fillCircle(rng.between(0, view.width), rng.between(0, 90 * s), rng.realInRange(0.5, 1.3) * s);
  }
  const moon = standPoint(camera, 20, 150 * PX_PER_METRE, BOUNDARY_M + 300);
  if (moon) {
    g.fillStyle(0xf5f0d8, 0.9).fillCircle(moon.sx, moon.sy, 14 * s);
    g.fillStyle(SKY_TOP, 0.9).fillCircle(moon.sx + 6 * s, moon.sy - 5 * s, 12 * s);
  }
}

function drawStands(g: Phaser.GameObjects.Graphics, camera: Camera, home: Kit, view: Viewport): void {
  const rng = new Phaser.Math.RandomDataGenerator(["stands"]);

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

  for (const bay of visibleBays(camera, view)) {
    const { bl, br, tl, tr, quad } = bay;
    const even = (bay.deg / BAY_DEG) % 2 === 0;

    g.fillStyle(0x2a3357).fillPoints(quad(0, 0.06), true);
    g.fillStyle(even ? SEAT_A : SEAT_B).fillPoints(quad(0.06, 0.44), true);
    g.fillStyle(WALKWAY).fillPoints(quad(0.44, 0.49), true);
    g.fillStyle(even ? SEAT_B : SEAT_A).fillPoints(quad(0.49, 0.86), true);
    g.fillStyle(ROOF_UNDER).fillPoints(quad(0.86, 0.94), true);
    g.fillStyle(ROOF).fillPoints(quad(0.94, 1.0), true);

    g.fillStyle(AISLE).fillPoints(quad(0.06, 0.86, 0, 0.07), true);
    g.lineStyle(Math.max(1, 1.6 * bl.scale), RAIL, 0.9);
    g.strokePoints([lerp(bl, tl, 0.06), lerp(br, tr, 0.06)], false);
    g.strokePoints([lerp(bl, tl, 0.49), lerp(br, tr, 0.49)], false);

    g.lineStyle(1, 0x1f2747, 0.5);
    for (const t of [0.14, 0.22, 0.30, 0.38, 0.57, 0.65, 0.73, 0.81]) {
      g.strokePoints([lerp(bl, tl, t), lerp(br, tr, t)], false);
    }

    if (rng.frac() < 0.25) {
      g.fillStyle(0xf8fafc, 0.9).fillPoints(quad(0.0, 0.055, 0.15, 0.85), true);
      g.fillStyle(rng.frac() < 0.5 ? home.primary : 0xdc2626, 0.85).fillPoints(quad(0.012, 0.043, 0.2, 0.8), true);
    }
  }

  for (let deg = 2.5; deg < 360; deg += BAY_DEG) {
    const p = standPoint(camera, deg, STAND_HEIGHT_PX * 0.93);
    if (!p || p.depth < 300 || p.sx < 0 || p.sx > view.width) continue;
    g.fillStyle(0xfff6d0, 0.9).fillCircle(p.sx, p.sy, Math.max(1, 2.2 * p.scale));
  }
}

interface Bay {
  deg: number;
  bl: Projected;
  br: Projected;
  tl: Projected;
  tr: Projected;

  quad: (t0: number, t1: number, u0?: number, u1?: number) => Pt[];
}

function visibleBays(camera: Camera, view: Viewport): Bay[] {
  const bays: Bay[] = [];
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
    bays.push({ deg, bl, br, tl, tr, quad });
  }
  return bays;
}

export type CrowdFrame = "a" | "b" | "c" | "up";

export function bakeCrowd(scene: Phaser.Scene, camera: Camera, home: Kit, view: Viewport, frame: CrowdFrame): string {
  const width = Math.ceil(view.width);
  const height = Math.ceil(view.height);
  const key = `crowd-${home.primary.toString(16)}-${home.secondary.toString(16)}-${width}x${height}-${frame}`;
  if (scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const seat = new Phaser.Math.RandomDataGenerator(["crowd"]);
  const pose = new Phaser.Math.RandomDataGenerator([`crowd-${frame}`]);
  const shirts = [...SHIRTS, home.primary, home.primary, home.secondary];
  const up = frame === "up";

  for (const bay of visibleBays(camera, view)) {
    const { bl, br, tl, tr } = bay;

    const s = bl.scale;
    const across = 9;
    const rows: number[] = [0.10, 0.17, 0.24, 0.31, 0.38, 0.53, 0.60, 0.67, 0.74, 0.81];
    const homeBay = seat.frac() < 0.3;
    for (const v of rows) {
      for (let k = 0; k < across; k++) {
        if (seat.frac() < 0.08) continue;
        const u = 0.1 + (k + 0.5 + seat.realInRange(-0.2, 0.2)) / across * 0.88;
        const base = lerp(lerpP(bl, br, u), lerpP(tl, tr, u), v);
        const stander = seat.frac() < 0.12;
        const shirt = homeBay && seat.frac() < 0.6 ? (seat.frac() < 0.7 ? home.primary : home.secondary) : shirts[seat.between(0, shirts.length - 1)];
        const skin = SKINS[seat.between(0, SKINS.length - 1)];
        const hasFlag = stander && seat.frac() < 0.5 && seat.frac() < 0.6;
        const flag = seat.frac() < 0.7 ? home.primary : home.secondary;

        const standing = up ? pose.frac() < 0.85 || stander : stander;
        const dx = pose.realInRange(-0.6, 0.6) * s + (pose.frac() < 0.06 ? pose.realInRange(-1.4, 1.4) * s : 0);
        const dy = up ? -pose.realInRange(0, 2.5) * s : pose.realInRange(-0.4, 0.4) * s;
        const armsUp = up ? pose.frac() < 0.8 : stander && pose.frac() < 0.5;
        const h = (standing ? 20 : 13) * s;
        const w = 10 * s;
        const x = base.x + dx;
        const y = base.y + dy;

        g.fillStyle(shirt, 0.95).fillRoundedRect(x - w / 2, y - h, w, h, w * 0.3);
        g.fillStyle(skin).fillCircle(x, y - h - 3 * s, 3.4 * s);
        g.fillStyle(0x1a1210, 0.9).fillEllipse(x, y - h - 4.4 * s, 6.4 * s, 3 * s);
        if (armsUp) {
          const reach = up ? 12 * s : 10 * s;
          const lean = pose.realInRange(-0.15, 0.15);
          g.lineStyle(2.2 * s, skin).lineBetween(x + w * 0.4, y - h * 0.8, x + w * (0.9 + lean), y - h - reach);
          if (up && pose.frac() < 0.7) g.lineBetween(x - w * 0.4, y - h * 0.8, x - w * (0.9 - lean), y - h - reach);
          if (hasFlag || (up && pose.frac() < 0.08)) {
            const wave = pose.realInRange(-3, 3) * s;
            g.fillStyle(flag, 0.95).fillTriangle(
              x + w * 0.9, y - h - reach,
              x + w * 0.9 + 12 * s, y - h - reach + 3 * s + wave,
              x + w * 0.9, y - h - reach + 8 * s,
            );
          }
        }
      }
    }
  }

  g.generateTexture(key, width, height);
  g.destroy();
  return key;
}

function drawFloodlights(g: Phaser.GameObjects.Graphics, camera: Camera): void {
  for (const deg of [42, 138, -42, -138]) {
    const r = BOUNDARY_M + 24;
    const base = standPoint(camera, deg, 0, r);
    const top = standPoint(camera, deg, 32 * PX_PER_METRE, r);
    if (!base || !top || base.depth < 300) continue;
    const w = Math.max(3, 10 * top.scale);

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

    const cx = top.sx;
    const cy = top.sy - headH / 2;
    const halo = 260 * top.scale;
    for (let i = 0; i < 7; i++) {
      const t = 1 - i / 7;
      g.fillStyle(i < 4 ? 0xfff1c9 : 0xffe6a8, 0.028 + i * 0.012).fillCircle(cx, cy, halo * t);
    }
    g.fillStyle(0xfff8e6, 0.35).fillEllipse(cx, cy + headH * 0.1, headW * 0.9, headH * 0.6);
    g.fillStyle(0xfff8e6, 0.12).fillEllipse(cx, cy + headH * 0.9, headW * 1.5, headH * 1.4);
  }
}

function drawLightPools(g: Phaser.GameObjects.Graphics, camera: Camera, view: Viewport): void {
  const pool = (alongM: number, acrossM: number, radiusM: number, alpha: number) => {
    for (let i = 0; i < 5; i++) {
      const t = 1 - i / 5;
      const pts: Pt[] = [];
      for (let deg = 0; deg <= 360; deg += 6) {
        const p = camera.ground(alongM + radiusM * t * Math.cos(toRad(deg)), acrossM + radiusM * t * Math.sin(toRad(deg)));
        if (p) pts.push(pt(p.sx, p.sy));
      }
      if (pts.length > 3) g.fillStyle(0xfff0c2, alpha * (0.35 + i * 0.16)).fillPoints(pts, true);
    }
  };
  for (const deg of [42, 138, -42, -138]) {
    const r = BOUNDARY_M * 0.55;
    pool(SQUARE_M + r * Math.cos(toRad(deg)), r * Math.sin(toRad(deg)), 30, 0.028);
  }
  pool(SQUARE_M, 0, 26, 0.03);

  const far = camera.ground(SQUARE_M, BOUNDARY_M + 9);
  if (far) {
    const bands = 12;
    const height = view.height * 0.22;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      g.fillStyle(0xd9e2ff, 0.035 * (1 - t)).fillRect(0, far.sy - height * (t + 1 / bands), view.width, height / bands + 1);
    }
  }
}

function wedgePoints(camera: Camera, innerM: number, outerM: number, deg0: number, deg1: number, step = 2): Pt[] {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let deg = deg0; deg <= deg1 + 1e-6; deg += step) {
    const a = camera.ground(SQUARE_M + outerM * Math.cos(toRad(deg)), outerM * Math.sin(toRad(deg)));
    const b = camera.ground(SQUARE_M + innerM * Math.cos(toRad(deg)), innerM * Math.sin(toRad(deg)));
    if (a) outer.push(pt(a.sx, a.sy));
    if (b) inner.push(pt(b.sx, b.sy));
  }
  return [...outer, ...inner.reverse()];
}

function drawTurf(g: Phaser.GameObjects.Graphics, camera: Camera): void {
  g.fillStyle(APRON).fillPoints(discPoints(camera, 0, BOUNDARY_M + 9), true);

  const edge = Phaser.Display.Color.ValueToColor(GRASS_EDGE);
  const centre = Phaser.Display.Color.ValueToColor(GRASS_LIGHT);
  const rings = 14;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const r = BOUNDARY_M + 1 - (BOUNDARY_M - 14) * t;
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(edge, centre, 1, Math.pow(t, 1.4));
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillPoints(discPoints(camera, 0, r), true);
  }

  const wedge = 5;
  for (let deg = 0, i = 0; deg < 360; deg += wedge, i++) {
    const band = wedgePoints(camera, 13, BOUNDARY_M + 1, deg, deg + wedge);
    if (band.length < 3) continue;
    if (i % 2 === 0) g.fillStyle(0xffffff, 0.042);
    else g.fillStyle(0x000000, 0.045);
    g.fillPoints(band, true);
  }

  g.fillStyle(0xfff3d6, 0.05).fillPoints(discPoints(camera, SQUARE_M, 30), true);
  g.fillStyle(0xfff3d6, 0.04).fillPoints(discPoints(camera, SQUARE_M, 18), true);

  const ring = discPoints(camera, 0, RING);
  g.lineStyle(1.5, 0xf8fafc, 0.35).strokePoints(ring, true);
  drawRope(g, camera);
}

function drawRope(g: Phaser.GameObjects.Graphics, camera: Camera): void {
  const cushionM = 1.5;
  const gapM = 0.25;
  const circumference = 2 * Math.PI * BOUNDARY_M;
  const count = Math.floor(circumference / (cushionM + gapM));
  const stepDeg = 360 / count;
  const cushionDeg = stepDeg * (cushionM / (cushionM + gapM));

  const segments: { pts: Pt[]; scale: number }[] = [];
  for (let i = 0; i < count; i++) {
    const d0 = i * stepDeg;
    const pts: Pt[] = [];
    let scale = 0;
    for (let k = 0; k <= 3; k++) {
      const deg = d0 + (cushionDeg * k) / 3;
      const p = camera.ground(BOUNDARY_M * Math.cos(toRad(deg)), BOUNDARY_M * Math.sin(toRad(deg)));
      if (!p) continue;
      pts.push(pt(p.sx, p.sy));
      scale = p.scale;
    }
    if (pts.length > 1) segments.push({ pts, scale });
  }

  for (const { pts, scale } of segments) {
    const w = Math.max(2.5, 9 * scale);
    g.lineStyle(w * 1.15, 0x08240f, 0.45).strokePoints(pts.map((p) => pt(p.x, p.y + w * 0.35)), false);
  }
  for (const { pts, scale } of segments) {
    const w = Math.max(2.5, 9 * scale);
    g.lineStyle(w, 0xe9edf3, 1).strokePoints(pts, false);
    g.fillStyle(0xe9edf3, 1).fillCircle(pts[0].x, pts[0].y, w / 2).fillCircle(pts[pts.length - 1].x, pts[pts.length - 1].y, w / 2);
  }
  for (const { pts, scale } of segments) {
    const w = Math.max(2.5, 9 * scale);
    g.lineStyle(Math.max(1, w * 0.3), 0xffffff, 0.8).strokePoints(pts.map((p) => pt(p.x, p.y - w * 0.22)), false);
    g.lineStyle(Math.max(1, w * 0.25), 0xb7c0cf, 0.6).strokePoints(pts.map((p) => pt(p.x, p.y + w * 0.3)), false);
  }
}

function drawPitch(g: Phaser.GameObjects.Graphics, camera: Camera): void {
  const quad = (x0: number, x1: number, z0: number, z1: number): Pt[] => {
    const corners = [camera.ground(x0, z0), camera.ground(x1, z0), camera.ground(x1, z1), camera.ground(x0, z1)];
    return corners.filter((c): c is Projected => c !== null).map((c) => pt(c.sx, c.sy));
  };
  g.fillStyle(PITCH).fillPoints(quad(-2.4, PITCH_M + 2.4, -1.55, 1.55), true);
  g.fillStyle(PITCH_WORN, 0.7).fillPoints(quad(5, 9, -0.9, 0.9), true);
  g.fillStyle(PITCH_WORN, 0.7).fillPoints(quad(PITCH_M - 9, PITCH_M - 5, -0.9, 0.9), true);

  g.fillStyle(0xf8fafc, 0.9);
  for (const x of [1.22, PITCH_M - 1.22]) g.fillPoints(quad(x - 0.05, x + 0.05, -1.4, 1.4), true);
  for (const x of [0, PITCH_M]) g.fillPoints(quad(x - 0.04, x + 0.04, -1.32, 1.32), true);
  for (const z of [-1.32, 1.32]) {
    g.fillPoints(quad(0, 1.22, z - 0.04, z + 0.04), true);
    g.fillPoints(quad(PITCH_M - 1.22, PITCH_M, z - 0.04, z + 0.04), true);
  }
}
