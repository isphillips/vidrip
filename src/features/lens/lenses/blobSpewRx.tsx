import React, { useCallback, useRef, useState } from 'react';
import { Group, Circle, Path, Rect, RadialGradient, Paint, Blur, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, useAnimatedReaction, runOnJS, type SharedValue } from 'react-native-reanimated';
import { type ReactiveLensProps, type MeshFrame } from '../core';

// BLOB STORM (open your mouth) — Drippy's blob friends pour out of your mouth en masse: a cascade of
// googly-eyed brand-coloured slimes spilling out, spreading, tumbling with gravity + jiggle, over a
// wash of additive colour (auras, trails, comets) and a chromatic edge-bloom that floods the frame.
//
// PERF: (1) the whole swarm only mounts while the mouth is open (idle cost ≈ 0); (2) all the colour
// glow draws crisp into ONE offscreen layer that's blurred a SINGLE time (not a BlurMask per particle);
// (3) each particle's aura+trail is one fat round-cap stroke (the round head cap IS the aura); (4) a
// smoothed gate lets in-flight blobs finish falling after you close. Tune density with N / M.

const PAL = ['#FF4FA3', '#e056fd', '#A05CFF', '#2DD4BF', '#FFD24A', '#6C7BFF', '#FF8A3D'];
const SMILE = (() => { const p = Skia.Path.Make(); p.moveTo(-0.32, 0.24); p.quadTo(0, 0.56, 0.32, 0.24); return p; })();
const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const fade = (t: number) => { 'worklet'; return t < 0.1 ? t / 0.1 : t > 0.82 ? (1 - t) / 0.18 : 1; };

// Crisp blob body (face). Drawn on top of the bloom so the friends stay readable.
function BlobBody({ f, clock, i, n, gate }: {
  f: SharedValue<MeshFrame | null>; clock: SharedValue<number>; i: number; n: number; gate: SharedValue<number>;
}) {
  const base = i / n;
  const speed = 0.5 + ((i * 37) % 50) / 100;
  const spread = ((i * 73) % 100) / 100 - 0.5;
  const color = PAL[i % PAL.length];
  const v = useDerivedValue(() => (((clock.value * speed + base) % 1) + 1) % 1);
  const op = useDerivedValue(() => fade(v.value) * Math.min(1, gate.value * 2.2));
  const tf = useDerivedValue(() => {
    const ff = f.value; if (!ff) { return [{ scale: 0 }]; }
    const vv = v.value;
    const x = ff.mouth.x + spread * ff.faceW * (0.3 + vv) + Math.sin(clock.value * 3 + base * 9) * ff.faceW * 0.06;
    const y = ff.mouth.y + ff.faceW * 0.08 + vv * vv * ff.faceW * 2.7;
    const r = ff.faceW * (0.07 + (i % 3) * 0.013) * (vv < 0.12 ? vv / 0.12 : 1);
    const s = 0.13 * Math.sin(clock.value * 9 + base * 7); // squash-and-stretch jiggle
    return [{ translateX: x }, { translateY: y }, { scaleX: r * (1 + s) }, { scaleY: r * (1 - s) }];
  });
  return (
    <Group transform={tf} opacity={op}>
      <Circle cx={0} cy={0} r={1} color={color} />
      <Circle cx={0} cy={0} r={1}>
        <RadialGradient c={vec(-0.32, -0.42)} r={1.7} colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.2)']} />
      </Circle>
      <Circle cx={-0.34} cy={-0.16} r={0.27} color="#FFFFFF" />
      <Circle cx={0.34} cy={-0.16} r={0.27} color="#FFFFFF" />
      <Circle cx={-0.32} cy={-0.07} r={0.13} color="#16091f" />
      <Circle cx={0.36} cy={-0.07} r={0.13} color="#16091f" />
      <Path path={SMILE} style="stroke" strokeWidth={0.08} strokeCap="round" color="#16091f" />
    </Group>
  );
}

