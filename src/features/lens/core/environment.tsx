import React from 'react';
import { Group, Rect, Circle, Path, Skia, LinearGradient, RadialGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rnd } from './shapes';
import { Drifter } from './primitives';

// ─── Environment primitives ────────────────────────────────────────────────────
// Full-screen atmospheric layers that turn a face decoration into an immersive *world*. They use the
// canvas size (w/h) to cover the whole frame and are drawn BEHIND the face art (low opacity so the
// user still shows through). Compose: a themed vignette (tints the surroundings, keeps the face
// clear) + a light source (glow / god-rays) + ambient drifting motes.

// Radial vignette: transparent in the centre (face stays clear), themed colour creeping in at the
// edges — the cheapest way to feel "inside" a coloured world. Pass colors from transparent → edge.
export function WorldVignette({ w, h, colors, opacity = 1 }: {
  w: number; h: number; colors: string[]; opacity?: number;
}) {
  const cx = w / 2, cy = h / 2;
  const r = Math.hypot(w, h) / 2;
  return (
    <Rect x={0} y={0} width={w} height={h} opacity={opacity}>
      <RadialGradient c={vec(cx, cy)} r={r} colors={colors} />
    </Rect>
  );
}

// A directional colour grade across the whole frame (e.g. cool top, warm bottom). Keep opacity low.
export function ScreenTint({ w, h, colors, opacity = 0.3, vertical = true }: {
  w: number; h: number; colors: string[]; opacity?: number; vertical?: boolean;
}) {
  return (
    <Rect x={0} y={0} width={w} height={h} opacity={opacity}>
      <LinearGradient start={vec(0, 0)} end={vertical ? vec(0, h) : vec(w, 0)} colors={colors} />
    </Rect>
  );
}

// A soft light source — a blurred radial orb. Use for suns, moons, magical glows.
export function GlowOrb({ x, y, r, colors, opacity = 0.6, blur = 30 }: {
  x: number; y: number; r: number; colors: string[]; opacity?: number; blur?: number;
}) {
  return (
    <Circle cx={x} cy={y} r={r} opacity={opacity}>
      <RadialGradient c={vec(x, y)} r={r} colors={colors} />
      <BlurMask blur={blur} style="normal" />
    </Circle>
  );
}

// Volumetric light bloom — three stacked, softening glows (wide faint falloff → mid → tight white
// core) so a light source reads with real depth instead of one flat disc. `inner` = glow colour,
// `outer` = its transparent end (e.g. 'rgba(255,120,0,0)'). Use for suns, halos, holy/magic light.
export function Bloom({ x, y, r, inner, outer, opacity = 0.6 }: {
  x: number; y: number; r: number; inner: string; outer: string; opacity?: number;
}) {
  return (
    <Group opacity={opacity}>
      <Circle cx={x} cy={y} r={r}>
        <RadialGradient c={vec(x, y)} r={r} colors={[inner, outer]} />
        <BlurMask blur={r * 0.22} style="normal" />
      </Circle>
      <Circle cx={x} cy={y} r={r * 0.6}>
        <RadialGradient c={vec(x, y)} r={r * 0.6} colors={[inner, outer]} />
        <BlurMask blur={r * 0.12} style="normal" />
      </Circle>
      <Circle cx={x} cy={y} r={r * 0.3}>
        <RadialGradient c={vec(x, y)} r={r * 0.3} colors={['#FFFFFF', outer]} />
        <BlurMask blur={r * 0.06} style="normal" />
      </Circle>
    </Group>
  );
}

