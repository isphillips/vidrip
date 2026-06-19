import React from 'react';
import {
  Group, Circle, Rect, RoundedRect, Path, Skia, LinearGradient, RadialGradient,
  BlurMask, vec, type SkPath,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rnd, STAR5 } from './shapes';
import { Bubble } from './environment';

// ─── Photoreal art primitives ───────────────────────────────────────────────────
// Heavier, "looks like a real object/material" building blocks — distinct from the light atmospheric
// layers in environment.tsx. Each is drawn in UNIT space (centred on the origin, ~1 wide) so a lens
// can place/scale/rotate it with a single Group transform, OR is a self-contained animated field the
// lens drops in at pixel coords. Animated repeats are child components (never hooks in a .map()).

// ═══ Fire — ember storm ═════════════════════════════════════════════════════════
// One rising ember: a white-hot core inside an orange bloom that accelerates upward, twinkles, then
// burns out. Reads as a real spark, not a dot. Anchored at pixel (x0,y0).
function Ember({ x0, y0, sway, rise, size, dur, base, hot, clock }: {
  x0: number; y0: number; sway: number; rise: number; size: number; dur: number; base: number;
  hot: boolean; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const cx = useDerivedValue(() => x0 + Math.sin(v.value * Math.PI * 2 + base * 6) * sway * (0.4 + v.value));
  const cy = useDerivedValue(() => y0 - Math.pow(v.value, 1.25) * rise);
  const op = useDerivedValue(() => {
    const t = v.value;
    const fade = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92;
    const tw = 0.5 + 0.5 * Math.sin(clock.value * 22 + base * 11);
    return Math.max(0, fade) * (0.55 + 0.45 * tw);
  });
  const glowR = useDerivedValue(() => size * 2.6 * (1 - v.value * 0.35));
  const coreR = useDerivedValue(() => size * (1 - v.value * 0.45));
  return (
    <Group opacity={op}>
      <Circle cx={cx} cy={cy} r={glowR} color={hot ? '#FF7A12' : '#FF4500'}><BlurMask blur={6} style="normal" /></Circle>
      <Circle cx={cx} cy={cy} r={coreR} color="#FFE8A0"><BlurMask blur={1.4} style="solid" /></Circle>
    </Group>
  );
}

// A storm of embers lifting from a baseline band centred on (x,y) `width` wide. Drop one over any
// fire for the "epic" upgrade.
export function EmberField({ x, y, width, count, rise, size, clock, seed = 0 }: {
  x: number; y: number; width: number; count: number; rise: number; size: number;
  clock: SharedValue<number>; seed?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const k = i + seed * 97;
        return (
          <Ember key={i} x0={x + (rnd(k) - 0.5) * width} y0={y + (rnd(k, 2) - 0.5) * size * 3}
            sway={size * (2 + rnd(k, 3) * 3)} rise={rise * (0.7 + rnd(k, 4) * 0.6)}
            size={size * (0.5 + rnd(k, 5) * 0.9)} dur={1.0 + rnd(k, 6) * 1.4}
            base={rnd(k, 7)} hot={i % 2 === 0} clock={clock} />
        );
      })}
    </>
  );
}

// ═══ Money — US currency ═════════════════════════════════════════════════════════
// A banknote in unit space: width 1, height 0.43 (~real bill aspect). Engraved double frame, an oval
// portrait medallion, twin treasury seals, corner denomination blocks, and fine guilloché arcs — so
// it reads as a real "greenback" rather than a green rectangle. Drawn at the origin; caller scales it.
const NOTE_W = 0.5, NOTE_H = 0.215; // half-extents
const GUILLOCHE: SkPath = (() => {
  const p = Skia.Path.Make();
  for (let i = 0; i < 5; i++) {
    const y = -NOTE_H * 0.66 + (i / 4) * NOTE_H * 1.32;
    p.moveTo(-NOTE_W * 0.9, y);
    for (let x = -NOTE_W * 0.9; x <= NOTE_W * 0.9; x += NOTE_W * 0.06) {
      p.lineTo(x, y + Math.sin(x * 26 + i) * NOTE_H * 0.05);
    }
  }
  return p;
})();
const PORTRAIT: SkPath = (() => { const p = Skia.Path.Make(); p.addOval(Skia.XYWHRect(-0.11, -0.135, 0.22, 0.27)); return p; })();