// Blob aura + motion trail as ONE fat round-cap stroke (tail→head; the round head cap is the aura).
function BlobBloom({ f, clock, i, n, gate }: {
  f: SharedValue<MeshFrame | null>; clock: SharedValue<number>; i: number; n: number; gate: SharedValue<number>;
}) {
  const base = i / n;
  const speed = 0.5 + ((i * 37) % 50) / 100;
  const spread = ((i * 73) % 100) / 100 - 0.5;
  const glow = rgba(PAL[i % PAL.length], 0.5);
  const v = useDerivedValue(() => (((clock.value * speed + base) % 1) + 1) % 1);
  const op = useDerivedValue(() => fade(v.value) * Math.min(1, gate.value * 2.2));
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make(); const ff = f.value; if (!ff) { return p; }
    const at = (vv: number) => ({
      x: ff.mouth.x + spread * ff.faceW * (0.3 + vv) + Math.sin(clock.value * 3 + base * 9) * ff.faceW * 0.06,
      y: ff.mouth.y + ff.faceW * 0.08 + vv * vv * ff.faceW * 2.7,
    });
    const h = at(v.value), t = at(Math.max(0, v.value - 0.16));
    p.moveTo(t.x, t.y); p.lineTo(h.x, h.y);
    return p;
  });
  const w = useDerivedValue(() => { const ff = f.value; if (!ff) { return 0; } const vv = v.value; return ff.faceW * (0.07 + (i % 3) * 0.013) * (vv < 0.12 ? vv / 0.12 : 1) * 2.6; });
  return <Path path={path} style="stroke" strokeWidth={w} strokeCap="round" color={glow} opacity={op} />;
}

// A colour comet sprayed radially out of the mouth (golden-angle fan) — one fat round-cap stroke.
function Comet({ f, clock, i, m, gate }: {
  f: SharedValue<MeshFrame | null>; clock: SharedValue<number>; i: number; m: number; gate: SharedValue<number>;
}) {
  const base = i / m;
  const speed = 0.8 + ((i * 53) % 70) / 100;
  const ang = i * 2.3999632; // golden angle → even radial spread
  const color = PAL[i % PAL.length];
  const v = useDerivedValue(() => (((clock.value * speed + base) % 1) + 1) % 1);
  const op = useDerivedValue(() => (v.value < 0.08 ? v.value / 0.08 : 1 - (v.value - 0.08) / 0.92) * Math.min(1, gate.value * 2.2));
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make(); const ff = f.value; if (!ff) { return p; }
    const at = (vv: number) => ({
      x: ff.mouth.x + Math.cos(ang) * ff.faceW * (0.1 + vv * 1.6),
      y: ff.mouth.y + Math.sin(ang) * ff.faceW * (0.1 + vv * 1.0) + vv * vv * ff.faceW * 1.4,
    });
    const h = at(v.value), t = at(Math.max(0, v.value - 0.22));
    p.moveTo(t.x, t.y); p.lineTo(h.x, h.y);
    return p;
  });
  const w = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.05 * (v.value < 0.1 ? v.value / 0.1 : 1));
  return <Path path={path} style="stroke" strokeWidth={w} strokeCap="round" color={color} opacity={op} />;
}

