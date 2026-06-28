import React from 'react';
import { Group, Path, Circle, Rect, BlurMask, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import {
  useDerivedValue, useSharedValue, useAnimatedReaction, withTiming, withSequence,
  interpolateColor, type SharedValue,
} from 'react-native-reanimated';
import { type ReactiveLensProps, type MeshFrame } from '../core';
import { useFaceWire } from './_meshKit';

// OVERDRIVE — the charge-and-unleash lens. A state machine you *play* with your face:
//   • CHARGE  — hold your eyebrows raised (browRaise). Energy veins trace your face mesh, embers
//     spiral inward, a halo swells and the world dims/tightens through Spark → Blaze → Critical
//     (gold → cyan → white) tiers, building over ~1.5s.
//   • UNLEASH — while charged, OPEN YOUR MOUTH (yell). A shockwave detonates from your mouth: an
//     expanding ring + screen flash. Charge level sets the blast.
// browRaise/mouthOpen are mesh blendshapes; with no mesh (BlazeFace / replay) it degrades to a faint
// idle. Fully baked via the mesh-overlay snapshot path. (A true SKSL camera-displacement shockwave is
// a follow-up — the baked ring + flash carry the moment today.)

const TIER = ['#FFC24B', '#36E1FF', '#FFFFFF']; // Spark (gold) → Blaze (cyan) → Critical (white)

// One ember that spirals INWARD toward the face while charging, fading as it converges.
function ChargeMote({ f, clock, charge, i, n }: {
  f: SharedValue<MeshFrame | null>; clock: SharedValue<number>; charge: SharedValue<number>; i: number; n: number;
}) {
  const base = i / n;
  const phase = useDerivedValue(() => (((clock.value * 0.55 + base) % 1) + 1) % 1);
  const pos = useDerivedValue(() => {
    const ff = f.value;
    if (!ff) { return { x: -1000, y: -1000 }; }
    const v = phase.value;
    const ang = base * Math.PI * 2 + v * 3.2;
    const rad = ff.faceW * (1.25 - v) * 0.95;
    return { x: ff.eyeMid.x + Math.cos(ang) * rad, y: ff.eyeMid.y + ff.faceW * 0.22 + Math.sin(ang) * rad };
  });
  const cx = useDerivedValue(() => pos.value.x);
  const cy = useDerivedValue(() => pos.value.y);
  const op = useDerivedValue(() => {
    const v = phase.value;
    const fade = v < 0.15 ? v / 0.15 : 1 - (v - 0.15) / 0.85;
    return fade * Math.min(1, charge.value * 1.4);
  });
  const r = useDerivedValue(() => (f.value ? f.value.faceW * (0.016 + 0.022 * charge.value) : 0));
  const color = useDerivedValue(() => interpolateColor(charge.value, [0, 0.5, 1], TIER));
  return <Circle cx={cx} cy={cy} r={r} color={color} opacity={op}><BlurMask blur={3} style="solid" /></Circle>;
}

// A radial speed-streak (unit, pointing up from the origin) fanned around the blast centre.
const STREAK = (() => { const p = Skia.Path.Make(); p.moveTo(0, 0); p.lineTo(0.5, -2); p.lineTo(0, -5.2); p.lineTo(-0.5, -2); p.close(); return p; })();

function Streak({ i, n, cx, cy, blast, f, w, h }: {
  i: number; n: number; cx: SharedValue<number>; cy: SharedValue<number>;
  blast: SharedValue<number>; f: SharedValue<MeshFrame | null>; w: number; h: number;
}) {
  const tf = useDerivedValue(() => {
    const len = (f.value?.faceW ?? 120) * 0.4 + (1 - blast.value) * Math.max(w, h) * 0.5;
    return [{ translateX: cx.value }, { translateY: cy.value }, { rotate: (i / n) * Math.PI * 2 }, { scale: len }];
  });
  const op = useDerivedValue(() => blast.value * 0.9);
  return <Group transform={tf} opacity={op}><Path path={STREAK} color="#CFF4FF" /></Group>;
}

// The unleash: a chromatic-dispersion shockwave from the mouth — a soft pressure ring, RGB-split
// additive rings (white core, coloured fringe), radial speed-streaks, and a screen flash. Baked
// overlay (reaches the shared clip); the literal camera-pixel bend is the separate Shock Ring warp.
function Shockwave({ f, blast, w, h }: {
  f: SharedValue<MeshFrame | null>; blast: SharedValue<number>; w: number; h: number;
}) {
  const cx = useDerivedValue(() => f.value?.mouth.x ?? w / 2);
  const cy = useDerivedValue(() => f.value?.mouth.y ?? h / 2);
  const base = useDerivedValue(() => (f.value ? f.value.faceW * 0.3 : 30) + (1 - blast.value) * Math.max(w, h) * 0.95);
  const op = useDerivedValue(() => blast.value);
  const sw = useDerivedValue(() => 3 + blast.value * 9);
  const split = useDerivedValue(() => 4 + (1 - blast.value) * 16); // chromatic fringe widens as it travels
  const rR = useDerivedValue(() => base.value + split.value);
  const rB = useDerivedValue(() => Math.max(0, base.value - split.value));
  const hazeW = useDerivedValue(() => 10 + (1 - blast.value) * 44);
  const hazeOp = useDerivedValue(() => blast.value * 0.4);
  const flashOp = useDerivedValue(() => blast.value * 0.3);
  const N = 14;
  return (
    <Group>
      <Rect x={0} y={0} width={w} height={h} color="#FFFFFF" opacity={flashOp} />
      {/* soft pressure ring (refraction-look) */}
      <Circle cx={cx} cy={cy} r={base} style="stroke" strokeWidth={hazeW} color="rgba(180,220,255,0.5)" opacity={hazeOp}>
        <BlurMask blur={20} style="normal" />
      </Circle>
      {/* radial speed streaks */}
      {Array.from({ length: N }).map((_, i) => (
        <Streak key={i} i={i} n={N} cx={cx} cy={cy} blast={blast} f={f} w={w} h={h} />
      ))}
      {/* glow under the ring */}
      <Circle cx={cx} cy={cy} r={base} style="stroke" strokeWidth={sw} color="#BFF4FF" opacity={op}>
        <BlurMask blur={14} style="solid" />
      </Circle>
      {/* chromatic-split rings (additive → white core, coloured fringe) */}
      <Group blendMode="plus">
        <Circle cx={cx} cy={cy} r={rR} style="stroke" strokeWidth={sw} color="#FF2A2A" opacity={op} />
        <Circle cx={cx} cy={cy} r={base} style="stroke" strokeWidth={sw} color="#2AFF6A" opacity={op} />
        <Circle cx={cx} cy={cy} r={rB} style="stroke" strokeWidth={sw} color="#2A6AFF" opacity={op} />
      </Group>
      {/* crisp white core ring */}
      <Circle cx={cx} cy={cy} r={base} style="stroke" strokeWidth={1.5} color="#FFFFFF" opacity={op} />
    </Group>
  );
}

export function OverdriveRx({ f, clock, w, h }: ReactiveLensProps) {
  const charge = useSharedValue(0);    // 0..1, integrated from sustained brow-raise
  const blast = useSharedValue(0);     // 1→0 burst envelope, fired on a mouth-open spike while charged
  const prevClock = useSharedValue(0);
  const prevMouth = useSharedValue(0);

  // Charge/unleash integrator — runs on the UI thread each clock tick (seconds).
  useAnimatedReaction(
    () => clock.value,
    (now) => {
      const dt = Math.min(0.1, Math.max(0, now - prevClock.value));
      prevClock.value = now;
      const ff = f.value;
      const br = ff?.browRaise ?? 0;
      const mo = ff?.mouthOpen ?? 0;
      if (blast.value < 0.01) {
        if (br > 0.4) { charge.value = Math.min(1, charge.value + dt * 0.7); }    // ~1.4s to full
        else { charge.value = Math.max(0, charge.value - dt * 0.45); }            // bleeds off
        // Rising-edge mouth-open while charged → unleash, consuming the charge.
        if (mo > 0.78 && prevMouth.value <= 0.78 && charge.value > 0.55) {
          blast.value = withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 620 }));
          charge.value = 0;
        }
      }
      prevMouth.value = mo;
    },
    [],
  );

  const wire = useFaceWire(f);
  const veinColor = useDerivedValue(() => interpolateColor(charge.value, [0, 0.5, 1], ['#FFB020', '#00E5FF', '#FFFFFF']));
  const veinW = useDerivedValue(() => 1 + charge.value * 3.2 + 0.5 * Math.sin(clock.value * 9));
  const veinGlow = useDerivedValue(() => 3 + charge.value * 11 + 2.5 * Math.sin(clock.value * 6));
  const veinOp = useDerivedValue(() => Math.min(1, 0.12 + charge.value * 1.1));
  const coreOp = useDerivedValue(() => Math.max(0, charge.value - 0.4) * 1.6); // white-hot core at high charge

  // Head halo ring — swells + brightens with charge.
  const ringCx = useDerivedValue(() => f.value?.eyeMid.x ?? -1000);
  const ringCy = useDerivedValue(() => (f.value ? f.value.eyeMid.y + f.value.faceW * 0.2 : -1000));
  const ringR = useDerivedValue(() => (f.value ? f.value.faceW * (0.82 + 0.16 * Math.sin(clock.value * 4)) : 0));
  const ringW = useDerivedValue(() => 2 + charge.value * 5);
  const ringOp = useDerivedValue(() => Math.min(0.85, charge.value * 0.9));
  const ringColor = useDerivedValue(() => interpolateColor(charge.value, [0, 0.5, 1], TIER));

  // Focus vignette — darkens the edges as you charge.
  const vigOp = useDerivedValue(() => charge.value * 0.5);

  return (
    <Group>
      {/* focus vignette */}
      <Rect x={0} y={0} width={w} height={h} opacity={vigOp}>
        <RadialGradient c={vec(w / 2, h / 2)} r={Math.max(w, h) * 0.72}
          colors={['rgba(4,0,14,0)', 'rgba(4,0,14,0)', 'rgba(4,0,14,0.9)']} positions={[0, 0.5, 1]} />
      </Rect>

      {/* inward-spiralling charge embers */}
      {Array.from({ length: 16 }).map((_, i) => (
        <ChargeMote key={i} f={f} clock={clock} charge={charge} i={i} n={16} />
      ))}

      {/* head halo */}
      <Circle cx={ringCx} cy={ringCy} r={ringR} style="stroke" strokeWidth={ringW} color={ringColor} opacity={ringOp}>
        <BlurMask blur={10} style="solid" />
      </Circle>

      {/* energy veins along the face mesh (glow pass + white-hot core) */}
      <Group opacity={veinOp}>
        <Path path={wire} style="stroke" strokeWidth={veinW} strokeJoin="round" strokeCap="round" color={veinColor}>
          <BlurMask blur={veinGlow} style="solid" />
        </Path>
        <Path path={wire} style="stroke" strokeWidth={1} strokeJoin="round" strokeCap="round" color="#FFFFFF" opacity={coreOp} />
      </Group>

      {/* unleash — chromatic-dispersion shockwave */}
      <Shockwave f={f} blast={blast} w={w} h={h} />
    </Group>
  );
}