export function Banknote() {
  return (
    <Group>
      {/* paper field — aged greenback */}
      <RoundedRect x={-NOTE_W} y={-NOTE_H} width={NOTE_W * 2} height={NOTE_H * 2} r={0.012}>
        <LinearGradient start={vec(0, -NOTE_H)} end={vec(0, NOTE_H)} colors={['#D8E6CF', '#BCD2AE', '#A6C297']} />
      </RoundedRect>
      {/* fine engraving lines across the field */}
      <Path path={GUILLOCHE} style="stroke" strokeWidth={0.0035} color="rgba(40,90,55,0.28)" />
      {/* engraved double frame */}
      <RoundedRect x={-NOTE_W * 0.95} y={-NOTE_H * 0.88} width={NOTE_W * 1.9} height={NOTE_H * 1.76} r={0.01} style="stroke" strokeWidth={0.01} color="#2E6B45" />
      <RoundedRect x={-NOTE_W * 0.9} y={-NOTE_H * 0.78} width={NOTE_W * 1.8} height={NOTE_H * 1.56} r={0.008} style="stroke" strokeWidth={0.004} color="rgba(46,107,69,0.7)" />
      {/* central portrait medallion */}
      <Path path={PORTRAIT}><RadialGradient c={vec(0, -0.02)} r={0.17} colors={['#EAF0E4', '#9FB892', '#5C7A52']} /></Path>
      <Path path={PORTRAIT} style="stroke" strokeWidth={0.008} color="#2E6B45" />
      {/* a suggested bust inside the oval (shoulders + head) */}
      <Circle cx={0} cy={-0.035} r={0.052} color="rgba(60,90,60,0.55)" />
      <Path path={(() => { const p = Skia.Path.Make(); p.moveTo(-0.09, 0.1); p.quadTo(0, 0.0, 0.09, 0.1); p.lineTo(0.09, 0.13); p.lineTo(-0.09, 0.13); p.close(); return p; })()} color="rgba(60,90,60,0.5)" />
      {/* twin treasury/federal seals */}
      {[-1, 1].map((s) => (
        <Group key={s}>
          <Circle cx={s * 0.3} cy={0} r={0.07} color="rgba(40,90,55,0.18)" />
          <Circle cx={s * 0.3} cy={0} r={0.07} style="stroke" strokeWidth={0.006} color={s < 0 ? '#2E6B45' : '#5A3A2A'} />
          <Circle cx={s * 0.3} cy={0} r={0.045} style="stroke" strokeWidth={0.004} color={s < 0 ? 'rgba(46,107,69,0.6)' : 'rgba(90,58,42,0.6)'} />
        </Group>
      ))}
      {/* corner denomination blocks */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
        <RoundedRect key={i} x={sx * NOTE_W * 0.78 - 0.05} y={sy * NOTE_H * 0.62 - 0.025} width={0.1} height={0.05} r={0.008} color="rgba(30,80,48,0.85)" />
      ))}
    </Group>
  );
}

// ═══ Money — gold coin ═══════════════════════════════════════════════════════════
// A reeded (ridged) edge built once as a tick ring; the caller draws the face on top. r=0.5 unit.
const REEDS: SkPath = (() => {
  const p = Skia.Path.Make();
  const n = 56;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    p.moveTo(c * 0.46, s * 0.46);
    p.lineTo(c * 0.5, s * 0.5);
  }
  return p;
})();

// A gold coin in unit space (r 0.5). Reeded edge, beveled face, embossed star relief, and a specular
// streak whose angle the caller can leave static — the spin squash is applied by the faller's scaleX.
export function GoldCoin() {
  return (
    <Group>
      {/* edge body */}
      <Circle cx={0} cy={0} r={0.5}><RadialGradient c={vec(-0.12, -0.12)} r={0.62} colors={['#FFF6C0', '#FFD23C', '#D49A12', '#8A5A0C']} /></Circle>
      {/* reeded ridges around the rim */}
      <Path path={REEDS} style="stroke" strokeWidth={0.018} color="rgba(120,80,8,0.55)" />
      {/* raised inner rim */}
      <Circle cx={0} cy={0} r={0.4} style="stroke" strokeWidth={0.03} color="rgba(255,245,190,0.6)" />
      <Circle cx={0} cy={0} r={0.4} style="stroke" strokeWidth={0.012} color="#A86A12" />
      {/* recessed inner field */}
      <Circle cx={0} cy={0} r={0.37}><RadialGradient c={vec(0.1, 0.1)} r={0.5} colors={['#C8860F', '#FFD24A', '#E8A21E']} /></Circle>
      {/* embossed star (relief: dark drop + bright top-light) */}
      <Group transform={[{ translateY: 0.02 }, { scale: 0.62 }]}><Path path={STAR5} color="rgba(120,78,8,0.7)" /></Group>
      <Group transform={[{ translateY: -0.005 }, { scale: 0.6 }]}><Path path={STAR5}><LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#FFF3C0', '#E8A21E']} /></Path></Group>
      {/* specular streak */}
      <Group transform={[{ rotate: -0.6 }]}>
        <RoundedRect x={-0.06} y={-0.5} width={0.12} height={1} r={0.06} color="rgba(255,255,255,0.35)"><BlurMask blur={0.04} style="normal" /></RoundedRect>
      </Group>
    </Group>
  );
}

