import React from 'react';
import { Group, Circle, Path, LinearGradient, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, WING, FlameStack, Drifter, type LensProps } from '../core';

// INTERACTION LENS (open mouth) — open wide and a phoenix erupts overhead: twin fire-wings sweep up
// and flap, a white-gold core burns at the crown, flames crest the head and trail down like a tail,
// and an ember storm spits upward. The whole bird's scale + opacity track f.mouthOpen, so it bursts
// open as the jaw drops and folds away as it closes.

// One flaming wing. The outer Group places + mirrors + scales it (side = ±1); the inner Group flaps
// it on the clock from the shoulder (the WING path's origin).
function Wing({ x, y, scale, side, base, clock }: {
  x: number; y: number; scale: number; side: number; base: number; clock: SharedValue<number>;
}) {
  const flap = useDerivedValue(() => [{ rotate: 0.17 * Math.sin(clock.value * 3.2 + base) - 0.12 }]);
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scaleX: side * scale }, { scaleY: scale }]}>
      <Group transform={flap}>
        <Path path={WING}>
          <LinearGradient start={vec(0, 0)} end={vec(0.55, 0.12)} colors={['#FFF6C0', '#FFC22E', '#FF6A00', '#B81400']} />
        </Path>
        <Path path={WING} style="stroke" strokeWidth={0.012} color="rgba(255,232,150,0.65)" />
      </Group>
    </Group>
  );
}

export function PhoenixAscendant({ f, clock }: LensProps) {
  const g = f.mouthOpen;
  if (g <= 0.02) { return null; } // dormant until the mouth opens (keeps the canvas cheap when idle)
  const crown = off(f, f.eyeMid, f.faceW * 0.85, 0); // body sits just above the crown of the head
  const span = f.faceW * (0.7 + g * 0.95);
  const upRoll = (f.rollDeg * Math.PI) / 180;        // FLAME points up at rest
  const downRoll = upRoll + Math.PI;

  return (
    <Group opacity={Math.min(1, 0.3 + g)}>
      {/* Heat halo. */}
      <Circle cx={crown.x} cy={crown.y} r={span * 1.35} opacity={0.5}>
        <RadialGradient c={vec(crown.x, crown.y)} r={span * 1.35}
          colors={['rgba(255,170,40,0.7)', 'rgba(255,70,0,0.28)', 'rgba(255,40,0,0)']} />
        <BlurMask blur={22} style="normal" />
      </Circle>

      {/* Wings spread from behind the head. */}
      <Wing x={crown.x} y={crown.y} scale={span} side={1} base={0} clock={clock} />
      <Wing x={crown.x} y={crown.y} scale={span} side={-1} base={1.3} clock={clock} />

      {/* White-gold body core. */}
      <Circle cx={crown.x} cy={crown.y} r={span * 0.22}>
        <RadialGradient c={vec(crown.x, crown.y)} r={span * 0.22}
          colors={['#FFFFFF', '#FFD23C', '#FF6A00', 'rgba(180,20,0,0.2)']} />
      </Circle>

      {/* Head crest — three flames licking up off the crown. */}
      {Array.from({ length: 3 }).map((_, i) => {
        const p = off(f, crown, span * 0.2, (i - 1) * span * 0.18);
        return <FlameStack key={`c${i}`} x={p.x} y={p.y} size={span * 0.36} roll={upRoll + (i - 1) * 0.32} base={i * 2.1} clock={clock} />;
      })}

      {/* Tail — flames trailing down behind the head. */}
      {Array.from({ length: 4 }).map((_, i) => {
        const p = off(f, crown, -span * (0.3 + i * 0.34), Math.sin(i * 1.7) * span * 0.13);
        return <FlameStack key={`t${i}`} x={p.x} y={p.y} size={span * (0.42 - i * 0.06)} roll={downRoll} base={i * 1.5} clock={clock} />;
      })}

      {/* Ember storm spitting upward. */}
      {Array.from({ length: 14 }).map((_, i) => {
        const start = off(f, crown, span * 0.1, (rnd(i) - 0.5) * span * 1.4);
        return <Drifter key={`e${i}`} x0={start.x} y0={start.y} sway={span * 0.16}
          travel={-span * (1 + rnd(i, 2) * 0.9)} size={span * (0.01 + rnd(i, 3) * 0.022)}
          dur={0.7 + rnd(i, 4) * 0.9} base={rnd(i, 5)} color={i % 2 ? '#FFC24A' : '#FF5A00'} clock={clock} star={i % 3 === 0} />;
      })}
    </Group>
  );
}
