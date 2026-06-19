import React from 'react';
import { Group, RoundedRect, LinearGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A cyberpunk night: dark city grade, magenta/cyan neon haze bleeding in from the edges, floating
// neon embers, a horizon glow, and a glowing visor across the eyes with a sweeping scan-line.
export function NeonVisor({ f, clock, w: cw, h: ch }: LensProps) {
  const w = f.eyeDist * 2.6, h = f.eyeDist * 0.95;
  const rad = (f.rollDeg * Math.PI) / 180;
  const x = f.eyeMid.x - w / 2, y = f.eyeMid.y - h / 2;
  const glow = useDerivedValue(() => 6 + 7 * (0.5 + 0.5 * Math.sin(clock.value * 3)));
  const scan = useDerivedValue(() => [{ translateX: ((clock.value * 0.6) % 1) * w }]);
  const neon = ['#FF2BD6', '#7A5CFF', '#00F5D4', '#08F7FE', '#FF2BD6'];
  return (
    <>
      <ScreenTint w={cw} h={ch} colors={['#10031F', '#1A0533', '#05010E']} opacity={0.5} />
      <WorldVignette w={cw} h={ch} colors={['rgba(255,43,214,0)', 'rgba(122,92,255,0.28)', 'rgba(6,1,18,0.85)']} />
      <GlowOrb x={cw * 0.5} y={ch * 0.92} r={cw * 0.85} colors={['rgba(0,245,212,0.28)', 'rgba(255,43,214,0)']} opacity={0.7} blur={42} />
      <Motes w={cw} h={ch} count={22} color="#08F7FE" clock={clock} dir={-1} sizeMin={1.5} sizeMax={4} seed={16} />
      <Group origin={vec(f.eyeMid.x, f.eyeMid.y)} transform={[{ rotate: rad }]}>
      <RoundedRect x={x} y={y} width={w} height={h} r={h * 0.5} opacity={0.5}>
        <LinearGradient start={vec(x, y)} end={vec(x + w, y)} colors={neon} />
        <BlurMask blur={glow} style="normal" />
      </RoundedRect>
      <RoundedRect x={x} y={y} width={w} height={h} r={h * 0.5}>
        <LinearGradient start={vec(x, y)} end={vec(x + w, y + h)} colors={['#0a0a16', '#13132a', '#0a0a16']} />
      </RoundedRect>
      {/* curved glass reflection across the top of the visor */}
      <RoundedRect x={x + h * 0.32} y={y + h * 0.12} width={w - h * 0.7} height={h * 0.2} r={h * 0.1} color="rgba(180,210,255,0.16)">
        <BlurMask blur={3} style="normal" />
      </RoundedRect>
      <RoundedRect x={x + h * 0.12} y={y + h * 0.28} width={w - h * 0.24} height={h * 0.44} r={h * 0.22}>
        <LinearGradient start={vec(x, y)} end={vec(x + w, y)} colors={neon} />
        <BlurMask blur={4} style="solid" />
      </RoundedRect>
      <Group transform={scan}>
        <RoundedRect x={x} y={y + h * 0.2} width={h * 0.16} height={h * 0.6} r={h * 0.08} color="rgba(255,255,255,0.7)">
          <BlurMask blur={3} style="solid" />
        </RoundedRect>
      </Group>
      </Group>
    </>
  );
}