// ═══ Disco ball — drops in from the top ══════════════════════════════════════════
// One mirror tile that catches the light on its own cycle (the sphere's "sparkle").
function Tile({ x, y, s, base, clock }: { x: number; y: number; s: number; base: number; clock: SharedValue<number> }) {
  const op = useDerivedValue(() => 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(clock.value * 1.6 + base * 3)), 3));
  const col = useDerivedValue(() => {
    const t = (Math.sin(clock.value * 1.6 + base * 3) + 1) / 2;
    return t > 0.66 ? '#FF6FE0' : t > 0.33 ? '#7FE8FF' : '#FFFFFF';
  });
  return <Rect x={x} y={y} width={s} height={s} color={col} opacity={op} />;
}

// A faceted mirror ball hanging by a chain from the top edge. It descends on entry (first ~1.1s),
// settles, bobs, and slowly spins (faked by a horizontal squash). `cx` = its resting x; `topY` the
// top edge it hangs from; `cy` its resting centre; `r` its radius.
export function DiscoBall({ cx, topY, cy, r, clock }: {
  cx: number; topY: number; cy: number; r: number; clock: SharedValue<number>;
}) {
  // Build a static lat/long tile grid clipped to the sphere.
  const tiles: { x: number; y: number; s: number; base: number }[] = [];
  const ROWS = 11, COLS = 14;
  for (let row = 0; row < ROWS; row++) {
    const ny = (row / (ROWS - 1) - 0.5) * 2;           // -1..1
    const rowR = Math.sqrt(Math.max(0, 1 - ny * ny));   // circle half-width at this latitude
    const tileH = (2 * r / ROWS) * 0.92;
    for (let cIdx = 0; cIdx < COLS; cIdx++) {
      const nx = (cIdx / (COLS - 1) - 0.5) * 2 * rowR;
      const tileW = (2 * r * rowR / COLS) * 0.92 || 0;
      if (tileW < 0.5) { continue; }
      tiles.push({ x: nx * r - tileW / 2, y: ny * r - tileH / 2, s: Math.min(tileW, tileH) * 1.4, base: rnd(row * COLS + cIdx) });
    }
  }
  const ballClip = (() => { const p = Skia.Path.Make(); p.addCircle(0, 0, r); return p; })();
  // Drop-in then bob; spin squash on X.
  const dy = useDerivedValue(() => {
    const drop = Math.min(1, clock.value / 1.1);
    const ease = 1 - Math.pow(1 - drop, 3);
    const settled = cy * ease + (topY - r) * (1 - ease);
    return settled + Math.sin(clock.value * 1.4) * r * 0.05 * ease;
  });
  const spin = useDerivedValue(() => [{ translateX: cx }, { translateY: dy.value }, { scaleX: Math.cos(clock.value * 0.9) }]);
  const tf = useDerivedValue(() => [{ translateX: cx }, { translateY: dy.value }]);
  return (
    <>
      {/* chain from the ceiling to the ball top */}
      <ChainLink cx={cx} topY={topY} dy={dy} r={r} />
      {/* sphere base shading */}
      <Group transform={spin}>
        <Group clip={ballClip}>
          <Circle cx={0} cy={0} r={r}><RadialGradient c={vec(-r * 0.3, -r * 0.4)} r={r * 1.5} colors={['#F4F8FF', '#9AA6BC', '#3A4253', '#161A22']} /></Circle>
          {tiles.map((t, i) => <Tile key={i} x={t.x} y={t.y} s={t.s} base={t.base} clock={clock} />)}
          {/* grout darkening between tiles */}
          <Circle cx={0} cy={0} r={r} style="stroke" strokeWidth={r * 0.02} color="rgba(0,0,0,0.25)" />
        </Group>
        {/* bright top-left specular hotspot */}
        <Circle cx={-r * 0.32} cy={-r * 0.38} r={r * 0.28} color="rgba(255,255,255,0.7)"><BlurMask blur={r * 0.18} style="normal" /></Circle>
      </Group>
      {/* mounting cap */}
      <Group transform={tf}>
        <RoundedRect x={-r * 0.16} y={-r * 1.12} width={r * 0.32} height={r * 0.22} r={r * 0.05} color="#C9CDD6" />
      </Group>
    </>
  );
}
function ChainLink({ cx, topY, dy, r }: { cx: number; topY: number; dy: SharedValue<number>; r: number }) {
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    p.moveTo(cx, topY);
    p.lineTo(cx, dy.value - r * 1.05);
    return p;
  });
  return <Path path={path} style="stroke" strokeWidth={2} color="rgba(150,150,160,0.7)" />;
}

