import { Skia, type SkPath } from '@shopify/react-native-skia';

// ─── Reusable Skia shapes ────────────────────────────────────────────────────
// Built once in JS at unit scale (centered on the origin), then placed/sized/animated by each lens
// via a Group transform. Gradient coords in the lenses live in this same unit space.

export const HEART: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, 0.4);
  p.cubicTo(0.55, 0.0, 0.5, -0.45, 0, -0.18);
  p.cubicTo(-0.5, -0.45, -0.55, 0.0, 0, 0.4);
  p.close();
  return p;
})();

export const FLAME: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, -0.5);
  p.cubicTo(0.45, -0.12, 0.4, 0.45, 0, 0.5);
  p.cubicTo(-0.4, 0.45, -0.45, -0.12, 0, -0.5);
  p.close();
  return p;
})();

// 4-point sparkle (concave star) for twinkles / stardust.
export const STAR4: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, -0.5);
  p.cubicTo(0.1, -0.1, 0.1, -0.1, 0.5, 0);
  p.cubicTo(0.1, 0.1, 0.1, 0.1, 0, 0.5);
  p.cubicTo(-0.1, 0.1, -0.1, 0.1, -0.5, 0);
  p.cubicTo(-0.1, -0.1, -0.1, -0.1, 0, -0.5);
  p.close();
  return p;
})();

// 5-point star (convex) for badges / confetti.
export const STAR5: SkPath = (() => {
  const p = Skia.Path.Make();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 0.5 : 0.22;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) { p.moveTo(x, y); } else { p.lineTo(x, y); }
  }
  p.close();
  return p;
})();

// Faceted ice crystal for the Frost crown.
export const CRYSTAL: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, -0.5);
  p.lineTo(0.26, -0.12);
  p.lineTo(0.15, 0.5);
  p.lineTo(-0.15, 0.5);
  p.lineTo(-0.26, -0.12);
  p.close();
  return p;
})();

// Teardrop (point up, round bottom) for rain / blood / dew.
export const TEARDROP: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, -0.5);
  p.cubicTo(0.34, -0.05, 0.3, 0.5, 0, 0.5);
  p.cubicTo(-0.3, 0.5, -0.34, -0.05, 0, -0.5);
  p.close();
  return p;
})();

// Flower petal / leaf (point at top, round belly) for blossoms.
export const PETAL: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, -0.5);
  p.cubicTo(0.38, -0.18, 0.26, 0.5, 0, 0.5);
  p.cubicTo(-0.26, 0.5, -0.38, -0.18, 0, -0.5);
  p.close();
  return p;
})();

// A classic ghost silhouette (unit, centered): rounded dome head, scalloped wavy hem.
export const GHOST: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.4, 0.46);
  p.lineTo(-0.4, -0.06);
  p.cubicTo(-0.4, -0.46, 0.4, -0.46, 0.4, -0.06);
  p.lineTo(0.4, 0.46);
  p.cubicTo(0.28, 0.3, 0.22, 0.62, 0.13, 0.46);
  p.cubicTo(0.05, 0.3, -0.05, 0.62, -0.13, 0.46);
  p.cubicTo(-0.22, 0.3, -0.28, 0.62, -0.4, 0.46);
  p.close();
  return p;
})();

// One butterfly wing (the RIGHT side; body at the origin, wing reaching to +x). Mirror with
// scaleX:-1 for the left wing. Two lobes — a large upper and a rounded lower.
export const WING: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, 0);
  p.cubicTo(0.1, -0.46, 0.52, -0.5, 0.54, -0.12);
  p.cubicTo(0.55, 0.02, 0.3, 0.06, 0, 0.02);
  p.cubicTo(0.3, 0.08, 0.44, 0.3, 0.31, 0.47);
  p.cubicTo(0.19, 0.57, 0.04, 0.42, 0, 0.05);
  p.close();
  return p;
})();

// A bat silhouette (unit, centered, wings spread) for spooky lenses.
export const BAT: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, -0.06);
  p.cubicTo(-0.14, -0.26, -0.4, -0.22, -0.5, -0.02);
  p.cubicTo(-0.42, -0.06, -0.34, 0.0, -0.27, 0.12);
  p.cubicTo(-0.28, 0.0, -0.16, -0.02, -0.08, 0.05);
  p.cubicTo(-0.04, 0.12, 0.04, 0.12, 0.08, 0.05);
  p.cubicTo(0.16, -0.02, 0.28, 0.0, 0.27, 0.12);
  p.cubicTo(0.34, 0.0, 0.42, -0.06, 0.5, -0.02);
  p.cubicTo(0.4, -0.22, 0.14, -0.26, 0, -0.06);
  p.close();
  return p;
})();

// A 3-spike royal crown (unit, centered; spikes point up, band along the bottom).
export const CROWN: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.5, 0.25);
  p.lineTo(-0.5, -0.05);
  p.lineTo(-0.28, -0.42);
  p.lineTo(-0.14, -0.08);
  p.lineTo(0, -0.5);
  p.lineTo(0.14, -0.08);
  p.lineTo(0.28, -0.42);
  p.lineTo(0.5, -0.05);
  p.lineTo(0.5, 0.25);
  p.close();
  return p;
})();

// A few pre-built zig-zag lightning bolts (unit, vertical) — animated by opacity flicker.
const makeBolt = (offs: number[]): SkPath => {
  const p = Skia.Path.Make();
  p.moveTo(offs[0], -0.5);
  for (let i = 1; i < offs.length; i++) { p.lineTo(offs[i], -0.5 + i / (offs.length - 1)); }
  return p;
};
export const BOLTS: SkPath[] = [
  makeBolt([0, 0.12, -0.08, 0.06, 0]),
  makeBolt([0, -0.1, 0.1, -0.05, 0]),
  makeBolt([0, 0.08, -0.12, 0.05, -0.02, 0]),
];

// Deterministic pseudo-random in [0,1) from an index — so scattered particles keep a STABLE layout
// across re-renders (Math.random would make them jump every frame as landmarks update).
export const rnd = (i: number, s = 1): number => { const x = Math.sin((i + 1) * 127.1 * s) * 43758.5453; return x - Math.floor(x); };
