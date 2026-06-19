import React from 'react';
import { Group, Rect, Path, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, BOLTS, Cloud, RainSheet, GlowOrb, ScreenTint, WorldVignette, type LensProps } from '../core';

const DARK: [string, string, string] = ['#8A93A2', '#4C5562', '#222833']; // top-lit → dark belly
const LIT: [string, string, string] = ['#EAF1FF', '#AEC0E0', '#7587A6'];  // cloud lit by the flash

// A forked bolt hanging below the cloud, only visible on the flash.
function Bolt({ x, y, len, idx, flash }: { x: number; y: number; len: number; idx: number; flash: SharedValue<number> }) {
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scaleX: len * 0.5 }, { scaleY: len }]} opacity={flash}>
      <Path path={BOLTS[idx % BOLTS.length]} style="stroke" strokeWidth={0.05} strokeCap="round" strokeJoin="round" color="#F4F8FF">
        <BlurMask blur={0.04} style="solid" />
      </Path>
    </Group>
  );
}

// A personal storm: billowing layered clouds over the head, rain sheeting down, and lightning whose
// flash lights the clouds from within (plus a faint whole-frame flash) before fading to gloom.
export function StormCloud({ f, clock, w, h }: LensProps) {
  const c = off(f, f.eyeMid, f.faceW * 1.05, 0);
  const cw = f.faceW * 1.8;
  const bob = useDerivedValue(() => [{ translateY: Math.sin(clock.value * 1.3) * f.faceW * 0.03 }]);
  // Lightning envelope: a hard strike + a quick secondary flicker, every ~2.8s.
  const flash = useDerivedValue(() => {
    const t = clock.value % 2.8;
    const a = t < 0.16 ? (1 - t / 0.16) ** 2 : 0;
    const b = (t > 0.24 && t < 0.36) ? 0.65 * (1 - (t - 0.24) / 0.12) ** 2 : 0;
    return Math.max(a, b);
  });
  const litOp = useDerivedValue(() => flash.value * 0.85);
  const screenFlash = useDerivedValue(() => flash.value * 0.16);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#161C24', '#28303C', '#0C1016']} opacity={0.45} />
      <WorldVignette w={w} h={h} colors={['rgba(120,140,170,0)', 'rgba(45,55,72,0.4)', 'rgba(6,10,16,0.82)']} />
      <RainSheet w={w} h={h} clock={clock} speed={1.1} density={22} />
      <Group transform={bob}>
        {/* flash backlight — a wide halo so the sky + soft cloud edges glow on the strike */}
        <Group opacity={flash}>
          <GlowOrb x={c.x} y={c.y} r={cw * 1.05} colors={['rgba(210,230,255,0.9)', 'rgba(150,190,255,0)']} opacity={1} blur={26} />
        </Group>
        {/* depth clouds behind */}
        <Cloud x={c.x - cw * 0.42} y={c.y + cw * 0.06} scale={cw * 0.7} colors={DARK} opacity={0.42} blur={13} />
        <Cloud x={c.x + cw * 0.44} y={c.y + cw * 0.04} scale={cw * 0.66} colors={DARK} opacity={0.42} blur={13} />
        {/* main cloud */}
        <Cloud x={c.x} y={c.y} scale={cw} colors={DARK} opacity={0.62} blur={12} />
        {/* lit overlay — the cloud body glows from within during the flash */}
        <Group opacity={litOp}><Cloud x={c.x} y={c.y} scale={cw} colors={LIT} blur={11} /></Group>
        {/* heavy underside shadow (rain shadow) */}
        <GlowOrb x={c.x} y={c.y + cw * 0.3} r={cw * 0.78} colors={['rgba(8,12,18,0.6)', 'rgba(8,12,18,0)']} opacity={0.65} blur={22} />
        {/* bolts on top, striking down toward the wearer */}
        <Bolt x={c.x - cw * 0.18} y={c.y + cw * 0.16} len={f.faceW * 0.95} idx={0} flash={flash} />
        <Bolt x={c.x + cw * 0.22} y={c.y + cw * 0.14} len={f.faceW * 0.8} idx={2} flash={flash} />
      </Group>
      {/* whole-frame flash — the world lights up for an instant */}
      <Rect x={0} y={0} width={w} height={h} color="#CFE0FF" opacity={screenFlash} />
    </>
  );
}
