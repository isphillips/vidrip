import React from 'react';
import { Group, Circle, Path, RoundedRect, Skia, LinearGradient, RadialGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, Sparkle, ScreenTint, WorldVignette, GodRays, Motes, type LensProps } from '../core';

// ── Unit art paths (centred on origin, ~1 wide) ──────────────────────────────
const make = (build: (p: SkPath) => void): SkPath => { const p = Skia.Path.Make(); build(p); return p; };

// 5-point imperial crown silhouette (spikes up, band along the bottom).
const SPIKES = make(p => {
  p.moveTo(-0.5, 0.12);
  p.lineTo(-0.46, -0.30); p.lineTo(-0.30, -0.04);
  p.lineTo(-0.20, -0.42); p.lineTo(-0.07, -0.02);
  p.lineTo(0, -0.54); p.lineTo(0.07, -0.02);
  p.lineTo(0.20, -0.42); p.lineTo(0.30, -0.04);
  p.lineTo(0.46, -0.30); p.lineTo(0.5, 0.12);
  p.close();
});
const SPIKE_TIPS = [{ x: -0.46, y: -0.30 }, { x: -0.20, y: -0.42 }, { x: 0, y: -0.54 }, { x: 0.20, y: -0.42 }, { x: 0.46, y: -0.30 }];
// Velvet cap arching between the spikes (drawn behind them).
const VELVET = make(p => { p.moveTo(-0.44, 0.12); p.quadTo(0, -0.5, 0.44, 0.12); p.close(); });
// Herald trumpet — tube + flared bell, bell pointing up (-y), mouthpiece at +y.
const TRUMPET = make(p => {
  p.moveTo(-0.055, 0.5); p.lineTo(-0.055, -0.12);
  p.lineTo(-0.34, -0.5); p.lineTo(0.34, -0.5);
  p.lineTo(0.055, -0.12); p.lineTo(0.055, 0.5);
  p.close();
});
// Swallow-tail banner that hangs off the trumpet.
const PENNANT = make(p => {
  p.moveTo(-0.16, 0.02); p.lineTo(0.16, 0.02);
  p.lineTo(0.16, 0.5); p.lineTo(0, 0.38); p.lineTo(-0.16, 0.5);
  p.close();
});

const GOLD = ['#FFF6C8', '#FFD24A', '#E8951E', '#A86A12'];

// A glossy jewel: faceted radial + a bright highlight.
function Jewel({ x, y, r, colors }: { x: number; y: number; r: number; colors: string[] }) {
  return (
    <>
      <Circle cx={x} cy={y} r={r}><RadialGradient c={vec(x, y)} r={r} colors={colors} /></Circle>
      <Circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.28} color="rgba(255,255,255,0.85)" />
    </>
  );
}

// The ornate crown, drawn in unit space (caller scales/rotates/positions it).
function CrownArt() {
  const gems = [
    { x: -0.34, c: ['#FFC2D2', '#FF3B6B', '#9E0030'] },
    { x: -0.12, c: ['#BFefff', '#37E0FF', '#0A6AA0'] },
    { x: 0.12, c: ['#D8FFC8', '#46E06B', '#0C7A2E'] },
    { x: 0.34, c: ['#E6CCFF', '#B36BFF', '#5A1E9E'] },
  ];
  return (
    <>
      {/* velvet cap */}
      <Path path={VELVET}>
        <RadialGradient c={vec(0, -0.1)} r={0.55} colors={['#E0244C', '#9A0A30', '#52041C']} />
      </Path>
      {/* gold spikes */}
      <Path path={SPIKES}>
        <LinearGradient start={vec(0, -0.55)} end={vec(0, 0.12)} colors={GOLD} />
      </Path>
      <Path path={SPIKES} style="stroke" strokeWidth={0.012} color="#7A4A0A" />
      {/* pearls on the spike tips */}
      {SPIKE_TIPS.map((t, i) => (
        <Group key={i}>
          <Circle cx={t.x} cy={t.y} r={0.052}><RadialGradient c={vec(t.x - 0.015, t.y - 0.015)} r={0.06} colors={['#FFFFFF', '#EDE6F5', '#B7AECB']} /></Circle>
          <Circle cx={t.x - 0.016} cy={t.y - 0.016} r={0.015} color="rgba(255,255,255,0.95)" />
        </Group>
      ))}
      {/* gold band */}
      <RoundedRect x={-0.52} y={0.1} width={1.04} height={0.3} r={0.08}>
        <LinearGradient start={vec(0, 0.1)} end={vec(0, 0.4)} colors={['#FFF0B0', '#FFC93C', '#C8860F', '#8A5A0C']} />
      </RoundedRect>
      <RoundedRect x={-0.52} y={0.1} width={1.04} height={0.3} r={0.08} style="stroke" strokeWidth={0.012} color="#7A4A0A" />
      {/* band top-edge highlight */}
      <RoundedRect x={-0.48} y={0.13} width={0.96} height={0.045} r={0.02} color="rgba(255,255,255,0.55)" />
      {/* band gems */}
      {gems.map((g, i) => <Jewel key={i} x={g.x} y={0.27} r={0.058} colors={g.c} />)}
      {/* monde: orb + cross on the centre spike */}
      <Circle cx={0} cy={-0.6} r={0.05}><RadialGradient c={vec(-0.012, -0.612)} r={0.06} colors={GOLD} /></Circle>
      <RoundedRect x={-0.013} y={-0.78} width={0.026} height={0.16} r={0.006} color="#FFD24A" />
      <RoundedRect x={-0.05} y={-0.74} width={0.1} height={0.026} r={0.006} color="#FFD24A" />
    </>
  );
}

