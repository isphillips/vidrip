import React from 'react';
import { Group, Circle, Path, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, BOLTS, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A lightning bolt hanging from the cloud, flashing on hard cadence with a flash glow.
function Strike({ x, y, len, idx, base, clock }: {
  x: number; y: number; len: number; idx: number; base: number; clock: SharedValue<number>;
}) {
  const on = useDerivedValue(() => {
    const t = (clock.value * 0.7 + base) % 3;        // strike every ~3s, staggered
    return t < 0.12 || (t > 0.2 && t < 0.3) ? 1 : 0;  // double-flash
  });
  return (
    <>
      <Circle cx={x} cy={y + len * 0.4} r={len * 0.5} opacity={on}>
        <RadialGradient c={vec(x, y + len * 0.4)} r={len * 0.5} colors={['rgba(200,225,255,0.7)', 'rgba(120,170,255,0)']} />
        <BlurMask blur={8} style="normal" />
      </Circle>
      <Group transform={[{ translateX: x }, { translateY: y }, { scaleX: len * 0.5 }, { scaleY: len }]} opacity={on}>
        <Path path={BOLTS[idx % BOLTS.length]} style="stroke" strokeWidth={0.06} color="#EAF2FF" strokeCap="round">
          <BlurMask blur={0.05} style="solid" />
        </Path>
      </Group>
    </>
  );
}

// One lumpy cloud puff.
function Puff({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <Circle cx={x} cy={y} r={r}>
      <RadialGradient c={vec(x, y - r * 0.4)} r={r * 1.3} colors={['#6E7888', '#444C5A', '#2A303A']} />
    </Circle>
  );
}

// A personal raincloud: a gloomy grey world with a dark cloud hovering over the head, forking
// lightning, and rain coming straight down on the wearer.
export function StormCloud({ f, clock, w, h }: LensProps) {
  const c = off(f, f.eyeMid, f.faceW * 1.0, 0);  // cloud sits above the head
  const cw = f.faceW * 1.7;
  const bob = useDerivedValue(() => [{ translateY: Math.sin(clock.value * 1.3) * f.faceW * 0.03 }]);
  // puffs forming a flat-bottomed lumpy cloud
  const puffs = [
    { x: -0.55, y: 0.0, r: 0.4 }, { x: -0.2, y: -0.18, r: 0.5 }, { x: 0.2, y: -0.2, r: 0.52 },
    { x: 0.56, y: 0.0, r: 0.42 }, { x: 0.0, y: 0.08, r: 0.5 },
  ];
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#1A2028', '#2A323E', '#0E1218']} opacity={0.42} />
      <WorldVignette w={w} h={h} colors={['rgba(120,140,170,0)', 'rgba(50,60,80,0.35)', 'rgba(8,12,18,0.78)']} />
      {/* rain */}
      <Motes w={w} h={h} count={40} color="rgba(170,200,235,0.6)" clock={clock} dir={1} sizeMin={1} sizeMax={2.5} seed={81} />

      <Group transform={bob}>
        {/* lightning behind the cloud */}
        <Strike x={c.x - cw * 0.2} y={c.y + cw * 0.2} len={f.faceW * 0.8} idx={0} base={0} clock={clock} />
        <Strike x={c.x + cw * 0.25} y={c.y + cw * 0.18} len={f.faceW * 0.7} idx={2} base={1.6} clock={clock} />
        {/* cloud body */}
        <Group transform={[{ translateX: c.x }, { translateY: c.y }, { scale: cw }]}>
          {puffs.map((p, i) => <Puff key={i} x={p.x} y={p.y} r={p.r} />)}
        </Group>
        {/* soft underside shadow */}
        <GlowOrb x={c.x} y={c.y + cw * 0.25} r={cw * 0.7} colors={['rgba(20,24,32,0.5)', 'rgba(20,24,32,0)']} opacity={0.6} blur={18} />
      </Group>
    </>
  );
}
