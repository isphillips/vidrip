import React from 'react';
import { Group, Path, RoundedRect, Line, LinearGradient, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rnd, WING, ScreenTint, WorldVignette, GodRays, Motes, type LensProps } from '../core';

// A butterfly orbiting the face: two flapping wings (the right wing path + a mirrored left), a body,
// and antennae. The wings squash on their X axis to fake the flap; it banks along its orbit.
function Flutter({ cx, cy, rx, ry, base, speed, size, colors, clock }: {
  cx: number; cy: number; rx: number; ry: number; base: number; speed: number; size: number; colors: string[]; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => {
    const a = clock.value * speed + base;
    return [
      { translateX: cx + Math.cos(a) * rx },
      { translateY: cy + Math.sin(a) * ry },
      { rotate: Math.sin(a) * 0.45 },     // bank with the orbit
      { scale: size },
    ];
  });
  const flap = useDerivedValue(() => 0.22 + 0.78 * Math.abs(Math.sin(clock.value * 7 + base)));
  const flapR = useDerivedValue(() => [{ scaleX: flap.value }]);
  const flapL = useDerivedValue(() => [{ scaleX: -flap.value }]);
  return (
    <Group transform={tf}>
      <Group transform={flapL} origin={vec(0, 0)}>
        <Path path={WING}><LinearGradient start={vec(0, -0.5)} end={vec(0.5, 0.5)} colors={colors} /></Path>
      </Group>
      <Group transform={flapR} origin={vec(0, 0)}>
        <Path path={WING}><LinearGradient start={vec(0, -0.5)} end={vec(0.5, 0.5)} colors={colors} /></Path>
      </Group>
      {/* body */}
      <RoundedRect x={-0.03} y={-0.2} width={0.06} height={0.46} r={0.03} color="#2E2018" />
      {/* antennae */}
      <Line p1={vec(0, -0.2)} p2={vec(-0.12, -0.36)} style="stroke" strokeWidth={0.018} color="#2E2018" strokeCap="round" />
      <Line p1={vec(0, -0.2)} p2={vec(0.12, -0.36)} style="stroke" strokeWidth={0.018} color="#2E2018" strokeCap="round" />
    </Group>
  );
}

const WINGS = [
  ['#FF8AD0', '#FF4FA3', '#B0247A'], ['#8AD0FF', '#4F9CFF', '#244FB0'],
  ['#FFE08A', '#FFB000', '#C87A00'], ['#C8A0FF', '#9A5CFF', '#5A24B0'],
];

// A sunlit meadow: soft warm-green grade, dappled light, drifting pollen, and a flutter of
// butterflies circling the head.
export function Butterfly({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: f.eyeMid.y };
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(220,245,200,0.4)', 'rgba(200,235,235,0.12)', 'rgba(180,225,170,0.34)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(255,250,210,0)', 'rgba(180,220,150,0.24)', 'rgba(120,170,110,0.5)']} />
      <GodRays w={w} h={h} x={w * 0.7} y={-h * 0.1} color="rgba(255,245,200,0.5)" count={5} spread={1.0} clock={clock} opacity={0.4} />
      <Motes w={w} h={h} count={22} color="rgba(255,250,200,0.85)" clock={clock} dir={1} sizeMin={1.5} sizeMax={4} seed={61} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Flutter key={i} cx={c.x} cy={c.y} rx={f.faceW * (0.9 + (i % 3) * 0.22)} ry={f.faceW * (0.62 + (i % 2) * 0.2)}
          base={(i / 6) * Math.PI * 2} speed={0.7 + (i % 3) * 0.2} size={f.faceW * (0.3 + rnd(i) * 0.16)}
          colors={WINGS[i % WINGS.length]} clock={clock} />
      ))}
    </>
  );
}