// A single herald trumpet with a hanging banner, placed/rotated/scaled by the caller.
function Trumpet({ x, y, angle, size, clock }: {
  x: number; y: number; angle: number; size: number; clock: SharedValue<number>;
}) {
  // a tiny lively waggle so the fanfare feels alive
  const wag = useDerivedValue(() => [
    { translateX: x }, { translateY: y }, { rotate: angle + Math.sin(clock.value * 2.2 + x) * 0.03 }, { scale: size },
  ]);
  return (
    <Group transform={wag}>
      {/* banner */}
      <Path path={PENNANT}>
        <LinearGradient start={vec(0, 0)} end={vec(0, 0.5)} colors={['#FF4FA3', '#A05CFF', '#2DD4BF']} />
      </Path>
      <Path path={PENNANT} style="stroke" strokeWidth={0.012} color="rgba(255,255,255,0.5)" />
      {/* crossbar the banner hangs from */}
      <RoundedRect x={-0.18} y={0.0} width={0.36} height={0.035} r={0.015} color="#E8B33C" />
      {/* trumpet body */}
      <Path path={TRUMPET}>
        <LinearGradient start={vec(-0.34, 0)} end={vec(0.34, 0)} colors={['#A86A12', '#FFE98C', '#FFD24A', '#A86A12']} />
      </Path>
      <Path path={TRUMPET} style="stroke" strokeWidth={0.012} color="#7A4A0A" />
      {/* bell rim */}
      <RoundedRect x={-0.36} y={-0.53} width={0.72} height={0.07} r={0.035}>
        <LinearGradient start={vec(-0.36, 0)} end={vec(0.36, 0)} colors={['#C8860F', '#FFF0B0', '#C8860F']} />
      </RoundedRect>
      {/* valves + mouthpiece */}
      <Circle cx={0} cy={0.18} r={0.05} color="#E8B33C" />
      <Circle cx={0} cy={0.32} r={0.045} color="#E8B33C" />
      <Circle cx={0} cy={0.5} r={0.055} color="#FFE98C" />
    </Group>
  );
}

// A throne room: opulent gold grade, shafts of light from above, drifting gold dust, an ornate
// jeweled crown over the head, and herald trumpets blasting a sparkle fanfare from either side.
export function Crown({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const seat = off(f, f.eyeMid, f.faceW * 0.95, 0);
  const size = f.faceW * 1.2;
  const bob = useDerivedValue(() => [{ translateY: Math.sin(clock.value * 1.6) * f.faceW * 0.025 }]);

  // Trumpets flank the head, angled up-and-outward.
  const tSize = f.faceW * 1.05;
  const tL = off(f, f.eyeMid, f.faceW * 0.1, f.faceW * 1.2);
  const tR = off(f, f.eyeMid, f.faceW * 0.1, -f.faceW * 1.2);
  const angL = rad + 0.5, angR = rad - 0.5;
  // Bell tip ≈ unit (0,-0.5) carried through each trumpet's rotation/scale — where the fanfare bursts.
  const bell = (ax: number, ay: number, ang: number) => ({ x: ax + Math.sin(ang) * tSize * 0.5, y: ay - Math.cos(ang) * tSize * 0.5 });
  const bL = bell(tL.x, tL.y, angL), bR = bell(tR.x, tR.y, angR);

  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(60,40,0,0.5)', 'rgba(120,85,10,0.15)', 'rgba(40,25,0,0.45)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(255,210,110,0)', 'rgba(150,100,15,0.3)', 'rgba(40,24,0,0.7)']} />
      <GodRays w={w} h={h} x={w * 0.5} y={-h * 0.1} color="rgba(255,225,140,0.55)" count={6} spread={1.2} clock={clock} opacity={0.45} />
      <Motes w={w} h={h} count={22} color="rgba(255,224,150,0.95)" clock={clock} dir={1} sizeMin={1.5} sizeMax={4.5} star seed={12} />

      {/* herald trumpets (behind the head art) */}
      <Trumpet x={tL.x} y={tL.y} angle={angL} size={tSize} clock={clock} />
      <Trumpet x={tR.x} y={tR.y} angle={angR} size={tSize} clock={clock} />
      {/* fanfare bursting from each bell */}
      {[bL, bR].map((b, bi) => Array.from({ length: 5 }).map((_, i) => (
        <Sparkle key={`${bi}-${i}`} x={b.x + (rnd(i + bi * 5) - 0.5) * f.faceW * 0.5} y={b.y + (rnd(i + bi * 5, 2) - 0.5) * f.faceW * 0.5}
          size={f.faceW * (0.05 + rnd(i + bi * 5, 3) * 0.05)} base={i * 1.3 + bi} speed={4 + rnd(i + bi * 5, 4) * 3} color={i % 2 ? '#FFF3C0' : '#FFFFFF'} clock={clock} />
      )))}

      {/* warm glow behind the crown */}
      <Circle cx={seat.x} cy={seat.y} r={f.faceW * 0.95} opacity={0.32}>
        <RadialGradient c={vec(seat.x, seat.y)} r={f.faceW * 0.95} colors={['#FFE9A8', 'rgba(255,200,80,0)']} />
        <BlurMask blur={20} style="normal" />
      </Circle>
      {/* the crown */}
      <Group transform={bob}>
        <Group transform={[{ translateX: seat.x }, { translateY: seat.y }, { rotate: rad }, { scale: size }]}>
          <CrownArt />
        </Group>
      </Group>
    </>
  );
}
