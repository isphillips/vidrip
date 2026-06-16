import React from 'react';
import { Canvas, Path, Circle, Group, BlurMask, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { sawtooth, triangle } from '../effectClock';

// Tier-3 perf: the Monsoon/Inferno effects used to mount dozens of animated RN Views — each a
// separate layer the Android RenderThread composites every frame. Here every particle is a Skia
// primitive drawn into ONE <Canvas> (one GPU surface, one native view), driven by the same shared
// clock. Per-particle worklet math matches the old View versions, but compositing cost collapses
// from ~N views to 1. The clock is passed in as a prop (NOT via useClock) because React Context
// does not cross react-native-skia's Canvas boundary; configs arrive already quality-sliced.

const RAIN_ANGLE = (-18 * Math.PI) / 180;
const INFERNO_COLORS = ['#FF4500', '#FF6B00', '#FFD700', '#FF2200'];

type Clock = SharedValue<number>;
export type RainCfg = { leftPct: number; del: number; dur: number; lenPx: number; thickness: number; opacity: number; color: string };
export type SplashCfg = { leftPct: number; del: number; dur: number };
export type EmberCfg = { leftPct: number; del: number; dur: number; size: number; colorIdx: number };
export type SmokeCfg = { leftPct: number; del: number; dur: number; size: number };

// ─── Monsoon ──────────────────────────────────────────────────────────────────

// One rain layer = one stroked Path rebuilt each frame (a line segment per live streak). Per-streak
// fade at the very top/bottom is dropped (a single path has one opacity); streaks near the edges are
// skipped so they don't pop. Reads near-identical to the old per-View version.
function RainLayer({ cfgs, w, h, clock }: { cfgs: RainCfg[]; w: number; h: number; clock: Clock }) {
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    for (let i = 0; i < cfgs.length; i++) {
      const c = cfgs[i];
      const v = sawtooth(clock.value, c.del, c.dur);
      if (v < 0.04 || v > 0.97) { continue; }
      const xShift = Math.tan(RAIN_ANGLE) * (h + c.lenPx);
      const spread = w + Math.abs(xShift);
      const left = (c.leftPct / 100) * (spread + 16) - 8;
      const x = left + xShift * v;
      const yTop = -c.lenPx + v * (h + c.lenPx);
      p.moveTo(x, yTop);
      p.lineTo(x, yTop + c.lenPx);
    }
    return p;
  });
  const s = cfgs[0];
  if (!s) { return null; }
  return <Path path={path} color={s.color} style="stroke" strokeWidth={s.thickness} strokeCap="round" opacity={s.opacity} />;
}

function SplashLayer({ cfgs, w, h, clock }: { cfgs: SplashCfg[]; w: number; h: number; clock: Clock }) {
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    for (let i = 0; i < cfgs.length; i++) {
      const c = cfgs[i];
      const v = sawtooth(clock.value, c.del, c.dur);
      if (v < 0.55) { continue; }
      const left = (c.leftPct * w) / 100;
      const top = h - 5 - (c.leftPct % 8);
      const half = 5.5 * (0.4 + v * 1.3);
      p.moveTo(left - half, top);
      p.lineTo(left + half, top);
    }
    return p;
  });
  return <Path path={path} color="rgba(206,222,255,0.55)" style="stroke" strokeWidth={2} strokeCap="round" />;
}

export function MonsoonCanvas({
  width, height, far, mid, near, splash, clock,
}: { width: number; height: number; far: RainCfg[]; mid: RainCfg[]; near: RainCfg[]; splash: SplashCfg[]; clock: Clock }) {
  return (
    <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      <RainLayer cfgs={far} w={width} h={height} clock={clock} />
      <RainLayer cfgs={mid} w={width} h={height} clock={clock} />
      <RainLayer cfgs={near} w={width} h={height} clock={clock} />
      <SplashLayer cfgs={splash} w={width} h={height} clock={clock} />
    </Canvas>
  );
}

// ─── Inferno ──────────────────────────────────────────────────────────────────
// Embers/smoke vary in colour + per-particle opacity, which a single path can't express, so each is
// a Skia <Circle> in an opacity <Group> — still all within one Canvas/GPU layer. Glow comes from a
// group BlurMask instead of a per-View shadow (the old shadowRadius was very costly ×N).

function Ember({ cfg, w, h, clock }: { cfg: EmberCfg; w: number; h: number; clock: Clock }) {
  const left = (cfg.leftPct * w) / 100;
  const baseY = h - 2;
  const swayDur = Math.round(cfg.dur * 0.55) * 2;
  const cx = useDerivedValue(() => {
    const v = sawtooth(clock.value, cfg.del, cfg.dur);
    const sway = triangle(clock.value, 0, swayDur);
    return left + Math.sin((v * 4 + sway) * Math.PI) * 18;
  });
  const cy = useDerivedValue(() => {
    const v = sawtooth(clock.value, cfg.del, cfg.dur);
    return baseY - (cfg.size * (1 - v * 0.7)) / 2 - v * h * 0.92;
  });
  const r = useDerivedValue(() => {
    const v = sawtooth(clock.value, cfg.del, cfg.dur);
    return Math.max(0.5, (cfg.size * (1 - v * 0.7)) / 2);
  });
  const opacity = useDerivedValue(() => {
    const v = sawtooth(clock.value, cfg.del, cfg.dur);
    const sway = triangle(clock.value, 0, swayDur);
    const fade = v < 0.1 ? v * 10 : Math.pow(1 - v, 1.5);
    return Math.max(0, Math.min(1, fade * (0.7 + sway * 0.3)));
  });
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={r} color={INFERNO_COLORS[cfg.colorIdx]} />
    </Group>
  );
}

function Smoke({ cfg, w, h, clock }: { cfg: SmokeCfg; w: number; h: number; clock: Clock }) {
  const left = (cfg.leftPct * w) / 100;
  const curlDur = Math.round(cfg.dur * 0.6) * 2;
  const cx = useDerivedValue(() => {
    const v = sawtooth(clock.value, cfg.del, cfg.dur);
    const curl = triangle(clock.value, 0, curlDur);
    return left + cfg.size * 0.5 + Math.sin((v * 3 + curl) * Math.PI) * 26;
  });
  const cy = useDerivedValue(() => {
    const v = sawtooth(clock.value, cfg.del, cfg.dur);
    return h - cfg.size * 0.5 - v * h * 0.95;
  });
  const r = useDerivedValue(() => {
    const v = sawtooth(clock.value, cfg.del, cfg.dur);
    return cfg.size * 0.5 * (0.4 + v * 2);
  });
  const opacity = useDerivedValue(() => {
    const v = sawtooth(clock.value, cfg.del, cfg.dur);
    return v < 0.18 ? (v / 0.18) * 0.3 : Math.max(0, 0.3 * (1 - (v - 0.18) / 0.82));
  });
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={r} color="rgb(64,60,58)" />
    </Group>
  );
}

export function InfernoCanvas({
  width, height, embers, smoke, clock,
}: { width: number; height: number; embers: EmberCfg[]; smoke: SmokeCfg[]; clock: Clock }) {
  return (
    <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      {/* Smoke behind, heavily softened */}
      <Group>
        <BlurMask blur={14} style="normal" />
        {smoke.map((c, i) => <Smoke key={`sm${i}`} cfg={c} w={width} h={height} clock={clock} />)}
      </Group>
      {/* Embers in front, solid core + glow halo */}
      <Group>
        <BlurMask blur={4} style="solid" />
        {embers.map((c, i) => <Ember key={`e${i}`} cfg={c} w={width} h={height} clock={clock} />)}
      </Group>
    </Canvas>
  );
}
