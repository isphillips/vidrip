import React from 'react';
import { Group, Circle, Path, LinearGradient, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { off, rnd, CROWN, Sparkle, ScreenTint, WorldVignette, GodRays, Motes, type LensProps } from '../core';

// A throne room: opulent gold grade, shafts of light from above, drifting gold dust, and a golden
// 3-spike crown floating over the head.
export function Crown({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const seat = off(f, f.eyeMid, f.faceW * 0.92, 0);
  const size = f.faceW * 1.15;
  const bob = useDerivedValue(() => [{ translateY: Math.sin(clock.value * 1.6) * f.faceW * 0.025 }]);
  // Jewel positions along the crown's three spike tips, in unit space.
  const jewels = [{ x: -0.28, y: -0.42 }, { x: 0, y: -0.5 }, { x: 0.28, y: -0.42 }];
  const jColors = ['#FF3B6B', '#37E0FF', '#B36BFF'];
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(60,40,0,0.5)', 'rgba(120,85,10,0.15)', 'rgba(40,25,0,0.45)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(255,210,110,0)', 'rgba(150,100,15,0.3)', 'rgba(40,24,0,0.7)']} />
      <GodRays w={w} h={h} x={w * 0.5} y={-h * 0.1} color="rgba(255,225,140,0.55)" count={6} spread={1.2} clock={clock} opacity={0.45} />
      <Motes w={w} h={h} count={22} color="rgba(255,224,150,0.95)" clock={clock} dir={1} sizeMin={1.5} sizeMax={4.5} star seed={12} />
      <Circle cx={seat.x} cy={seat.y} r={f.faceW * 0.95} opacity={0.32}>
        <RadialGradient c={vec(seat.x, seat.y)} r={f.faceW * 0.95} colors={['#FFE9A8', 'rgba(255,200,80,0)']} />
        <BlurMask blur={20} style="normal" />
      </Circle>
      <Group transform={bob}>
        <Group transform={[{ translateX: seat.x }, { translateY: seat.y }, { rotate: rad }, { scale: size }]}>
          <Path path={CROWN}>
            <LinearGradient start={vec(0, -0.5)} end={vec(0, 0.3)} colors={['#FFF6C8', '#FFD24A', '#E8951E', '#B86A12']} />
          </Path>
          <Path path={CROWN} style="stroke" strokeWidth={0.02} color="#7A4A0A" />
          {jewels.map((j, i) => (
            <Circle key={i} cx={j.x} cy={j.y} r={0.07} color={jColors[i]}>
              <BlurMask blur={0.02} style="solid" />
            </Circle>
          ))}
          {/* band stones */}
          {[-0.3, -0.1, 0.1, 0.3].map((bx, i) => (
            <Circle key={`b${i}`} cx={bx} cy={0.08} r={0.035} color="#FFF1B0" />
          ))}
        </Group>
      </Group>
      {/* sparkle glints on the metal */}
      {Array.from({ length: 6 }).map((_, i) => {
        const p = off(f, f.eyeMid, f.faceW * (0.75 + rnd(i) * 0.4), (rnd(i, 2) - 0.5) * f.faceW * 1.1);
        return <Sparkle key={i} x={p.x} y={p.y} size={f.faceW * 0.06} base={i * 1.1} speed={3 + rnd(i, 3) * 2} color="#FFF3C0" clock={clock} />;
      })}
      <Sparkle x={seat.x} y={seat.y - size * 0.5} size={f.faceW * 0.1} base={0} speed={4} color="#FFFFFF" clock={clock} />
    </>
  );
}
