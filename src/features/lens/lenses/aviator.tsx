import React from 'react';
import { Group, Circle, RoundedRect, Path, LinearGradient, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { ScreenTint, Cloud, Motes, type LensProps } from '../core';

const SKY: [string, string, string] = ['#FFFFFF', '#EAF2FB', '#C7D6E8']; // sunlit cloud → soft shadow

// One clear round goggle lens with a brass ring + glass streak.
function GoggleLens({ x, r }: { x: number; r: number }) {
  const shine = Skia.Path.Make();
  shine.moveTo(x - r * 0.5, -r * 0.4); shine.lineTo(x - r * 0.1, -r * 0.55); shine.lineTo(x - r * 0.25, r * 0.1); shine.lineTo(x - r * 0.55, 0); shine.close();
  return (
    <Group>
      <Circle cx={x} cy={0} r={r}>
        <RadialGradient c={vec(x - r * 0.3, -r * 0.3)} r={r * 1.6} colors={['rgba(180,225,255,0.14)', 'rgba(70,130,180,0.1)', 'rgba(20,50,90,0.2)']} />
      </Circle>
      <Path path={shine} color="rgba(255,255,255,0.35)" />
      <Circle cx={x} cy={0} r={r} style="stroke" strokeWidth={0.07} color="#7A5A34" />
      <Circle cx={x} cy={0} r={r - 0.035} style="stroke" strokeWidth={0.02} color="#CAA86A" />
    </Group>
  );
}

// Aviator: leather flight cap + clear round goggles (eyes through the lenses), soaring through a bright
// sky with drifting clouds and wind.
export function Aviator({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const roll = (f.rollDeg * Math.PI) / 180;
  const eX = f.eyeDist / f.faceW / 2;
  const r = Math.max(0.26, eX * 1.15);
  const tf = [{ translateX: f.eyeMid.x }, { translateY: f.eyeMid.y }, { rotate: roll }, { scale: f.faceW }];
  const drift = useDerivedValue(() => [{ translateX: Math.sin(clock.value * 0.15) * w * 0.02 }]);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#9FD8FF', '#5BA8E6', '#2E7BC4']} opacity={0.4} />
      {/* real, soft sunlit clouds drifting by */}
      <Group transform={drift}>
        <Cloud x={w * 0.24} y={h * 0.22} scale={w * 0.52} colors={SKY} opacity={0.92} blur={14} />
        <Cloud x={w * 0.82} y={h * 0.48} scale={w * 0.62} colors={SKY} opacity={0.85} blur={16} />
        <Cloud x={w * 0.5} y={h * 0.8} scale={w * 0.46} colors={SKY} opacity={0.8} blur={14} />
      </Group>
      <Motes w={w} h={h} count={18} color="rgba(255,255,255,0.7)" clock={clock} dir={1} sizeMin={1} sizeMax={2} seed={3} />
      <Group transform={tf}>
        {/* leather flight cap band */}
        <RoundedRect x={-0.85} y={-0.62} width={1.7} height={0.42} r={0.16}>
          <LinearGradient start={vec(0, -0.62)} end={vec(0, -0.2)} colors={['#6B4A2A', '#4A3119']} />
        </RoundedRect>
        {/* bridge + straps */}
        <RoundedRect x={-eX} y={-0.05} width={eX * 2} height={0.1} r={0.04} color="#7A5A34" />
        <RoundedRect x={-1.05} y={-0.07} width={0.4} height={0.12} r={0.04} color="#5A3F22" />
        <RoundedRect x={0.65} y={-0.07} width={0.4} height={0.12} r={0.04} color="#5A3F22" />
        <GoggleLens x={-eX} r={r} />
        <GoggleLens x={eX} r={r} />
      </Group>
    </>
  );
}