// Full-screen chromatic edge-bloom: transparent centre → colour at the edges, three hues pulsing out
// of phase + additive = a living rainbow wash that floods in the wider you open. Static gradients,
// animated opacity only (cheap).
function ColorWash({ clock, gate, w, h }: { clock: SharedValue<number>; gate: SharedValue<number>; w: number; h: number }) {
  const c = vec(w / 2, h * 0.46);
  const R = Math.max(w, h);
  const opP = useDerivedValue(() => Math.min(0.85, gate.value * 1.5) * (0.5 + 0.5 * Math.sin(clock.value * 1.4)));
  const opT = useDerivedValue(() => Math.min(0.85, gate.value * 1.5) * (0.5 + 0.5 * Math.sin(clock.value * 1.4 + 2.1)));
  const opU = useDerivedValue(() => Math.min(0.85, gate.value * 1.5) * (0.5 + 0.5 * Math.sin(clock.value * 1.4 + 4.2)));
  const ring = (op: SharedValue<number>, col: string, rmul: number) => (
    <Rect x={0} y={0} width={w} height={h} opacity={op}>
      <RadialGradient c={c} r={R * rmul} colors={[`rgba(${col},0)`, `rgba(${col},0)`, `rgba(${col},0.5)`]} positions={[0, 0.5, 1]} />
    </Rect>
  );
  return (
    <Group blendMode="plus">
      {ring(opP, '255,79,163', 0.95)}
      {ring(opT, '45,212,191', 0.82)}
      {ring(opU, '160,92,255', 1.05)}
    </Group>
  );
}

export function BlobSpewRx({ f, clock, w, h }: ReactiveLensProps) {
  const N = 46;   // blob friends
  const M = 20;   // colour comets

  // Mount the swarm only while the mouth is open (idle cost ≈ 0); linger after close so in-flight
  // blobs finish falling.
  const [active, setActive] = useState(false);
  const offTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const on = useCallback(() => { if (offTimer.current) { clearTimeout(offTimer.current); offTimer.current = null; } setActive(true); }, []);
  const offSoon = useCallback(() => { if (offTimer.current) { return; } offTimer.current = setTimeout(() => { offTimer.current = null; setActive(false); }, 450); }, []);
  // Low trigger threshold → trips the instant your mouth starts to open (responsive start).
  useAnimatedReaction(() => (f.value?.mouthOpen ?? 0) > 0.06, (open) => { if (open) { runOnJS(on)(); } else { runOnJS(offSoon)(); } }, []);

  // Gate snaps up to mouthOpen (instant start) and decays quickly on close so the spew stops fast
  // while still letting in-flight blobs fade out rather than hard-popping.
  const gate = useSharedValue(0);
  useAnimatedReaction(() => clock.value, () => {
    const m = Math.min(1, f.value?.mouthOpen ?? 0);
    gate.value = m > gate.value ? m : gate.value + (m - gate.value) * 0.28;
  }, []);

  const glowCx = useDerivedValue(() => f.value?.mouth.x ?? -1000);
  const glowCy = useDerivedValue(() => f.value?.mouth.y ?? -1000);
  const glowC = useDerivedValue(() => vec(f.value?.mouth.x ?? 0, f.value?.mouth.y ?? 0));
  const glowR = useDerivedValue(() => (f.value?.faceW ?? 0) * (0.18 + (f.value?.mouthOpen ?? 0) * 0.22));
  const glowOp = useDerivedValue(() => Math.min(0.8, gate.value * 1.7));

  if (!active) { return null; }
  return (
    <Group>
      {/* chromatic edge-bloom flooding the frame */}
      <ColorWash clock={clock} gate={gate} w={w} h={h} />
      {/* ONE blurred, additive bloom layer for ALL the particle colour (single blur pass) */}
      <Group layer={<Paint><Blur blur={7} /></Paint>}>
        <Group blendMode="plus">
          <Circle cx={glowCx} cy={glowCy} r={glowR} opacity={glowOp}>
            <RadialGradient c={glowC} r={glowR} colors={['rgba(255,255,255,0.85)', 'rgba(255,120,220,0.4)', 'rgba(120,220,255,0)']} />
          </Circle>
          {Array.from({ length: M }).map((_, i) => <Comet key={`c${i}`} f={f} clock={clock} i={i} m={M} gate={gate} />)}
          {Array.from({ length: N }).map((_, i) => <BlobBloom key={`g${i}`} f={f} clock={clock} i={i} n={N} gate={gate} />)}
        </Group>
      </Group>
      {/* crisp blob friends on top */}
      {Array.from({ length: N }).map((_, i) => <BlobBody key={i} f={f} clock={clock} i={i} n={N} gate={gate} />)}
    </Group>
  );
}
