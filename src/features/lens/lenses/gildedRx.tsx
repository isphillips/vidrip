import React from 'react';
import { Group, Path, Circle, SweepGradient, BlurMask, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { RIGHT_BROW, LEFT_BROW, RIGHT_EYE, LEFT_EYE, LIPS_OUTER, type ReactiveLensProps } from '../core';
import { useOvalPath } from './_meshKit';

// Reactive (UI-thread) Gilded — same look as ./gilded. Legacy Gilded stays the catalog Comp (replay/bake).
const ACCENTS: { idx: number[]; close: boolean }[] = [
  { idx: RIGHT_BROW, close: false }, { idx: LEFT_BROW, close: false },
  { idx: RIGHT_EYE, close: true }, { idx: LEFT_EYE, close: true }, { idx: LIPS_OUTER, close: true },
];
const GOLD = ['#5a3d00', '#FFE07A', '#FFF7D6', '#B9831A', '#FFE07A', '#5a3d00'];

export function GildedRx({ f, clock }: ReactiveLensProps) {
  const oval = useOvalPath(f);
  const accents = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const xy = f.value?.xy;
    if (!xy) { return p; }
    for (let li = 0; li < ACCENTS.length; li++) {
      const loop = ACCENTS[li].idx;
      let started = false;
      for (let i = 0; i < loop.length; i++) {
        const x = xy[2 * loop[i]];
        if (isNaN(x)) { continue; }
        const y = xy[2 * loop[i] + 1];
        if (!started) { p.moveTo(x, y); started = true; } else { p.lineTo(x, y); }
      }
      if (ACCENTS[li].close && started) { p.close(); }
    }
    return p;
  });
  const c = useDerivedValue(() => vec(f.value?.nose.x ?? 0, f.value?.nose.y ?? 0));
  const sheenX = useDerivedValue(() => {
    const ff = f.value;
    if (!ff) { return 0; }
    const t = (clock.value * 0.5) % 2;
    const k = t < 1 ? t : 2 - t;
    return ff.eyeMid.x - ff.faceW * 0.8 + k * ff.faceW * 1.6;
  });
  const sheenY = useDerivedValue(() => f.value?.nose.y ?? 0);
  const sheenR = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.5);
  return (
    <Group>
      <Group clip={oval}>
        {/* metallic base */}
        <Path path={oval} opacity={0.6}>
          <SweepGradient c={c} colors={GOLD} />
        </Path>
        {/* travelling sheen */}
        <Circle cx={sheenX} cy={sheenY} r={sheenR} color="rgba(255,252,230,0.55)">
          <BlurMask blur={30} style="normal" />
        </Circle>
      </Group>
      {/* glowing gold rim + feature accents */}
      <Path path={oval} style="stroke" strokeWidth={3} strokeJoin="round" color="#FFE89A">
        <BlurMask blur={6} style="solid" />
      </Path>
      <Path path={accents} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round" color="#FFE89A">
        <BlurMask blur={3} style="solid" />
      </Path>
    </Group>
  );
}
