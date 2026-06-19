import React from 'react';
import { Group, Circle, Path, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { MeshWire, sample } from './_meshKit';
import { Drifter, ToxicSpill, BIOHAZARD, ScreenTint, WorldVignette, rnd, type LensProps } from '../core';

// Containment breach: a hazmat scene. A glowing biohazard placard on the wall, a drum knocked over
// and leaking glowing ooze, the air gone toxic-green — and the face itself coated in radioactive
// slime (the mesh throbs acid-green and drips).
export function Biohazard({ f, clock, w, h }: LensProps) {
  const pulse = useDerivedValue(() => 0.55 + 0.45 * Math.abs(Math.sin(clock.value * 3)));
  const signGlow = useDerivedValue(() => 0.35 + 0.2 * Math.abs(Math.sin(clock.value * 2)));
  if (!f.mesh) { return null; }
  const drips = sample(f.meshPts, 18);
  // Hazard placard, upper-left wall; ooze drum, lower-right floor.
  const signX = w * 0.22, signY = h * 0.2, signR = w * 0.15;
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#0C2A00', '#0A2400', '#031400']} opacity={0.4} />
      <WorldVignette w={w} h={h} colors={['rgba(120,220,30,0)', 'rgba(50,120,5,0.3)', 'rgba(4,18,2,0.82)']} />

      {/* the toxic-spill drum, knocked over and leaking */}
      <ToxicSpill x={w * 0.76} y={h * 0.82} s={w * 0.3} biohazard={BIOHAZARD} clock={clock} />

      {/* hazard placard on the wall — yellow disc, black trefoil, sickly green rim glow */}
      <Circle cx={signX} cy={signY} r={signR * 1.4} opacity={signGlow}>
        <RadialGradient c={vec(signX, signY)} r={signR * 1.4} colors={['rgba(156,255,46,0.5)', 'rgba(60,160,0,0)']} />
        <BlurMask blur={16} style="normal" />
      </Circle>
      <Group opacity={0.6} transform={[{ translateX: signX }, { translateY: signY }]}>
        <Circle cx={0} cy={0} r={signR} color="#E8C400" />
        <Circle cx={0} cy={0} r={signR} style="stroke" strokeWidth={signR * 0.09} color="#1A1A1A" />
        <Group transform={[{ scale: signR * 1.55 }]}><Path path={BIOHAZARD} color="#1A1A1A" /></Group>
      </Group>

      {/* the face, slimed: throbbing acid-green mesh + glowing drips */}
      <Group opacity={pulse}>
        <MeshWire mesh={f.mesh} color="#7CFF00" width={3} blur={11} core="#E8FFB0" />
      </Group>
      {drips.map((p, i) => (
        <Drifter key={i} x0={p.x} y0={p.y} sway={f.faceW * 0.02} travel={f.faceW * 0.55}
          size={f.faceW * 0.018 * (0.7 + rnd(i))} dur={2 + rnd(i, 2)} base={rnd(i, 3)} color="#9BFF2E" clock={clock} />
      ))}
    </>
  );
}
