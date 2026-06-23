import React from 'react';
import { Group, Path, Circle, RadialGradient, BlurMask, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import {
  ScreenTint, Motes, FACE_OVAL, RIGHT_EYE, LEFT_EYE, LIPS_OUTER, RIGHT_BROW, LEFT_BROW,
  type ReactiveLensProps,
} from '../core';

// ─── Star Map (reactive / UI-thread render) ────────────────────────────────────
// Same look as ./starMap, but driven by a SharedValue<MeshFrame> instead of a plain prop: the contour
// wireframe and the star-dots are rebuilt in useDerivedValue on the UI thread, so a face move never
// re-renders this component through React. The mesh arrives as a FLAT pixel array (MeshFrame.xy) for a
// cheap cross-thread hop. Building fresh SkPaths per frame here is safe — Reanimated's runtime is
// garbage-collected (unlike the frame-processor runtime). The clock-driven backdrop mounts once.

const LINE_LOOPS: { idx: number[]; close: boolean }[] = [
  { idx: FACE_OVAL, close: true },
  { idx: RIGHT_EYE, close: true },
  { idx: LEFT_EYE, close: true },
  { idx: LIPS_OUTER, close: true },
  { idx: RIGHT_BROW, close: false },
  { idx: LEFT_BROW, close: false },
];
const SPACE_TINT = ['#0A0826', '#05021A'];
const NEBULA = ['rgba(120,150,255,0.28)', 'rgba(40,40,120,0)'];
const DOT_R = 1.4;

export function StarMapRx({ f, clock, w, h }: ReactiveLensProps) {
  // Contour wireframe — one combined path, rebuilt on the UI thread from the live flat mesh.
  const linePath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const mf = f.value;
    if (!mf) { return p; }
    const xy = mf.xy;
    for (let li = 0; li < LINE_LOOPS.length; li++) {
      const loop = LINE_LOOPS[li].idx;
      const close = LINE_LOOPS[li].close;
      let started = false;
      for (let i = 0; i < loop.length; i++) {
        const x = xy[2 * loop[i]];
        if (isNaN(x)) { continue; }
        const y = xy[2 * loop[i] + 1];
        if (!started) { p.moveTo(x, y); started = true; } else { p.lineTo(x, y); }
      }
      if (close && started) { p.close(); }
    }
    return p;
  });
  // Star dots — a circle at every present vertex, built as one fillable path (no 478-object array).
  const dotPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const mf = f.value;
    if (!mf) { return p; }
    const xy = mf.xy;
    for (let i = 0; i < xy.length; i += 2) {
      const x = xy[i];
      if (isNaN(x)) { continue; }
      p.addCircle(x, xy[i + 1], DOT_R);
    }
    return p;
  });
  const glow = useDerivedValue(() => 2.5 + 2 * Math.abs(Math.sin(clock.value * 2.2)));
  // Reactive nebula glow behind the face (falls back to centre when no face this frame).
  const bloomC = useDerivedValue(() => vec(f.value?.noseX ?? w / 2, f.value?.eyeMidY ?? h * 0.42));
  const bloomR = useDerivedValue(() => (f.value?.faceW ?? w * 0.3) * 1.35);

  return (
    <>
      <ScreenTint w={w} h={h} colors={SPACE_TINT} opacity={0.4} />
      <Circle c={bloomC} r={bloomR} opacity={0.5}>
        <RadialGradient c={bloomC} r={bloomR} colors={NEBULA} />
        <BlurMask blur={26} style="normal" />
      </Circle>
      <Motes w={w} h={h} count={40} color="#FFFFFF" clock={clock} dir={-1} sizeMin={1} sizeMax={2.6} star seed={51} />
      <Group>
        {/* wireframe */}
        <Path path={linePath} style="stroke" strokeWidth={1} color="rgba(150,190,255,0.45)">
          <BlurMask blur={2} style="solid" />
        </Path>
        {/* soft star glow (pulses on the clock) */}
        <Path path={dotPath} color="#A8D0FF">
          <BlurMask blur={glow} style="solid" />
        </Path>
        {/* bright cores */}
        <Path path={dotPath} color="#FFFFFF" />
      </Group>
    </>
  );
}
