import React from 'react';
import { Skia, Group, Circle, Path, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, STAR4, STAR5, type LensProps } from '../core';

// INTERACTION LENS (raise eyebrows) — lift your brows and a mystic third eye opens on your forehead:
// it iris-dilates open vertically as the brows rise (f.browRaise), light rays fan out and rotate, a
// cosmic iris swirls, an arcane ring glows, and runic sigils orbit. A faint idle presence is always
// there; brows raised takes it to full blaze. browRaise is a mesh blendshape — undefined on BlazeFace
// builds / replay, where it degrades to the dim idle state.

// A thin radial light spike (unit, pointing up), fanned into a rotating halo by Rays below.
const RAY = (() => { const p = Skia.Path.Make(); p.moveTo(-0.5, 0); p.lineTo(0, -3.4); p.lineTo(0.5, 0); p.close(); return p; })();

// Rotating fan of light rays behind the eye.
function Rays({ x, y, len, color, dir, clock }: {
  x: number; y: number; len: number; color: string; dir: number; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => [{ translateX: x }, { translateY: y }, { rotate: clock.value * 0.4 * dir }]);
  const op = useDerivedValue(() => 0.45 + 0.55 * Math.abs(Math.sin(clock.value * 2)));
  const M = 12;
  return (
    <Group transform={tf} opacity={op}>
      {Array.from({ length: M }).map((_, i) => (
        <Group key={i} transform={[{ rotate: (i / M) * Math.PI * 2 }, { scaleX: len * 0.5 }, { scaleY: len }]}>
          <Path path={RAY} color={color} />
        </Group>
      ))}
    </Group>
  );
}

// Bright flecks swirling inside the iris.
function IrisSwirl({ r, clock }: { r: number; clock: SharedValue<number> }) {
  const tf = useDerivedValue(() => [{ rotate: clock.value * 0.8 }]);
  const D = 8;
  return (
    <Group transform={tf}>
      {Array.from({ length: D }).map((_, i) => {
        const a = (i / D) * Math.PI * 2;
        const rr = r * (0.42 + 0.5 * ((i % 3) / 2));
        return <Circle key={i} cx={Math.cos(a) * rr} cy={Math.sin(a) * rr} r={r * 0.07} color="rgba(205,185,255,0.85)" />;
      })}
    </Group>
  );
}

// A sigil orbiting the eye, spinning as it goes.
function Rune({ cx, cy, radius, size, base, shape, color, clock }: {
  cx: number; cy: number; radius: number; size: number; base: number; shape: ReturnType<typeof Skia.Path.Make>; color: string; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => {
    const a = clock.value * 0.5 + base;
    return [{ translateX: cx + Math.cos(a) * radius }, { translateY: cy + Math.sin(a) * radius }, { rotate: a * 1.6 }, { scale: size }];
  });
  const op = useDerivedValue(() => 0.4 + 0.6 * Math.abs(Math.sin(clock.value * 3 + base)));
  return <Group transform={tf} opacity={op}><Path path={shape} color={color} /></Group>;
}

const RUNES = [STAR5, STAR4, STAR5, STAR4, STAR5, STAR4];

export function ThirdEye({ f, clock }: LensProps) {
  const b = Math.min(1, f.browRaise ?? 0);
  const open = 0.06 + b * 0.94;                       // eyelid aperture: a slit at rest → wide open
  const C = off(f, f.eyeMid, f.faceW * 0.62, 0);      // forehead, above the brow line
  const R = f.faceW * 0.28;

  return (
    <Group opacity={Math.min(1, 0.14 + b * 1.1)}>
      <Rays x={C.x} y={C.y} len={R * 1.1} color="rgba(180,140,255,0.5)" dir={1} clock={clock} />

      {/* Arcane ring (crisp + a soft glow underlay). */}
      <Circle cx={C.x} cy={C.y} r={R * 1.5} style="stroke" strokeWidth={Math.max(1, R * 0.1)} color="rgba(120,80,220,0.25)">
        <BlurMask blur={6} style="normal" />
      </Circle>
      <Circle cx={C.x} cy={C.y} r={R * 1.5} style="stroke" strokeWidth={Math.max(1, R * 0.04)} color="rgba(200,170,255,0.65)" />

      {/* The eye — scales vertically with the brow raise so it "opens". */}
      <Group transform={[{ translateX: C.x }, { translateY: C.y }, { scaleY: open }]}>
        <Circle cx={0} cy={0} r={R} color="#F4ECFF" />
        <Circle cx={0} cy={0} r={R * 0.62}>
          <RadialGradient c={vec(0, 0)} r={R * 0.62} colors={['#C9B6FF', '#7A3CFF', '#2A0E6B', '#0A0320']} />
        </Circle>
        <IrisSwirl r={R * 0.62} clock={clock} />
        <Circle cx={0} cy={0} r={R * 0.26} color="#08010F" />
        <Circle cx={-R * 0.12} cy={-R * 0.12} r={R * 0.08} color="rgba(255,255,255,0.9)" />
        <Circle cx={0} cy={0} r={R} style="stroke" strokeWidth={Math.max(2, R * 0.06)} color="#2A0E6B" />
      </Group>

      {/* Orbiting runic sigils. */}
      {RUNES.map((sh, i) => (
        <Rune key={i} cx={C.x} cy={C.y} radius={R * 1.5} size={R * 0.17} base={(i / RUNES.length) * Math.PI * 2}
          shape={sh} color={i % 2 ? '#FFD6A8' : '#C9B6FF'} clock={clock} />
      ))}
    </Group>
  );
}