// ═══ Toxic spill — knocked-over hazmat drum ═══════════════════════════════════════
// A steel 55-gal drum lying on its side, leaking a glossy green ooze puddle, stenciled with a hazard
// band. Drawn at pixel coords (it's a background prop, not face-anchored). `s` ≈ drum length.
export function ToxicSpill({ x, y, s, biohazard, clock }: {
  x: number; y: number; s: number; biohazard: SkPath; clock: SharedValue<number>;
}) {
  const puddleR = s * 0.95;
  const shimmer = useDerivedValue(() => 0.5 + 0.12 * Math.sin(clock.value * 2));
  // irregular ooze puddle
  const puddle = (() => {
    const p = Skia.Path.Make();
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = puddleR * (0.7 + rnd(i, 3) * 0.5) * (1 + 0.4 * Math.cos(a)); // wider downhill
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.42 + s * 0.18;
      if (i === 0) { p.moveTo(px, py); } else { p.lineTo(px, py); }
    }
    p.close();
    return p;
  })();
  const drumH = s * 0.5, drumW = s * 0.9;
  return (
    <Group>
      {/* toxic ground glow */}
      <Circle cx={x} cy={y + s * 0.2} r={s * 1.1} opacity={shimmer}>
        <RadialGradient c={vec(x, y + s * 0.2)} r={s * 1.1} colors={['rgba(150,255,40,0.4)', 'rgba(60,160,0,0)']} />
        <BlurMask blur={20} style="normal" />
      </Circle>
      {/* ooze puddle with glossy top */}
      <Path path={puddle}><LinearGradient start={vec(x, y - puddleR)} end={vec(x, y + puddleR)} colors={['#B6FF2E', '#5FCC18', '#2E7A0C']} /></Path>
      <Path path={puddle} opacity={0.5}><LinearGradient start={vec(x - puddleR, y)} end={vec(x + puddleR, y)} colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']} /></Path>
      {/* the drum, knocked over (lying nearly horizontal, tilted as if it tumbled) */}
      <Group transform={[{ translateX: x - s * 0.15 }, { translateY: y - s * 0.05 }, { rotate: -0.32 }]}>
        <RoundedRect x={-drumW / 2} y={-drumH / 2} width={drumW} height={drumH} r={drumH * 0.16}>
          <LinearGradient start={vec(0, -drumH / 2)} end={vec(0, drumH / 2)} colors={['#7C8794', '#48515C', '#2C333B', '#565E68']} />
        </RoundedRect>
        {/* rolling rings */}
        {[-0.28, 0.0, 0.28].map((o, i) => (
          <RoundedRect key={i} x={o * drumW - drumW * 0.02} y={-drumH / 2} width={drumW * 0.04} height={drumH} r={2} color="rgba(20,24,28,0.6)" />
        ))}
        {/* end-cap lip (open, leaking) */}
        <RoundedRect x={-drumW / 2 - drumW * 0.03} y={-drumH / 2} width={drumW * 0.06} height={drumH} r={3}>
          <LinearGradient start={vec(0, -drumH / 2)} end={vec(0, drumH / 2)} colors={['#3A424C', '#1A1F24']} />
        </RoundedRect>
        {/* hazard label band + stenciled trefoil */}
        <RoundedRect x={-drumW * 0.16} y={-drumH * 0.34} width={drumW * 0.32} height={drumH * 0.68} r={4} color="#E8C400" />
        <Group transform={[{ scale: drumH * 0.42 }]}><Path path={biohazard} color="#1A1A1A" /></Group>
      </Group>
      {/* toxic bubbles rising off the puddle */}
      {Array.from({ length: 6 }).map((_, i) => (
        <Bubble key={i} x0={x + (rnd(i, 7) - 0.5) * puddleR * 1.4} y0={y + s * 0.18}
          sway={s * 0.08} travel={-s * (0.8 + rnd(i, 8) * 0.7)} size={s * (0.05 + rnd(i, 9) * 0.06)}
          dur={2 + rnd(i, 10) * 2} base={rnd(i, 11)} color="rgba(190,255,90,0.8)" clock={clock} />
      ))}
    </Group>
  );
}

