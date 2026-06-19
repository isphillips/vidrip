import React from 'react';
import { Group, Path, Skia, LinearGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A tall wavy curtain (unit: ~0.4 wide, full height). Animated via Group sway/skew rather than
// rebuilding the path, so nothing is allocated per frame.
const CURTAIN: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.18, -0.5);
  p.cubicTo(0.12, -0.18, -0.14, 0.18, 0.04, 0.5);
  p.lineTo(0.22, 0.5);
  p.cubicTo(0.04, 0.18, 0.3, -0.18, 0.0, -0.5);
  p.close();
  return p;
})();

// A single shimmering aurora curtain that sways and skews, brightest at its lower edge.
function Curtain({ x, w, h, colors, speed, base, clock }: {
  x: number; w: number; h: number; colors: string[]; speed: number; base: number; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => [
    { translateX: x + Math.sin(clock.value * speed + base) * w * 0.06 },
    { translateY: h * 0.42 },
    { skewX: Math.sin(clock.value * speed * 0.7 + base) * 0.25 },
    { scaleX: w * 0.5 }, { scaleY: h * 1.05 },
  ]);
  const op = useDerivedValue(() => 0.45 + 0.3 * Math.sin(clock.value * speed * 1.3 + base));
  return (
    <Group transform={tf} opacity={op}>
      <Path path={CURTAIN}>
        <LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={colors} />
        <BlurMask blur={0.09} style="normal" />
      </Path>
    </Group>
  );
}

// A polar-night world: a dark starry sky and flowing ribbons of aurora light overhead.
export function Aurora({ clock, w, h }: LensProps) {
  const curtains = [
    { x: w * 0.16, c: ['rgba(40,255,150,0)', 'rgba(40,255,150,0.55)', 'rgba(20,180,120,0)'], s: 0.5, b: 0 },
    { x: w * 0.32, c: ['rgba(120,120,255,0)', 'rgba(140,90,255,0.5)', 'rgba(80,40,200,0)'], s: 0.65, b: 1.4 },
    { x: w * 0.48, c: ['rgba(60,255,200,0)', 'rgba(40,230,180,0.55)', 'rgba(20,160,140,0)'], s: 0.45, b: 2.7 },
    { x: w * 0.64, c: ['rgba(200,120,255,0)', 'rgba(160,100,255,0.5)', 'rgba(90,40,180,0)'], s: 0.6, b: 4.1 },
    { x: w * 0.8, c: ['rgba(80,255,170,0)', 'rgba(60,235,160,0.5)', 'rgba(20,170,130,0)'], s: 0.55, b: 5.3 },
    { x: w * 0.92, c: ['rgba(150,150,255,0)', 'rgba(130,110,255,0.45)', 'rgba(70,40,190,0)'], s: 0.42, b: 6.6 },
  ];
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#02040E', '#04102A', '#01030A']} opacity={0.55} />
      <WorldVignette w={w} h={h} colors={['rgba(40,120,160,0)', 'rgba(10,40,80,0.4)', 'rgba(0,2,8,0.85)']} />
      {/* stars */}
      <Motes w={w} h={h} count={44} color="#FFFFFF" clock={clock} dir={-1} sizeMin={1} sizeMax={3.5} star seed={71} />
      {/* aurora curtains */}
      {curtains.map((c, i) => <Curtain key={i} x={c.x} w={w} h={h} colors={c.c} speed={c.s} base={c.b} clock={clock} />)}
      {/* soft horizon glow the aurora casts on the sky below */}
      <GlowOrb x={w * 0.5} y={h * 0.96} r={w * 0.85} colors={['rgba(50,225,160,0.16)', 'rgba(40,180,140,0)']} opacity={0.6} blur={50} />
    </>
  );
}
