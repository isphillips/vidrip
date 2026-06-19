import React from 'react';
import { Group, Circle, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { off, FlameStack, EmberField, Smoke, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A hellish world: smouldering red grade, a lava glow rising from below, an ember storm, smoke off
// the top, and a crown of flames whose light flickers warmly across the face.
export function Inferno({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const slots = [-0.5, -0.27, -0.05, 0.18, 0.4];
  const base = off(f, f.eyeMid, f.faceW * 0.5, 0);
  const crown = off(f, f.eyeMid, f.faceW * 0.78, 0);
  // Firelight flicker — fast jitter over a slow pulse, so the warm cast never sits still.
  const flick = useDerivedValue(() => 0.5 + 0.32 * Math.abs(Math.sin(clock.value * 7)) + 0.16 * Math.sin(clock.value * 19));
  return (
    <>
      {/* ember-lit air + hellish edge vignette + lava glow from below */}
      <ScreenTint w={w} h={h} colors={['#2A0A00', '#5A1400', '#1A0500']} opacity={0.4} />
      <WorldVignette w={w} h={h} colors={['rgba(120,20,0,0)', 'rgba(90,15,0,0.4)', 'rgba(20,2,0,0.8)']} />
      <Group opacity={flick}>
        <GlowOrb x={w * 0.5} y={h * 1.02} r={w * 0.9} colors={['rgba(255,120,0,0.55)', 'rgba(200,30,0,0)']} opacity={0.85} blur={36} />
        {/* warm firelight cast on the face */}
        <Circle cx={base.x} cy={base.y} r={f.faceW * 0.95} opacity={0.34}>
          <RadialGradient c={vec(base.x, base.y)} r={f.faceW * 0.95} colors={['#FF6B00', 'rgba(255,45,0,0)']} />
          <BlurMask blur={22} style="normal" />
        </Circle>
      </Group>
      <Motes w={w} h={h} count={20} color="#FF7A1A" clock={clock} dir={-1} sizeMin={1.5} sizeMax={5} seed={2} />
      {/* smoke billowing up off the crown of flames */}
      <Smoke x={crown.x} y={crown.y} count={5} size={f.faceW * 0.5} travel={-f.faceW * 2.4} color="rgba(40,28,22,0.6)" clock={clock} />
      {slots.map((t, i) => {
        const lift = f.faceW * 0.52 - Math.abs(t) * f.faceW * 0.12;
        const p = off(f, f.eyeMid, lift, t * f.faceW * 1.1);
        const size = f.faceW * (0.46 - Math.abs(t) * 0.16);
        return <FlameStack key={i} x={p.x} y={p.y} size={size} roll={rad} base={i * 1.7} clock={clock} />;
      })}
      {/* storm of glowing embers lifting off the flame crown */}
      <EmberField x={crown.x} y={crown.y} width={f.faceW * 1.5} count={26} rise={f.faceW * 2.4} size={f.faceW * 0.03} clock={clock} seed={2} />
    </>
  );
}
