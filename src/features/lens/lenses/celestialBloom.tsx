import React from 'react';
import { Group, Circle, Path, LinearGradient, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, PETAL, Sparkle, Drifter, FACE_OVAL, type LensProps, type Pt } from '../core';

// INTERACTION LENS (smile) — grin and a garland of cosmic blossoms unfurls around your face. The
// flowers are pinned to your ACTUAL face-mesh outline (FACE_OVAL), a nebula halo blooms behind your
// head, and stardust drifts upward. Everything scales with f.smile (the mesh `smile` blendshape); a
// faint idle bloom keeps it alive when blendshapes aren't available (BlazeFace builds / replay).

const BLOOM_COLORS = ['#FF8AD0', '#A98CFF', '#6BE5FF', '#FFD58A', '#FF6FA5', '#8AF0C0'];

// One cosmic flower: six petals around a glowing pistil, slowly turning + breathing on the clock.
function Blossom({ x, y, size, base, color, clock }: {
  x: number; y: number; size: number; base: number; color: string; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => {
    const breathe = 0.82 + 0.18 * Math.sin(clock.value * 1.6 + base);
    return [{ translateX: x }, { translateY: y }, { rotate: clock.value * 0.35 + base }, { scale: size * breathe }];
  });
  const PETALS = 6;
  return (
    <Group transform={tf}>
      {Array.from({ length: PETALS }).map((_, i) => (
        <Group key={i} transform={[{ rotate: (i / PETALS) * Math.PI * 2 }, { translateY: -0.26 }]}>
          <Path path={PETAL}>
            <LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={[color, 'rgba(255,255,255,0.12)']} />
          </Path>
        </Group>
      ))}
      <Circle cx={0} cy={0} r={0.17} color="#FFE9A8" />
      <Circle cx={0} cy={0} r={0.1} color="#FFFFFF" />
    </Group>
  );
}

export function CelestialBloom({ f, clock }: LensProps) {
  const s = 0.16 + (f.smile ?? 0) * 0.84; // idle shimmer → full bloom on a wide grin
  const headC = off(f, f.eyeMid, -f.faceW * 0.1, 0);

  // Garland anchors: trace the real face-mesh oval when present; else an ellipse from the anchors so
  // the lens still works on BlazeFace builds / replay.
  const N = 14;
  const ring: Pt[] = [];
  if (f.mesh) {
    const step = FACE_OVAL.length / N;
    for (let i = 0; i < N; i++) { const p = f.mesh[FACE_OVAL[Math.floor(i * step)]]; if (p) { ring.push(p); } }
  }
  if (ring.length < N) {
    ring.length = 0;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      ring.push(off(f, headC, Math.cos(t) * f.faceW * 0.85, Math.sin(t) * f.faceW * 0.62));
    }
  }

  const flowerSize = f.faceW * (0.085 + s * 0.11);
  return (
    <Group>
      {/* Nebula halo behind the head — blooms with the smile. */}
      <Circle cx={headC.x} cy={headC.y} r={f.faceW * 1.7} opacity={s * 0.6}>
        <RadialGradient c={vec(headC.x, headC.y)} r={f.faceW * 1.7}
          colors={['rgba(255,120,200,0.55)', 'rgba(120,90,255,0.35)', 'rgba(60,30,120,0)']} />
        <BlurMask blur={26} style="normal" />
      </Circle>

      {/* The blossom garland tracing the face. */}
      <Group opacity={Math.min(1, s * 1.25)}>
        {ring.map((p, i) => (
          <Blossom key={i} x={p.x} y={p.y} size={flowerSize} base={i * 1.7}
            color={BLOOM_COLORS[i % BLOOM_COLORS.length]} clock={clock} />
        ))}
      </Group>

      {/* Stardust rising past the face + a few twinkles riding the halo. */}
      <Group opacity={Math.min(1, s * 1.4)}>
        {Array.from({ length: 14 }).map((_, i) => {
          const start = off(f, headC, -f.faceW * 0.9, (rnd(i) - 0.5) * f.faceW * 2.0);
          return <Drifter key={`d${i}`} x0={start.x} y0={start.y} sway={f.faceW * 0.12}
            travel={-f.faceW * (1.1 + rnd(i, 2) * 0.9)} size={f.faceW * (0.012 + rnd(i, 3) * 0.02)}
            dur={1.1 + rnd(i, 4) * 1.1} base={rnd(i, 5)} color={i % 2 ? '#FFE9A8' : '#C9B6FF'} clock={clock} star />;
        })}
        {ring.map((p, i) => i % 3 === 0 ? (
          <Sparkle key={`s${i}`} x={p.x} y={p.y} size={f.faceW * 0.09} base={i} speed={2.4} color="#FFFFFF" clock={clock} />
        ) : null)}
      </Group>
    </Group>
  );
}
