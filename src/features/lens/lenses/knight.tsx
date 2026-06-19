import React from 'react';
import { Group, RoundedRect, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import { sample } from './_meshKit';
import { Drifter, ScreenTint, GlowOrb, rnd, type LensProps } from '../core';

const STEEL = ['#9AA3AD', '#5A626C', '#2C3138'];

// Knight: a steel great-helm clamped to the head with an open eye-slit (eyes show through), a nasal
// bar down the middle, breathing vents on the chin guard — over a dark forge glow with sparks flying
// off the mesh.
export function Knight({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const roll = (f.rollDeg * Math.PI) / 180;
  const tf = [{ translateX: f.eyeMid.x }, { translateY: f.eyeMid.y }, { rotate: roll }, { scale: f.faceW }];
  const sparks = sample(f.meshPts, 12);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#1A0E06', '#0A0603']} opacity={0.45} />
      <GlowOrb x={w * 0.5} y={h * 0.9} r={w * 0.7} colors={['rgba(255,120,20,0.45)', 'rgba(120,30,0,0)']} opacity={0.6} blur={40} />
      {/* forge sparks streaming off the face */}
      {sparks.map((p, i) => (
        <Drifter key={i} x0={p.x} y0={p.y} sway={f.faceW * 0.07} travel={-f.faceW * (0.8 + rnd(i))}
          size={f.faceW * (0.008 + 0.014 * rnd(i, 2))} dur={0.9 + rnd(i, 3)} base={rnd(i, 4)}
          color={i % 2 ? '#FFC24D' : '#FF7A1E'} clock={clock} star />
      ))}
      <Group transform={tf}>
        {/* dome (forehead + above the slit) */}
        <RoundedRect x={-0.82} y={-1.16} width={1.64} height={0.98} r={0.42}>
          <LinearGradient start={vec(0, -1.1)} end={vec(0, -0.2)} colors={STEEL} />
        </RoundedRect>
        {/* side temple plates flanking the slit */}
        <RoundedRect x={-0.84} y={-0.2} width={0.24} height={0.42} r={0.06}>
          <LinearGradient start={vec(-0.84, 0)} end={vec(-0.6, 0)} colors={STEEL} />
        </RoundedRect>
        <RoundedRect x={0.6} y={-0.2} width={0.24} height={0.42} r={0.06}>
          <LinearGradient start={vec(0.6, 0)} end={vec(0.84, 0)} colors={STEEL} />
        </RoundedRect>
        {/* nasal bar between the eyes */}
        <RoundedRect x={-0.07} y={-0.2} width={0.14} height={0.42} r={0.05}>
          <LinearGradient start={vec(-0.07, 0)} end={vec(0.07, 0)} colors={['#B8C0CA', '#5A626C']} />
        </RoundedRect>
        {/* lower face / chin guard */}
        <RoundedRect x={-0.72} y={0.22} width={1.44} height={0.82} r={0.3}>
          <LinearGradient start={vec(0, 0.2)} end={vec(0, 1.0)} colors={STEEL} />
        </RoundedRect>
        {/* breathing vents */}
        <RoundedRect x={-0.34} y={0.46} width={0.68} height={0.04} r={0.02} color="#1C2026" />
        <RoundedRect x={-0.34} y={0.58} width={0.68} height={0.04} r={0.02} color="#1C2026" />
        <RoundedRect x={-0.34} y={0.7} width={0.68} height={0.04} r={0.02} color="#1C2026" />
        {/* rivets */}
        {[-0.7, 0.7].map((x, i) => <Circle key={i} cx={x} cy={-0.9} r={0.05} color="#C8D0DA" />)}
      </Group>
    </>
  );
}