// ═══ Ice ══════════════════════════════════════════════════════════════════════════
// A translucent tapering icicle hanging from (x,y), `len` long, `wide` at the top. Frosted gradient
// body, a bright refractive edge highlight, and a swelling melt-drip at the tip.
export function Icicle({ x, y, len, wide, base, clock }: {
  x: number; y: number; len: number; wide: number; base: number; clock: SharedValue<number>;
}) {
  const body = (() => {
    const p = Skia.Path.Make();
    p.moveTo(-wide / 2, 0);
    p.lineTo(wide / 2, 0);
    p.lineTo(wide * 0.08, len * 0.7);
    p.lineTo(0, len);             // sharp tip
    p.lineTo(-wide * 0.08, len * 0.7);
    p.close();
    return p;
  })();
  const glint = (() => { const p = Skia.Path.Make(); p.moveTo(-wide * 0.1, len * 0.1); p.lineTo(0, len * 0.92); return p; })();
  const dripY = useDerivedValue(() => { const t = ((clock.value / 2.6 + base) % 1 + 1) % 1; return len + t * len * 0.5; });
  const dripOp = useDerivedValue(() => { const t = ((clock.value / 2.6 + base) % 1 + 1) % 1; return t < 0.6 ? 0 : (t - 0.6) / 0.4; });
  const dripR = useDerivedValue(() => { const t = ((clock.value / 2.6 + base) % 1 + 1) % 1; return wide * 0.22 * Math.min(1, t * 1.4); });
  return (
    <Group transform={[{ translateX: x }, { translateY: y }]}>
      <Path path={body}>
        <LinearGradient start={vec(0, 0)} end={vec(0, len)} colors={['#EAF7FF', '#A9D8F5', '#6FB4E0', 'rgba(120,180,230,0.55)']} />
      </Path>
      {/* refractive bright edge */}
      <Path path={body} style="stroke" strokeWidth={Math.max(1, wide * 0.08)} color="rgba(255,255,255,0.75)" />
      {/* inner core glint */}
      <Path path={glint} style="stroke" strokeWidth={Math.max(0.8, wide * 0.05)} color="rgba(255,255,255,0.6)" />
      {/* melt drip */}
      <Circle cx={0} cy={dripY} r={dripR} color="rgba(210,240,255,0.9)" opacity={dripOp} />
    </Group>
  );
}

// A frozen-over glaze hugging the face: a frosty rime ring (clear centre so the face shows) plus a few
// crystalline frost ferns creeping in from the edges. Centre at (x,y), `r` ≈ face radius.
export function FrostGlaze({ x, y, r, clock }: { x: number; y: number; r: number; clock: SharedValue<number> }) {
  // frost-fern: a recursive-looking branch built statically.
  const fern = (ang: number, scale: number): SkPath => {
    const p = Skia.Path.Make();
    p.moveTo(0, 0);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * scale;
      p.lineTo(Math.cos(ang) * d, Math.sin(ang) * d);
      const bl = scale * 0.22 * (1 - i / steps);
      const bx = Math.cos(ang) * d, by = Math.sin(ang) * d;
      p.moveTo(bx, by); p.lineTo(bx + Math.cos(ang + 0.9) * bl, by + Math.sin(ang + 0.9) * bl);
      p.moveTo(bx, by); p.lineTo(bx + Math.cos(ang - 0.9) * bl, by + Math.sin(ang - 0.9) * bl);
      p.moveTo(bx, by);
    }
    return p;
  };
  const breath = useDerivedValue(() => 0.55 + 0.18 * Math.sin(clock.value * 1.3));
  return (
    <Group>
      {/* frozen rime around the face (clear in the middle) */}
      <Circle cx={x} cy={y} r={r * 1.15} opacity={breath}>
        <RadialGradient c={vec(x, y)} r={r * 1.15} colors={['rgba(230,248,255,0)', 'rgba(230,248,255,0)', 'rgba(214,238,255,0.55)', 'rgba(170,210,245,0.85)']} />
      </Circle>
      {/* crystalline ferns creeping from a few points around the rim */}
      {[0.35, 1.4, 2.5, 3.5, 4.6, 5.6].map((a, i) => {
        const px = x + Math.cos(a) * r * 0.95, py = y + Math.sin(a) * r * 0.95;
        return (
          <Group key={i} transform={[{ translateX: px }, { translateY: py }]} opacity={0.8}>
            <Path path={fern(a + Math.PI + (rnd(i) - 0.5) * 0.5, r * (0.4 + rnd(i, 2) * 0.3))} style="stroke" strokeWidth={1.3} color="rgba(245,252,255,0.9)">
              <BlurMask blur={1} style="solid" />
            </Path>
          </Group>
        );
      })}
    </Group>
  );
}