// A realistic puffy cloud centred at (x,y), `scale` ≈ its width. Built from overlapping soft lobes,
// each shaded top-lit → dark-bellied (gradient centre pushed up) and blurred for billowy edges, so it
// reads as volume with soft rounded peaks rather than flat circles. `colors` = [top, mid, base].
// Reuse for storm clouds, sky clouds, fog. Drive `opacity` to flash/illuminate it.
const CLOUD_LOBES = [
  { dx: -0.52, dy: 0.08, r: 0.40 },
  { dx: -0.24, dy: -0.14, r: 0.48 },
  { dx: 0.08, dy: -0.22, r: 0.52 },
  { dx: 0.40, dy: -0.08, r: 0.46 },
  { dx: 0.56, dy: 0.10, r: 0.38 },
  { dx: -0.36, dy: 0.20, r: 0.40 },
  { dx: 0.30, dy: 0.22, r: 0.42 },
  { dx: 0.0, dy: 0.12, r: 0.56 },
];
export function Cloud({ x, y, scale, colors, opacity = 1, blur = 10 }: {
  x: number; y: number; scale: number; colors: [string, string, string]; opacity?: number; blur?: number;
}) {
  return (
    <Group opacity={opacity}>
      {CLOUD_LOBES.map((l, i) => {
        const cx = x + l.dx * scale, cy = y + l.dy * scale, r = l.r * scale;
        return (
          <Circle key={i} cx={cx} cy={cy} r={r}>
            <RadialGradient c={vec(cx, cy - r * 0.5)} r={r * 1.25} colors={colors} />
            <BlurMask blur={blur} style="normal" />
          </Circle>
        );
      })}
    </Group>
  );
}

// One smoke puff: a soft dark blob that rises, drifts, swells, and fades — the realistic plume above
// any flame.
function SmokePuff({ x, y, size, travel, dur, base, color, clock }: {
  x: number; y: number; size: number; travel: number; dur: number; base: number; color: string; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const cx = useDerivedValue(() => x + Math.sin((v.value + base) * 4) * size * 0.6);
  const cy = useDerivedValue(() => y + v.value * travel);
  const r = useDerivedValue(() => size * (0.5 + v.value * 1.3));
  const op = useDerivedValue(() => { const t = v.value; return (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.55; });
  return <Circle cx={cx} cy={cy} r={r} color={color} opacity={op}><BlurMask blur={14} style="normal" /></Circle>;
}

// A column of rising smoke from (x,y). `travel` negative rises; reuse over fires, chimneys, embers.
export function Smoke({ x, y, count, size, travel, color = 'rgba(38,38,44,0.7)', seed = 0, clock }: {
  x: number; y: number; count: number; size: number; travel: number; color?: string; seed?: number; clock: SharedValue<number>;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SmokePuff key={i} x={x + (rnd(i + seed) - 0.5) * size * 2} y={y} size={size * (0.7 + rnd(i + seed, 2) * 0.6)}
          travel={travel} dur={2.6 + rnd(i + seed, 3) * 2} base={rnd(i + seed, 4)} color={color} clock={clock} />
      ))}
    </>
  );
}

// A realistic rising bubble: a near-invisible body with a bright rim and a small specular highlight,
// wobbling up and fading. Anchor to a face/mesh point and reuse for underwater / soda / potion looks.
export function Bubble({ x0, y0, sway, travel, size, dur, base, color = 'rgba(205,240,255,0.75)', clock }: {
  x0: number; y0: number; sway: number; travel: number; size: number; dur: number; base: number; color?: string; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const cx = useDerivedValue(() => x0 + Math.sin((v.value + base) * Math.PI * 3) * sway);
  const cy = useDerivedValue(() => y0 + v.value * travel);
  const hlx = useDerivedValue(() => cx.value - size * 0.32);
  const hly = useDerivedValue(() => cy.value - size * 0.32);
  const op = useDerivedValue(() => { const t = v.value; return t < 0.1 ? t / 0.1 : (t > 0.92 ? (1 - t) / 0.08 : 1); });
  return (
    <Group opacity={op}>
      <Circle cx={cx} cy={cy} r={size} color="rgba(180,225,255,0.1)" />
      <Circle cx={cx} cy={cy} r={size} style="stroke" strokeWidth={Math.max(1, size * 0.14)} color={color} />
      <Circle cx={hlx} cy={hly} r={size * 0.22} color="rgba(255,255,255,0.85)" />
    </Group>
  );
}

// A seamless sheet of falling rain across the whole frame: one random band of streaks tiled to cover
// the height and scrolled by exactly one band per loop (so it never jumps). `speed` ≈ loops/sec.
export function RainSheet({ w, h, clock, color = 'rgba(185,210,240,0.5)', speed = 0.9, density = 16 }: {
  w: number; h: number; clock: SharedValue<number>; color?: string; speed?: number; density?: number;
}) {
  const drop = h * 0.16;
  const band = Skia.Path.Make();
  for (let i = 0; i < density; i++) {
    const x = rnd(i, 1) * w;
    const y = rnd(i, 2) * drop;
    const len = drop * (0.35 + rnd(i, 3) * 0.45);
    band.moveTo(x, y); band.lineTo(x + 2, y + len);
  }
  const rows = Math.ceil(h / drop) + 1;
  const ty = useDerivedValue(() => [{ translateY: ((clock.value * speed) % 1) * drop - drop }]);
  return (
    <Group transform={ty}>
      {Array.from({ length: rows }).map((_, r) => (
        <Group key={r} transform={[{ translateY: r * drop }]}>
          <Path path={band} style="stroke" strokeWidth={1.3} strokeCap="round" color={color} />
        </Group>
      ))}
    </Group>
  );
}

// Unit beam: apex at the origin, widening downward to y=1 (half-width 0.5). Scaled/rotated per ray.
const BEAM: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, 0);
  p.lineTo(-0.5, 1);
  p.lineTo(0.5, 1);
  p.close();
  return p;
})();

