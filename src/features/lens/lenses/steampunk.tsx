import React from 'react';
import { Group, Circle, RoundedRect, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { sample } from './_meshKit';
import { Drifter, ScreenTint, WorldVignette, rnd, type LensProps } from '../core';

// One brass goggle: clear glass, riveted ring, glass streak.
function Brass({ x, r }: { x: number; r: number }) {
  const shine = Skia.Path.Make();
  shine.moveTo(x - r * 0.5, -r * 0.4); shine.lineTo(x - r * 0.12, -r * 0.55); shine.lineTo(x - r * 0.28, r * 0.05); shine.lineTo(x - r * 0.55, -r * 0.02); shine.close();
  return (
    <Group>
      <Circle cx={x} cy={0} r={r}>
        <RadialGradient c={vec(x - r * 0.3, -r * 0.3)} r={r * 1.6} colors={['rgba(210,190,150,0.16)', 'rgba(120,90,40,0.12)', 'rgba(60,40,15,0.25)']} />
      </Circle>
      <Path path={shine} color="rgba(255,245,220,0.32)" />
      <Circle cx={x} cy={0} r={r} style="stroke" strokeWidth={0.1} color="#C9A24B" />
      <Circle cx={x} cy={0} r={r} style="stroke" strokeWidth={0.03} color="#7A5A1F" />
      {[0, 1, 2, 3, 4, 5].map((k) => {
        const a = k * (6.283 / 6);
        return <Circle key={k} cx={x + Math.cos(a) * r} cy={Math.sin(a) * r} r={0.022} color="#E8D08A" />;
      })}
    </Group>
  );
}

// Steampunk: riveted brass goggles (clear lenses — eyes through), a leather strap, and curls of steam
// rising off the mesh in a warm sepia haze.
export function Steampunk({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const roll = (f.rollDeg * Math.PI) / 180;
  const eX = f.eyeDist / f.faceW / 2;
  const r = Math.max(0.27, eX * 1.2);
  const tf = [{ translateX: f.eyeMid.x }, { translateY: f.eyeMid.y }, { rotate: roll }, { scale: f.faceW }];
  const steam = sample(f.meshPts, 16);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#3A2A12', '#1C1308']} opacity={0.38} />
      <WorldVignette w={w} h={h} colors={['rgba(120,90,40,0)', 'rgba(50,35,15,0.5)', 'rgba(20,12,4,0.85)']} />
      {steam.map((p, i) => (
        <Drifter key={i} x0={p.x} y0={p.y} sway={f.faceW * 0.08} travel={-f.faceW * 1.3}
          size={f.faceW * (0.02 + 0.03 * rnd(i))} dur={2.6 + rnd(i, 2) * 2} base={rnd(i, 3)}
          color="rgba(235,225,205,0.4)" clock={clock} />
      ))}
      <Group transform={tf}>
        <RoundedRect x={-1.05} y={-0.09} width={2.1} height={0.18} r={0.05} color="#4A3119" />
        <RoundedRect x={-eX} y={-0.06} width={eX * 2} height={0.12} r={0.05} color="#8A6D2B" />
        <Brass x={-eX} r={r} />
        <Brass x={eX} r={r} />
      </Group>
    </>
  );
}
