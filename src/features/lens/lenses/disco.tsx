import React from 'react';
import { Group, Circle, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { off, rnd, Drifter, DiscoBall, ScreenTint, WorldVignette, Motes, type LensProps } from '../core';

// A nightclub: dark room, a mirror ball that drops in from the ceiling and spins overhead throwing
// coloured spotlight beams, confetti rain, and dancing light motes.
export function Disco({ f, clock, w, h }: LensProps) {
  // Coloured club beams sweeping from the ball overhead — rotating fans of sweep-gradient wedges.
  const sweep1 = useDerivedValue(() => [{ rotate: clock.value * 0.5 }]);
  const sweep2 = useDerivedValue(() => [{ rotate: -clock.value * 0.35 }]);
  const ballCx = w * 0.5, ballCy = h * 0.16, ballR = w * 0.16;
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#0B0118', '#13002A', '#050009']} opacity={0.55} />
      <WorldVignette w={w} h={h} colors={['rgba(40,0,80,0)', 'rgba(20,0,50,0.4)', 'rgba(2,0,8,0.85)']} />
      {/* spotlight fans radiating from the ball */}
      <Group transform={sweep1} origin={vec(ballCx, ballCy)}>
        <Circle cx={ballCx} cy={ballCy} r={Math.hypot(w, h)} opacity={0.22}>
          <SweepGradient c={vec(ballCx, ballCy)} colors={['rgba(255,0,200,0)', '#FF00C8', 'rgba(255,0,200,0)', 'rgba(0,229,255,0)', '#00E5FF', 'rgba(0,229,255,0)', 'rgba(255,0,200,0)']} />
          <BlurMask blur={30} style="normal" />
        </Circle>
      </Group>
      <Group transform={sweep2} origin={vec(ballCx, ballCy)}>
        <Circle cx={ballCx} cy={ballCy} r={Math.hypot(w, h)} opacity={0.18}>
          <SweepGradient c={vec(ballCx, ballCy)} colors={['rgba(255,230,0,0)', '#FFE600', 'rgba(255,230,0,0)', 'rgba(0,255,148,0)', '#00FF94', 'rgba(0,255,148,0)', 'rgba(255,230,0,0)']} />
          <BlurMask blur={30} style="normal" />
        </Circle>
      </Group>
      <Motes w={w} h={h} count={26} color="#FFFFFF" clock={clock} dir={1} sizeMin={2} sizeMax={6} star seed={1} />

      {/* the mirror ball — drops from the top edge, settles, spins */}
      <DiscoBall cx={ballCx} topY={0} cy={ballCy} r={ballR} clock={clock} />

      {Array.from({ length: 18 }).map((_, i) => {
        const sx = off(f, f.eyeMid, f.faceW * 0.8, (rnd(i) - 0.5) * f.faceW * 2);
        return <Drifter key={i} x0={sx.x} y0={sx.y} sway={f.faceW * 0.16} travel={f.faceW * (1 + rnd(i, 2) * 0.8)}
          size={f.faceW * 0.04} dur={2 + rnd(i, 3) * 2} base={rnd(i, 4)} color={['#FF00C8', '#00E5FF', '#FFE600', '#00FF94', '#FF5AF0'][i % 5]} clock={clock} star />;
      })}
    </>
  );
}