// Volumetric "god rays" — translucent light shafts fanning from a source point, gently swaying and
// breathing. Great for sun-through-water, divine light, club beams.
export function GodRays({ w, h, x, y, color, count = 7, spread = 1.4, length, width, clock, opacity = 0.5 }: {
  w: number; h: number; x: number; y: number; color: string; count?: number; spread?: number;
  length?: number; width?: number; clock: SharedValue<number>; opacity?: number;
}) {
  const len = length ?? Math.hypot(w, h);
  const bw = width ?? len * 0.16;
  const sway = useDerivedValue(() => [{ rotate: Math.sin(clock.value * 0.35) * 0.05 }]);
  const breathe = useDerivedValue(() => opacity * (0.7 + 0.3 * Math.sin(clock.value * 0.8)));
  return (
    <Group origin={vec(x, y)} transform={sway} opacity={breathe}>
      {Array.from({ length: count }).map((_, i) => {
        const a = (i / (count - 1) - 0.5) * spread;        // fan angle around straight-down
        const flick = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.7));
        return (
          <Group key={i} origin={vec(x, y)} transform={[{ translateX: x }, { translateY: y }, { rotate: a }, { scaleX: bw * (0.6 + flick * 0.7) }, { scaleY: len }]}>
            <Path path={BEAM} opacity={0.5 + flick * 0.5}>
              <LinearGradient start={vec(0, 0)} end={vec(0, 1)} colors={[color, 'rgba(255,255,255,0)']} />
              <BlurMask blur={0.06} style="normal" />
            </Path>
          </Group>
        );
      })}
    </Group>
  );
}

// Ambient drifting motes across the whole frame (dust, plankton, embers, snow, bokeh). Direction +1
// = downward, -1 = rising. Reuses the looping Drifter so each mote sways + fades on its own cycle.
export function Motes({ w, h, count, color, clock, dir = 1, sizeMin = 1.5, sizeMax = 5, star = false, seed = 0 }: {
  w: number; h: number; count: number; color: string; clock: SharedValue<number>;
  dir?: 1 | -1; sizeMin?: number; sizeMax?: number; star?: boolean; seed?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const k = i + seed * 1000;
        const x0 = rnd(k) * w;
        const y0 = dir > 0 ? -h * 0.1 + rnd(k, 2) * h * 0.2 : h * (0.9 + rnd(k, 2) * 0.2);
        return (
          <Drifter key={i} x0={x0} y0={y0}
            sway={w * (0.02 + rnd(k, 3) * 0.05)} travel={dir * h * (1.0 + rnd(k, 4) * 0.4)}
            size={sizeMin + rnd(k, 5) * (sizeMax - sizeMin)} dur={3 + rnd(k, 6) * 4}
            base={rnd(k, 7)} color={color} clock={clock} star={star} />
        );
      })}
    </>
  );
}
