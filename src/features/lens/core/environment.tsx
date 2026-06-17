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
