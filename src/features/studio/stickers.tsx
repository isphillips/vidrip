import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import RAnimated, {
  useAnimatedStyle, useDerivedValue, useAnimatedReaction, runOnJS,
} from 'react-native-reanimated';
import MaskedView from '@react-native-masked-view/masked-view';
import LinearGradient from 'react-native-linear-gradient';
import { FONT } from '../../theme';
import { useClock, sawtooth, triangle } from './effectClock';
import { useStudioQuality, scaleCount } from './studioQuality';
import { MonsoonCanvas, InfernoCanvas } from './components/SkiaParticles';
import { MONETIZATION_ENABLED } from '../../infrastructure/config/monetization';

const BRAND = ['#FF4FA3', '#A05CFF', '#3B82F6'];

function GradientText({ text, size, font = FONT.DISPLAY_BOLD, letterSpacing = 1 }: { text: string; size: number; font?: string; letterSpacing?: number }) {
  const label = <Text style={{ fontSize: size, fontFamily: font, letterSpacing }}>{text}</Text>;
  return (
    <MaskedView maskElement={label}>
      <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={{ fontSize: size, fontFamily: font, letterSpacing, opacity: 0 }}>{text}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

function GradientPill({ text }: { text: string }) {
  return (
    <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.pill}>
      <Text style={s.pillTxt}>{text}</Text>
    </LinearGradient>
  );
}

// ─── Particle Sticker Components ─────────────────────────────────────────────

// ── 1. Embers ──────────────────────────────────────────────────────────────────

const EMBER_CFG = [
  { xOff: -17, size: 6, col: '#FF4500', dur: 700, del: 0 },
  { xOff:  -4, size: 5, col: '#FF8C00', dur: 820, del: 110 },
  { xOff:   9, size: 7, col: '#FFD700', dur: 650, del: 220 },
  { xOff:  18, size: 5, col: '#FF2200', dur: 760, del: 330 },
  { xOff: -11, size: 6, col: '#FFA500', dur: 610, del: 440 },
  { xOff:   2, size: 4, col: '#FF6B00', dur: 840, del: 550 },
  { xOff:  -1, size: 6, col: '#FF8C00', dur: 730, del: 660 },
  { xOff:  15, size: 5, col: '#FF4500', dur: 680, del: 770 },
  { xOff: -19, size: 7, col: '#FFD700', dur: 750, del: 880 },
  { xOff:  10, size: 5, col: '#FF2200', dur: 800, del: 990 },
];

function Ember({ xOff, size, col, dur, del }: typeof EMBER_CFG[0]) {
  const clock = useClock();
  const p = useDerivedValue(() => sawtooth(clock.value, del, dur));
  const anim = useAnimatedStyle(() => {
    const v = p.value;
    const opacity = v < 0.1 ? v * 10 : v > 0.78 ? (1 - v) * 4.55 : 1;
    return {
      opacity,
      transform: [
        { translateX: xOff + v * xOff * 0.3 },
        { translateY: -v * 64 },
        { scale: 1 - v * 0.65 },
      ],
    };
  });
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', bottom: 2, left: 30,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: col,
      shadowColor: col, shadowRadius: 6, shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 },
    }]} />
  );
}

function EmberSticker() {
  return (
    <View style={{ width: 60, height: 72, overflow: 'hidden' }}>
      {EMBER_CFG.map((c, i) => <Ember key={i} {...c} />)}
    </View>
  );
}

// ── 2. Electric Sparks ─────────────────────────────────────────────────────────

const ELECTRIC_CFG = [
  { dx:  1,    dy:  0,    del: 0,   col: '#00E5FF' },
  { dx:  0.71, dy:  0.71, del: 80,  col: '#FFFFFF' },
  { dx:  0,    dy:  1,    del: 160, col: '#9D00FF' },
  { dx: -0.71, dy:  0.71, del: 240, col: '#00E5FF' },
  { dx: -1,    dy:  0,    del: 320, col: '#FFFFFF' },
  { dx: -0.71, dy: -0.71, del: 400, col: '#9D00FF' },
  { dx:  0,    dy: -1,    del: 480, col: '#00E5FF' },
  { dx:  0.71, dy: -0.71, del: 560, col: '#FFFFFF' },
];

function ElectricSpark({ dx, dy, del, col }: typeof ELECTRIC_CFG[0]) {
  const clock = useClock();
  // Reproduces the original withSequence spark: 0→1→0.3→0.8→0, then idle, over 680ms.
  const p = useDerivedValue(() => {
    'worklet';
    const m = ((((clock.value * 1000 - (del % 320)) % 680) + 680) % 680);
    if (m < 100) { return m / 100; }                       // 0 → 1
    if (m < 180) { return 1 - (m - 100) / 80 * 0.7; }        // 1 → 0.3
    if (m < 240) { return 0.3 + (m - 180) / 60 * 0.5; }      // 0.3 → 0.8
    if (m < 340) { return 0.8 - (m - 240) / 100 * 0.8; }     // 0.8 → 0
    return 0;                                                // idle
  });
  const anim = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      { translateX: dx * p.value * 24 },
      { translateY: dy * p.value * 24 },
      { scale: 0.4 + p.value * 0.9 },
    ],
  }));
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: 27, left: 27,
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: col,
      shadowColor: col, shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 },
    }]} />
  );
}

function ElectricSticker() {
  return (
    <View style={{ width: 64, height: 64 }}>
      {ELECTRIC_CFG.map((c, i) => <ElectricSpark key={i} {...c} />)}
    </View>
  );
}

// ── 3. Blizzard ────────────────────────────────────────────────────────────────

const BLIZZARD_CFG = [
  { left:  6, del:   0, dur: 1100, size: 5, drift:  8 },
  { left: 18, del: 150, dur: 1350, size: 4, drift: -9 },
  { left: 30, del: 300, dur: 1050, size: 6, drift:  7 },
  { left: 44, del:  80, dur: 1250, size: 4, drift: -7 },
  { left: 56, del: 220, dur: 1200, size: 5, drift:  9 },
  { left: 12, del: 400, dur: 1100, size: 3, drift: -6 },
  { left: 38, del: 550, dur: 1300, size: 5, drift:  8 },
  { left: 52, del: 700, dur: 1150, size: 4, drift: -8 },
  { left: 24, del: 850, dur: 1050, size: 6, drift:  6 },
  { left: 64, del: 100, dur: 1350, size: 3, drift: -5 },
  { left:  4, del: 650, dur: 1250, size: 5, drift: 10 },
  { left: 48, del: 450, dur: 1200, size: 4, drift: -7 },
];

function BlizzardFlake({ left, del, dur, size, drift }: typeof BLIZZARD_CFG[0]) {
  const clock = useClock();
  const fall = useDerivedValue(() => sawtooth(clock.value, del, dur));
  const sway = useDerivedValue(() => triangle(clock.value, 0, 1900));
  const anim = useAnimatedStyle(() => ({
    opacity: fall.value < 0.05 ? fall.value * 20 : fall.value > 0.9 ? (1 - fall.value) * 10 : 1,
    transform: [
      { translateY: fall.value * 76 },
      { translateX: (sway.value * 2 - 1) * drift },
    ],
  }));
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: -size, left,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#DBEAFE',
    }]} />
  );
}

function BlizzardSticker() {
  return (
    <View style={{ width: 72, height: 80, overflow: 'hidden' }}>
      {BLIZZARD_CFG.map((c, i) => <BlizzardFlake key={i} {...c} />)}
    </View>
  );
}

// ── 4. Starburst ───────────────────────────────────────────────────────────────

const BURST_COLORS = ['#FFD700', '#FF4FA3', '#00E5FF', '#A05CFF', '#FFD700', '#FF4FA3', '#00E5FF', '#A05CFF'];
const BURST_CFG = [0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => ({
  dx: Math.round(Math.cos(deg * Math.PI / 180) * 1000) / 1000,
  dy: Math.round(Math.sin(deg * Math.PI / 180) * 1000) / 1000,
  del: i * 60,
  col: BURST_COLORS[i],
}));

function BurstParticle({ dx, dy, del, col }: typeof BURST_CFG[0]) {
  const clock = useClock();
  const p = useDerivedValue(() => sawtooth(clock.value, del % 240, 550));
  const anim = useAnimatedStyle(() => ({
    opacity: p.value > 0.6 ? (1 - p.value) * 2.5 : 1,
    transform: [
      { translateX: dx * p.value * 28 },
      { translateY: dy * p.value * 28 },
      { scale: 1.2 - p.value * 0.8 },
    ],
  }));
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: 28, left: 28,
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: col,
      shadowColor: col, shadowRadius: 5, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 },
    }]} />
  );
}

function StarburstSticker() {
  return (
    <View style={{ width: 64, height: 64 }}>
      {BURST_CFG.map((c, i) => <BurstParticle key={i} {...c} />)}
    </View>
  );
}

// ── 5. Pulse (expanding neon rings) ───────────────────────────────────────────

function PulseRing({ del, col }: { del: number; col: string }) {
  const clock = useClock();
  const p = useDerivedValue(() => sawtooth(clock.value, del, 1100));
  const anim = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ scale: 0.08 + p.value * 1.9 }],
  }));
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: 13, left: 13,
      width: 38, height: 38, borderRadius: 19,
      borderWidth: 2.5, borderColor: col,
      backgroundColor: 'transparent',
      shadowColor: col, shadowRadius: 8, shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 },
    }]} />
  );
}

function PulseSticker() {
  return (
    <View style={{ width: 64, height: 64 }}>
      <PulseRing del={0}   col="#FF4FA3" />
      <PulseRing del={367} col="#A05CFF" />
      <PulseRing del={733} col="#3B82F6" />
    </View>
  );
}

// ── 6. Orbit (circling glowing orbs) ─────────────────────────────────────────

function OrbitOrb({ col, radius, speed, del, size }: { col: string; radius: number; speed: number; del: number; size: number }) {
  const clock = useClock();
  const p = useDerivedValue(() => sawtooth(clock.value, del, speed));
  const anim = useAnimatedStyle(() => {
    const angle = p.value * 2 * Math.PI;
    return {
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius },
      ],
    };
  });
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: 32 - size / 2, left: 32 - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: col,
      shadowColor: col, shadowRadius: 8, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 },
    }]} />
  );
}

function OrbitSticker() {
  return (
    <View style={{ width: 64, height: 64 }}>
      <OrbitOrb col="#FF4FA3" radius={22} speed={1400} del={0}   size={9} />
      <OrbitOrb col="#A05CFF" radius={15} speed={1050} del={200} size={7} />
      <OrbitOrb col="#3B82F6" radius={26} speed={1800} del={400} size={8} />
      <OrbitOrb col="#00E5FF" radius={11} speed={850}  del={600} size={6} />
    </View>
  );
}

// ── 7. Lava (bubbling blobs rising) ───────────────────────────────────────────

const LAVA_CFG = [
  { left:  6, del:   0, dur: 1000, size: 12, col: '#FF4500' },
  { left: 20, del: 200, dur: 1200, size:  9, col: '#FF6B00' },
  { left: 35, del: 400, dur:  900, size: 13, col: '#FF2200' },
  { left: 50, del: 600, dur: 1100, size: 10, col: '#FF8C00' },
  { left: 14, del: 800, dur: 1050, size:  8, col: '#FFA500' },
  { left: 44, del: 100, dur:  950, size: 12, col: '#FF4500' },
];

function LavaBlob({ left, del, dur, size, col }: typeof LAVA_CFG[0]) {
  const clock = useClock();
  const p     = useDerivedValue(() => sawtooth(clock.value, del, dur));
  const pulse = useDerivedValue(() => 1 + triangle(clock.value, 0, 800) * 0.35);
  const anim = useAnimatedStyle(() => ({
    opacity: p.value < 0.1 ? p.value * 10 : p.value > 0.85 ? (1 - p.value) * 6.7 : 1,
    transform: [
      { translateY: -p.value * 68 },
      { scale: (1 - p.value * 0.4) * pulse.value },
    ],
  }));
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', bottom: 2, left,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: col,
      shadowColor: col, shadowRadius: 9, shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 },
    }]} />
  );
}

function LavaSticker() {
  return (
    <View style={{ width: 68, height: 80, overflow: 'hidden' }}>
      {LAVA_CFG.map((c, i) => <LavaBlob key={i} {...c} />)}
    </View>
  );
}

// ── 8. Matrix (digital rain) ──────────────────────────────────────────────────

const MATRIX_LEFT = [3, 17, 31, 45, 59, 73];
const MATRIX_DELS = [0, 170, 340, 510, 680, 850];

function MatrixCol({ left, del }: { left: number; del: number }) {
  const clock = useClock();
  const p = useDerivedValue(() => sawtooth(clock.value, del, 900));
  const head = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [{ translateY: p.value * 66 }],
  }));
  const trail1 = useAnimatedStyle(() => ({
    opacity: 0.55,
    transform: [{ translateY: Math.max(0, p.value - 0.08) * 66 }],
  }));
  const trail2 = useAnimatedStyle(() => ({
    opacity: 0.25,
    transform: [{ translateY: Math.max(0, p.value - 0.16) * 66 }],
  }));
  const cell: object = {
    position: 'absolute' as const, left, top: 0,
    width: 7, height: 10, borderRadius: 1, backgroundColor: '#00FF41',
  };
  return (
    <>
      <RAnimated.View style={[head,   cell, { shadowColor: '#00FF41', shadowRadius: 4, shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 } }]} />
      <RAnimated.View style={[trail1, cell]} />
      <RAnimated.View style={[trail2, cell]} />
    </>
  );
}

function MatrixSticker() {
  return (
    <View style={{ width: 84, height: 72, overflow: 'hidden', backgroundColor: 'rgba(0,8,0,0.45)', borderRadius: 6 }}>
      {MATRIX_LEFT.map((left, i) => <MatrixCol key={i} left={left} del={MATRIX_DELS[i]} />)}
    </View>
  );
}

// ── 9. Confetti burst ──────────────────────────────────────────────────────────

const CONFETTI_CFG = (() => {
  const pieces = [
    { xOff: -20, col: '#FF4FA3', isCircle: true,  rad: -Math.PI * 0.33 },
    { xOff:  -8, col: '#FFD700', isCircle: false,  rad: -Math.PI * 0.5  },
    { xOff:   0, col: '#A05CFF', isCircle: true,  rad: -Math.PI * 0.42 },
    { xOff:   8, col: '#3B82F6', isCircle: false,  rad: -Math.PI * 0.25 },
    { xOff:  18, col: '#06D6A0', isCircle: true,  rad: -Math.PI * 0.58 },
    { xOff: -14, col: '#EF476F', isCircle: false,  rad: -Math.PI * 0.39 },
    { xOff:  12, col: '#FF4FA3', isCircle: true,  rad: -Math.PI * 0.44 },
    { xOff:  -4, col: '#FFD700', isCircle: false,  rad: -Math.PI * 0.31 },
    { xOff:  24, col: '#A05CFF', isCircle: true,  rad: -Math.PI * 0.53 },
    { xOff: -22, col: '#3B82F6', isCircle: false,  rad: -Math.PI * 0.36 },
    { xOff:   4, col: '#EF476F', isCircle: true,  rad: -Math.PI * 0.47 },
    { xOff:  20, col: '#06D6A0', isCircle: false,  rad: -Math.PI * 0.4  },
  ];
  return pieces.map((p, i) => ({ ...p, del: i * 55 }));
})();

function ConfettiPiece({ xOff, col, isCircle, rad, del }: typeof CONFETTI_CFG[0]) {
  const clock = useClock();
  const p   = useDerivedValue(() => sawtooth(clock.value, del % 400, 900));
  const rot = useDerivedValue(() => sawtooth(clock.value, 0, 480));
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const anim = useAnimatedStyle(() => {
    const v = p.value;
    return {
      opacity: v > 0.85 ? (1 - v) * 6.7 : 1,
      transform: [
        { translateX: xOff + cosR * v * 40 },
        { translateY: sinR * v * 40 + v * v * 28 },
        { rotate: `${rot.value * 360}deg` },
        { scale: 1 - v * 0.25 },
      ],
    };
  });
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: 36, left: 36,
      width: isCircle ? 8 : 10, height: isCircle ? 8 : 5,
      borderRadius: isCircle ? 4 : 1,
      backgroundColor: col,
    }]} />
  );
}

function ConfettiSticker() {
  return (
    <View style={{ width: 80, height: 80 }}>
      {CONFETTI_CFG.map((c, i) => <ConfettiPiece key={i} {...c} />)}
    </View>
  );
}

// ── 10. Plasma (floating energy orbs) ─────────────────────────────────────────

const PLASMA_CFG = [
  { cx: 32, cy: 32, size: 18, col: '#A05CFF', pulseDur:  900, del:   0, floatAmt: 6 },
  { cx: 14, cy: 24, size: 12, col: '#FF4FA3', pulseDur:  750, del: 150, floatAmt: 8 },
  { cx: 46, cy: 18, size: 10, col: '#3B82F6', pulseDur: 1050, del: 300, floatAmt: 5 },
  { cx: 20, cy: 46, size: 13, col: '#00E5FF', pulseDur:  820, del: 450, floatAmt: 7 },
  { cx: 46, cy: 44, size: 11, col: '#FF6B00', pulseDur:  960, del: 600, floatAmt: 6 },
];

function PlasmaOrb({ cx, cy, size, col, pulseDur, del, floatAmt }: typeof PLASMA_CFG[0]) {
  const clock  = useClock();
  const pulse  = useDerivedValue(() => 1 + triangle(clock.value, del, pulseDur * 2) * 0.5);
  const floatY = useDerivedValue(() => triangle(clock.value, del, pulseDur * 1.3 * 2));
  const anim = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.15,
    transform: [
      { scale: pulse.value },
      { translateY: (floatY.value * 2 - 1) * floatAmt },
    ],
  }));
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: cy - size / 2, left: cx - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: col,
      shadowColor: col, shadowRadius: 12, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 },
    }]} />
  );
}

function PlasmaSticker() {
  return (
    <View style={{ width: 64, height: 64 }}>
      {PLASMA_CFG.map((c, i) => <PlasmaOrb key={i} {...c} />)}
    </View>
  );
}

// ─── Full-screen Overlay Sub-components ──────────────────────────────────────
// Module-level so they don't re-mount on parent re-render.

// Traveling glow dot around the border (used by NeonCircuitOverlay)
function BorderGlowDot({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  const p = useDerivedValue(() => sawtooth(clock.value, 0, 3000));
  const M = 10, W = width - M * 2, H = height - M * 2;
  const perim = 2 * (W + H);
  const anim = useAnimatedStyle(() => {
    const pos = p.value * perim;
    let x: number, y: number;
    if (pos <= W)              { x = M + pos;          y = M; }
    else if (pos <= W + H)     { x = M + W;            y = M + pos - W; }
    else if (pos <= 2 * W + H) { x = M + W - (pos - W - H); y = M + H; }
    else                       { x = M;                y = M + H - (pos - 2 * W - H); }
    return { transform: [{ translateX: x - 6 }, { translateY: y - 6 }] };
  });
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: 0, left: 0,
      width: 12, height: 12, borderRadius: 6,
      backgroundColor: '#FF4FA3',
      shadowColor: '#FF4FA3', shadowRadius: 16, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 },
    }]} />
  );
}

// Diagonal rainbow sweep (used by HologramOverlay)
function HoloSweep({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  const p = useDerivedValue(() => sawtooth(clock.value, 0, 2800));
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: -width * 0.5 + p.value * width * 1.5 }],
  }));
  return (
    <RAnimated.View style={[anim, { position: 'absolute', top: 0, left: 0, width: width * 0.45, height }]}>
      <LinearGradient
        colors={['transparent', 'rgba(255,0,180,0.10)', 'rgba(80,200,255,0.10)', 'rgba(100,255,180,0.10)', 'rgba(255,180,0,0.10)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </RAnimated.View>
  );
}

// Lightning screen flash (used by MonsoonOverlay)
function LightningFlash({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  // Two staggered strikes over a 5468ms cycle (matches the original withSequence).
  const p = useDerivedValue(() => {
    'worklet';
    const m = ((clock.value * 1000) % 5468 + 5468) % 5468;
    if (m < 2200) { return 0; }
    if (m < 2235) { return (m - 2200) / 35 * 0.85; }            // 0 → 0.85
    if (m < 2290) { return 0.85 - (m - 2235) / 55 * 0.85; }     // 0.85 → 0
    if (m < 2320) { return (m - 2290) / 30 * 0.65; }            // 0 → 0.65
    if (m < 2500) { return 0.65 - (m - 2320) / 180 * 0.65; }    // 0.65 → 0
    if (m < 5300) { return 0; }
    if (m < 5328) { return (m - 5300) / 28 * 0.9; }             // 0 → 0.9
    return 0.9 - (m - 5328) / 140 * 0.9;                        // 0.9 → 0
  });
  const anim = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <RAnimated.View style={[anim, {
      position: 'absolute', top: 0, left: 0, width, height,
      backgroundColor: 'rgba(200,215,255,0.45)',
    }]} />
  );
}

// Rain — layered for depth (far = thin/dim/slow, near = thick/bright/fast)
type RainBase = { seed: number; dur: number; durVar: number; len: number; lenVar: number; thickness: number; opacity: number; color: string };
function makeRain(count: number, b: RainBase) {
  return Array.from({ length: count }, (_, i) => ({
    leftPct:   ((i * 1733 + b.seed) % 997) / 997 * 100,
    del:       (i * 83 + b.seed) % 1100,
    dur:       b.dur + ((i * 37 + 13) % b.durVar),
    lenPx:     b.len + ((i * 19 + 5) % b.lenVar),
    thickness: b.thickness,
    opacity:   b.opacity + (i % 3) * 0.07,
    color:     b.color,
  }));
}
// Particle counts trimmed (~67→~42 Views) — Android RenderThread compositing scales with View
// count; the density reads near-identical on screen.
const RAIN_FAR  = makeRain(12, { seed: 317, dur: 620, durVar: 160, len: 14, lenVar: 10, thickness: 1,   opacity: 0.16, color: '#9FB4DC' });
const RAIN_MID  = makeRain(14, { seed: 533, dur: 420, durVar: 140, len: 24, lenVar: 16, thickness: 1.5, opacity: 0.32, color: '#B4D4FF' });
const RAIN_NEAR = makeRain(9,  { seed: 911, dur: 280, durVar: 120, len: 42, lenVar: 24, thickness: 2.5, opacity: 0.48, color: '#D6E8FF' });

// Rain streaks + splashes now render in MonsoonCanvas (Skia) — see components/SkiaParticles.tsx.

// Splash where a near-layer drop hits the ground
const SPLASH_CFG = Array.from({ length: 7 }, (_, i) => ({
  leftPct: ((i * 977 + 53) % 997) / 997 * 100,
  del:     (i * 137 + 11) % 900,
  dur:     420 + ((i * 53) % 220),
}));

// Inferno ember (full-screen, used by InfernoOverlay)
const INFERNO_CFG = Array.from({ length: 14 }, (_, i) => ({
  leftPct:  ((i * 1493 + 271) % 997) / 997 * 100,
  del:      (i * 157 + 3) % 2800,
  dur:      900 + ((i * 73 + 11) % 700),
  size:     6 + (i % 4) * 3,
  colorIdx: i % 4,
}));
// Embers now render in InfernoCanvas (Skia) — see components/SkiaParticles.tsx.

// Rising smoke wisp config (rendered in InfernoCanvas)
const SMOKE_CFG = Array.from({ length: 4 }, (_, i) => ({
  leftPct: ((i * 1399 + 211) % 997) / 997 * 100,
  del:     (i * 620) % 3600,
  dur:     3200 + ((i * 311) % 1600),
  size:    50 + (i % 3) * 26,
}));
// Heat-haze shimmer bar (used by InfernoOverlay)
const HAZE_CFG = [
  { leftPct: 18, dur: 1300, amp: 6, w: 60 },
  { leftPct: 46, dur: 1600, amp: 8, w: 82 },
  { leftPct: 72, dur: 1150, amp: 5, w: 56 },
];
function HeatBar({ leftPct, dur, amp, w, frameWidth, frameHeight }: typeof HAZE_CFG[0] & { frameWidth: number; frameHeight: number }) {
  const clock = useClock();
  const p = useDerivedValue(() => triangle(clock.value, 0, dur * 2));
  const left = leftPct * frameWidth / 100;
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: (p.value * 2 - 1) * amp }] }));
  return (
    <RAnimated.View style={[anim, { position: 'absolute', bottom: 0, left, width: w, height: frameHeight * 0.4 }]}>
      <LinearGradient colors={['transparent', 'rgba(255,140,40,0.06)']} style={{ flex: 1 }} />
    </RAnimated.View>
  );
}

// ─── Full-screen Overlay Exports ──────────────────────────────────────────────

// 1 ── VHS (analog tape: chroma bleed, dropouts, head-switching) ───────────────
export function VHSOverlay({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  const trackY = useDerivedValue(() => sawtooth(clock.value, 0, 5200));
  const chroma = useDerivedValue(() => triangle(clock.value, 0, 2600));
  const recOp  = useDerivedValue(() => 0.15 + 0.85 * triangle(clock.value, 0, 1400));
  const [drops, setDrops] = useState<{ y: number; left: number; w: number; op: number }[]>([]);
  const [hs, setHs]       = useState<{ left: number; w: number; top: number; op: number }[]>([]);
  // Regenerate the discrete noise per clock tick (n) — deterministic + pauses with the clock.
  const regen = useCallback((n: number) => {
    const count = n % 4 === 0 ? 2 + (n % 3) : 0;
    setDrops(Array.from({ length: count }, (_, i) => ({
      y:    ((n * 131 + i * 71) % 1000) / 1000 * height,
      left: ((n * 53 + i * 199) % 1000) / 1000 * width * 0.7,
      w:    20 + ((n * 17 + i * 13) % 60),
      op:   0.3 + ((n + i) % 4) * 0.14,
    })));
    setHs(Array.from({ length: 6 }, (_, i) => ({
      left: ((n * 91 + i * 137) % 1000) / 1000 * width,
      w:    12 + ((n * 23 + i * 31) % 44),
      top:  (i % 3) * 4,
      op:   0.28 + ((n * 7 + i) % 5) * 0.12,
    })));
  }, [width, height]);
  useAnimatedReaction(() => Math.floor(clock.value * 1000 / 200), (t) => runOnJS(regen)(t), [regen]);
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (trackY.value - 0.1) * height }],
    opacity: Math.sin(trackY.value * Math.PI),
  }));
  const redStyle  = useAnimatedStyle(() => ({ transform: [{ translateX: -1.5 - chroma.value * 2 }] }));
  const blueStyle = useAnimatedStyle(() => ({ transform: [{ translateX: 1.5 + chroma.value * 2 }] }));
  const recStyle  = useAnimatedStyle(() => ({ opacity: recOp.value }));
  return (
    <View style={{ width, height, position: 'absolute', top: 0, left: 0, overflow: 'hidden' }} pointerEvents="none">
      {/* Washed, slightly cool analog tint */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(74,66,104,0.06)' }} />
      {/* Chroma bleed — red/blue channels drift apart and wobble */}
      <RAnimated.View style={[redStyle,  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,40,60,0.05)' }]} />
      <RAnimated.View style={[blueStyle, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(50,90,255,0.05)' }]} />
      {/* Soft interlacing — every 6px instead of 3px (halves a large pile of static Views the
          Android RenderThread still composites each frame). */}
      {Array.from({ length: Math.floor(height / 6) }, (_, i) => (
        <View key={i} style={{ position: 'absolute', top: i * 6 + 1, left: 0, right: 0, height: 1, backgroundColor: 'rgba(0,0,0,0.06)' }} />
      ))}
      {/* Tracking band drifting up the frame */}
      <RAnimated.View style={[trackStyle, { position: 'absolute', left: 0, right: 0, height: height * 0.18 }]}>
        <LinearGradient
          colors={['transparent', 'rgba(220,225,255,0.05)', 'rgba(235,240,255,0.13)', 'rgba(220,225,255,0.05)', 'transparent']}
          style={{ flex: 1 }}
        />
      </RAnimated.View>
      {/* Tape dropouts */}
      {drops.map((d, i) => (
        <View key={i} style={{ position: 'absolute', top: d.y, left: d.left, width: d.w, height: 1.5, backgroundColor: `rgba(255,255,255,${d.op})` }} />
      ))}
      {/* Gradient vignette (soft, not hard bars) */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.18 }}>
        <LinearGradient colors={['rgba(0,0,0,0.42)', 'transparent']} style={{ flex: 1 }} />
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.2 }}>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={{ flex: 1 }} />
      </View>
      {/* Head-switching noise band */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, backgroundColor: 'rgba(130,130,140,0.16)' }}>
        {hs.map((h, i) => (
          <View key={i} style={{ position: 'absolute', top: h.top, left: h.left, width: h.w, height: 3, backgroundColor: `rgba(238,238,248,${h.op})` }} />
        ))}
      </View>
      {/* Minimal chrome — blinking REC + clean timecode */}
      <RAnimated.View style={[recStyle, { position: 'absolute', top: 18, left: 18, flexDirection: 'row', alignItems: 'center' }]}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF2D00', marginRight: 6, shadowColor: '#FF2D00', shadowRadius: 8, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>REC</Text>
      </RAnimated.View>
      <Text style={{ position: 'absolute', bottom: 22, right: 18, color: 'rgba(255,255,255,0.85)', fontSize: 13, letterSpacing: 1, fontFamily: FONT.BODY_MEDIUM }}>0:03:42</Text>
    </View>
  );
}

// 2 ── Cinema (anamorphic letterbox, fine grain, dust, gate flicker) ───────────
export function FilmOverlay({ width, height }: { width: number; height: number }) {
  const [grain, setGrain]     = useState<{ x: number; y: number; op: number }[]>([]);
  const [scratch, setScratch] = useState<{ x: number; op: number }[]>([]);
  const clock = useClock();
  // gentle gate-flicker (was a withSequence yoyo ~780ms round trip)
  const flicker = useDerivedValue(() => 1 - triangle(clock.value, 0, 780) * 0.1);
  // Regenerate grain + scratches per clock tick (n) — deterministic + pauses with the clock.
  const regen = useCallback((n: number) => {
    setGrain(Array.from({ length: 38 }, (_, i) => ({
      x:  ((n * 79 + i * 131) % 997) / 997 * width,
      y:  ((n * 53 + i * 97)  % 997) / 997 * height,
      op: 0.1 + ((n * 3 + i) % 5) * 0.05,
    })));
    const sc = n % 6 === 0 ? 1 + (n % 2) : 0;
    setScratch(Array.from({ length: sc }, (_, i) => ({
      x:  ((n * 167 + i * 311) % 1000) / 1000 * width,
      op: 0.16 + ((n + i) % 3) * 0.1,
    })));
  }, [width, height]);
  useAnimatedReaction(() => Math.floor(clock.value * 1000 / 180), (t) => runOnJS(regen)(t), [regen]);
  const LB = Math.round(height * 0.11); // anamorphic letterbox bar
  const flickStyle = useAnimatedStyle(() => ({ opacity: (1 - flicker.value) * 0.45 }));
  return (
    <View style={{ width, height, position: 'absolute', top: 0, left: 0, overflow: 'hidden' }} pointerEvents="none">
      {/* Warm halation grade */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,178,92,0.05)' }} />
      {/* Fine grain */}
      {grain.map((g, i) => (
        <View key={i} style={{ position: 'absolute', left: g.x, top: g.y, width: 1, height: 1, backgroundColor: `rgba(255,250,236,${g.op})` }} />
      ))}
      {/* Dust scratches */}
      {scratch.map((sc, i) => (
        <View key={i} style={{ position: 'absolute', top: LB, bottom: LB, left: sc.x, width: 1, backgroundColor: `rgba(255,250,236,${sc.op})` }} />
      ))}
      {/* Gate flicker — exposure pulse */}
      <RAnimated.View style={[flickStyle, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }]} />
      {/* Soft top/bottom vignette */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.32 }}>
        <LinearGradient colors={['rgba(0,0,0,0.34)', 'transparent']} style={{ flex: 1 }} />
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.32 }}>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.34)']} style={{ flex: 1 }} />
      </View>
      {/* Cinemascope letterbox bars */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: LB, backgroundColor: '#000' }} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: LB, backgroundColor: '#000' }} />
    </View>
  );
}

// 3 ── Glitch (intermittent datamosh: corruption blocks + RGB split) ───────────
export function GlitchOverlay({ width, height }: { width: number; height: number }) {
  const [blocks, setBlocks] = useState<{ x: number; y: number; w: number; h: number; dx: number; tint: string }[]>([]);
  const [tear, setTear]     = useState<{ y: number; h: number; dx: number }[]>([]);
  const clock = useClock();
  // Scan line shoots down in 160ms, then rests at the bottom for the rest of a 2560ms cycle.
  const sweep = useDerivedValue(() => {
    'worklet';
    const m = ((clock.value * 1000) % 2560 + 2560) % 2560;
    return m < 160 ? m / 160 : 1;
  });
  // RGB split flashes on each burst tick (every 3rd 120ms tick) — pure function of the clock.
  const rgb = useDerivedValue(() => {
    'worklet';
    const tick = Math.floor(clock.value * 1000 / 120);
    if (tick % 3 !== 0) { return 0; }
    const into = (clock.value * 1000) % 120;
    return into < 40 ? into / 40 : Math.max(0, 1 - (into - 40) / 80);
  });
  // Datamosh blocks + tears regenerate on each burst tick — deterministic + pauses with clock.
  const regen = useCallback((tick: number) => {
    const burst = tick % 3 === 0;
    const n = tick + 1;
    setBlocks(burst ? Array.from({ length: 4 + (n % 4) }, (_, i) => ({
      x:    ((n * 53 + i * 167) % 1000) / 1000 * width,
      y:    ((n * 97 + i * 211) % 1000) / 1000 * height,
      w:    40 + ((n * 17 + i * 29) % 130),
      h:    8 + ((n * 7 + i * 13) % 26),
      dx:   ((n * 11 + i * 23) % 40) - 20,
      tint: i % 3 === 0 ? 'rgba(255,0,90,0.25)' : i % 3 === 1 ? 'rgba(0,230,255,0.22)' : 'rgba(255,255,255,0.14)',
    })) : []);
    setTear(burst ? Array.from({ length: 3 }, (_, i) => ({
      y:  ((n * 131 + i * 317) % 1000) / 1000 * height,
      h:  2 + i * 4,
      dx: ((n * 19 + i * 7) % 50) - 25,
    })) : []);
  }, [width, height]);
  useAnimatedReaction(() => Math.floor(clock.value * 1000 / 220), (t) => runOnJS(regen)(t), [regen]);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * height }],
    opacity: sweep.value < 0.05 ? 1 : sweep.value > 0.9 ? 0 : 0.5,
  }));
  const redStyle  = useAnimatedStyle(() => ({ opacity: rgb.value * 0.5, transform: [{ translateX: -3 - rgb.value * 4 }] }));
  const blueStyle = useAnimatedStyle(() => ({ opacity: rgb.value * 0.5, transform: [{ translateX: 3 + rgb.value * 4 }] }));
  return (
    <View style={{ width, height, position: 'absolute', top: 0, left: 0, overflow: 'hidden' }} pointerEvents="none">
      {/* Subtle persistent scanlines — every 8px instead of 4px (fewer static Views to composite). */}
      {Array.from({ length: Math.floor(height / 8) }, (_, i) => (
        <View key={i} style={{ position: 'absolute', top: i * 8, left: 0, right: 0, height: 1, backgroundColor: 'rgba(0,0,0,0.05)' }} />
      ))}
      {/* RGB split flash */}
      <RAnimated.View style={[redStyle,  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,0,90,0.4)' }]} />
      <RAnimated.View style={[blueStyle, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,230,255,0.4)' }]} />
      {/* Datamosh corruption blocks */}
      {blocks.map((b, i) => (
        <View key={i} style={{ position: 'absolute', top: b.y, left: b.x + b.dx, width: b.w, height: b.h, backgroundColor: b.tint }} />
      ))}
      {/* Tear lines */}
      {tear.map((t, i) => (
        <View key={i} style={{ position: 'absolute', top: t.y, left: Math.max(0, t.dx), right: Math.max(0, -t.dx), height: t.h, backgroundColor: 'rgba(255,255,255,0.7)' }} />
      ))}
      {/* Scan sweep */}
      <RAnimated.View style={[sweepStyle, {
        position: 'absolute', top: -2, left: 0, right: 0, height: 2,
        backgroundColor: 'rgba(0,230,255,0.85)',
        shadowColor: '#00E6FF', shadowRadius: 10, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 },
      }]} />
    </View>
  );
}

// 4 ── Lens (anamorphic streak flare + breathing vignette + bokeh) ─────────────
export function VignetteOverlay({ width, height }: { width: number; height: number }) {
  const clock  = useClock();
  const breath = useDerivedValue(() => triangle(clock.value, 0, 6000));
  const bokeh  = useDerivedValue(() => triangle(clock.value, 0, 18000));
  // Lens flare: idle, then a quick bloom (0→1→0.6→0) over a 4740ms cycle.
  const flare  = useDerivedValue(() => {
    'worklet';
    const m = ((clock.value * 1000) % 4740 + 4740) % 4740;
    if (m < 3600) { return 0; }
    if (m < 3840) { return (m - 3600) / 240; }
    if (m < 4040) { return 1 - (m - 3840) / 200 * 0.4; }
    return Math.max(0, 0.6 - (m - 4040) / 700 * 0.6);
  });
  const vigStyle    = useAnimatedStyle(() => ({ opacity: 0.7 + breath.value * 0.3 }));
  const flareStyle  = useAnimatedStyle(() => ({ opacity: flare.value }));
  const streakStyle = useAnimatedStyle(() => ({ opacity: flare.value * 0.85, transform: [{ scaleX: 0.75 + flare.value * 0.5 }] }));
  const bokeh1 = useAnimatedStyle(() => ({ opacity: 0.1 + Math.sin(bokeh.value * Math.PI) * 0.1, transform: [{ translateX: -16 + bokeh.value * 34 }, { translateY: 12 - bokeh.value * 26 }] }));
  const bokeh2 = useAnimatedStyle(() => ({ opacity: 0.08 + Math.sin(bokeh.value * Math.PI) * 0.08, transform: [{ translateX: 20 - bokeh.value * 28 }, { translateY: -10 + bokeh.value * 22 }] }));
  const flareY = height * 0.2;
  return (
    <View style={{ width, height, position: 'absolute', top: 0, left: 0, overflow: 'hidden' }} pointerEvents="none">
      {/* Breathing vignette — soft gradients on all four edges */}
      <RAnimated.View style={[vigStyle, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.45 }}>
          <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent']} style={{ flex: 1 }} />
        </View>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.45 }}>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={{ flex: 1 }} />
        </View>
        <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: width * 0.28 }}>
          <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </View>
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: width * 0.28 }}>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.4)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </View>
      </RAnimated.View>
      {/* Drifting bokeh */}
      <RAnimated.View style={[bokeh1, { position: 'absolute', top: height * 0.3, left: width * 0.7, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(170,200,255,0.5)' }]} />
      <RAnimated.View style={[bokeh2, { position: 'absolute', top: height * 0.55, left: width * 0.2, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,220,180,0.5)' }]} />
      {/* Anamorphic horizontal streak — the signature blue lens flare */}
      <RAnimated.View style={[streakStyle, { position: 'absolute', top: flareY, left: 0, right: 0, height: 3 }]}>
        <LinearGradient colors={['transparent', 'rgba(90,160,255,0.55)', 'rgba(180,210,255,0.85)', 'rgba(90,160,255,0.55)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </RAnimated.View>
      {/* Flare core + secondary ghost */}
      <RAnimated.View style={[flareStyle, { position: 'absolute', top: flareY - 18, left: width * 0.62 }]}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(220,235,255,0.7)', shadowColor: '#DCEBFF', shadowRadius: 24, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
      </RAnimated.View>
      <RAnimated.View style={[flareStyle, { position: 'absolute', top: flareY - 6, left: width * 0.3, width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(150,190,255,0.5)', shadowColor: '#96BEFF', shadowRadius: 10, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }]} />
    </View>
  );
}

// 5 ── Neon Circuit (border + corner brackets + traveling glow) ─────────────────
export function NeonBorderOverlay({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  const pulse = useDerivedValue(() => 1 - triangle(clock.value, 0, 2100) * 0.62); // 1 ↔ 0.38
  const pStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const M = 10, CS = 22;
  return (
    <View style={{ width, height, position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      {/* Outer border */}
      <RAnimated.View style={[pStyle, {
        position: 'absolute', top: M, left: M, right: M, bottom: M,
        borderWidth: 1.5, borderColor: '#FF4FA3', borderRadius: 2,
        shadowColor: '#FF4FA3', shadowRadius: 14, shadowOpacity: 0.85, shadowOffset: { width: 0, height: 0 },
      }]} />
      {/* Inner border */}
      <RAnimated.View style={[pStyle, {
        position: 'absolute', top: M + 7, left: M + 7, right: M + 7, bottom: M + 7,
        borderWidth: 0.5, borderColor: '#A05CFF', borderRadius: 1,
      }]} />
      {/* Corner brackets — top-left */}
      <View style={{ position: 'absolute', top: M, left: M, width: CS, height: CS }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#FF4FA3', shadowColor: '#FF4FA3', shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
        <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: '#FF4FA3', shadowColor: '#FF4FA3', shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
      </View>
      {/* Corner brackets — top-right */}
      <View style={{ position: 'absolute', top: M, right: M, width: CS, height: CS }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#FF4FA3', shadowColor: '#FF4FA3', shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, backgroundColor: '#FF4FA3', shadowColor: '#FF4FA3', shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
      </View>
      {/* Corner brackets — bottom-left */}
      <View style={{ position: 'absolute', bottom: M, left: M, width: CS, height: CS }}>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#FF4FA3', shadowColor: '#FF4FA3', shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
        <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: '#FF4FA3', shadowColor: '#FF4FA3', shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
      </View>
      {/* Corner brackets — bottom-right */}
      <View style={{ position: 'absolute', bottom: M, right: M, width: CS, height: CS }}>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#FF4FA3', shadowColor: '#FF4FA3', shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, backgroundColor: '#FF4FA3', shadowColor: '#FF4FA3', shadowRadius: 6, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 } }} />
      </View>
      {/* Traveling glow */}
      <BorderGlowDot width={width} height={height} />
      {/* Status text */}
      <Text style={{ position: 'absolute', top: M + 8, left: M + CS + 6, color: 'rgba(255,79,163,0.85)', fontSize: 9, fontWeight: '700', letterSpacing: 1.5 }}>● LIVE</Text>
      <Text style={{ position: 'absolute', bottom: M + 8, right: M + 10, color: 'rgba(160,92,255,0.75)', fontSize: 9, letterSpacing: 1 }}>vidrip.tv</Text>
    </View>
  );
}

// 6 ── Monsoon (parallax rain layers + splashes + lightning) ───────────────────
export function SnowSceneOverlay({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  // Adaptive quality: shed rain/splash particles on devices that can't keep up.
  const q = useStudioQuality(s => s.quality);
  const far = RAIN_FAR.slice(0, scaleCount(RAIN_FAR.length, q));
  const mid = RAIN_MID.slice(0, scaleCount(RAIN_MID.length, q));
  const near = RAIN_NEAR.slice(0, scaleCount(RAIN_NEAR.length, q));
  const splash = SPLASH_CFG.slice(0, scaleCount(SPLASH_CFG.length, q));
  return (
    <View style={{ width, height, position: 'absolute', top: 0, left: 0, overflow: 'hidden' }} pointerEvents="none">
      {/* Storm sky — cool grade, darker overhead */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,18,34,0.32)' }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.5 }}>
        <LinearGradient colors={['rgba(8,12,26,0.5)', 'transparent']} style={{ flex: 1 }} />
      </View>
      {/* Lightning behind the rain for depth */}
      <LightningFlash width={width} height={height} />
      {/* All rain layers + ground splashes in a single Skia canvas (one GPU layer vs ~46 Views) */}
      <MonsoonCanvas width={width} height={height} far={far} mid={mid} near={near} splash={splash} clock={clock} />
      {/* Wet ground sheen */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.08 }}>
        <LinearGradient colors={['transparent', 'rgba(90,120,180,0.28)']} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

// 7 ── Inferno (rising embers + smoke wisps + heat haze) ────────────────────────
export function InfernoOverlay({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  // Adaptive quality: shed embers/smoke on devices that can't keep up.
  const q = useStudioQuality(s => s.quality);
  const embers = INFERNO_CFG.slice(0, scaleCount(INFERNO_CFG.length, q));
  const smoke = SMOKE_CFG.slice(0, scaleCount(SMOKE_CFG.length, q));
  // Heat flicker: 1→0.82→1→0.9→1 over a 425ms cycle.
  const flicker = useDerivedValue(() => {
    'worklet';
    const m = ((clock.value * 1000) % 425 + 425) % 425;
    if (m < 80)  { return 1 - m / 80 * 0.18; }
    if (m < 135) { return 0.82 + (m - 80) / 55 * 0.18; }
    if (m < 245) { return 1 - (m - 135) / 110 * 0.1; }
    return 0.9 + (m - 245) / 180 * 0.1;
  });
  const flickStyle = useAnimatedStyle(() => ({ opacity: flicker.value }));
  const glowStyle  = useAnimatedStyle(() => ({ opacity: 0.7 + flicker.value * 0.3 }));
  return (
    <View style={{ width, height, position: 'absolute', top: 0, left: 0, overflow: 'hidden' }} pointerEvents="none">
      {/* Heat tint — flickering */}
      <RAnimated.View style={[flickStyle, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,70,0,0.09)' }]} />
      {/* Heat-haze shimmer */}
      {HAZE_CFG.map((c, i) => <HeatBar key={`hz${i}`} {...c} frameWidth={width} frameHeight={height} />)}
      {/* Bottom fire glow — flickers with the heat */}
      <RAnimated.View style={[glowStyle, { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.34 }]}>
        <LinearGradient colors={['transparent', 'rgba(255,80,0,0.18)', 'rgba(255,40,0,0.4)']} style={{ flex: 1 }} />
      </RAnimated.View>
      {/* Smoke + embers in one Skia canvas (one GPU layer vs ~31 Views) */}
      <InfernoCanvas width={width} height={height} embers={embers} smoke={smoke} clock={clock} />
    </View>
  );
}

// 8 ── Hologram (rainbow sweep + scanlines + HUD) ──────────────────────────────
export function HologramOverlay({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  const scan  = useDerivedValue(() => sawtooth(clock.value, 0, 3200));
  const pulse = useDerivedValue(() => 0.55 + triangle(clock.value, 0, 3200) * 0.45); // 0.55 ↔ 1
  const scanStyle  = useAnimatedStyle(() => ({
    transform: [{ translateY: scan.value * height }],
  }));
  const borderStyle = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.45 }));
  return (
    <View style={{ width, height, position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      {/* Teal tint */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,255,200,0.04)' }} />
      {/* Horizontal scanlines */}
      {Array.from({ length: 22 }, (_, i) => (
        <View key={i} style={{ position: 'absolute', top: (i / 22) * height, left: 0, right: 0, height: 1, backgroundColor: 'rgba(0,255,200,0.065)' }} />
      ))}
      {/* Rainbow sweep */}
      <HoloSweep width={width} height={height} />
      {/* Scan line */}
      <RAnimated.View style={[scanStyle, {
        position: 'absolute', top: -2, left: 0, right: 0, height: 2,
        backgroundColor: 'rgba(0,255,200,0.9)',
        shadowColor: '#00FFC8', shadowRadius: 8, shadowOpacity: 1, shadowOffset: { width: 0, height: 0 },
      }]} />
      {/* Border */}
      <RAnimated.View style={[borderStyle, {
        position: 'absolute', top: 8, left: 8, right: 8, bottom: 8,
        borderWidth: 1, borderColor: 'rgba(0,255,200,0.65)', borderRadius: 2,
      }]} />
      {/* HUD text */}
      <Text style={{ position: 'absolute', top: 14, left: 16, color: 'rgba(0,255,200,0.78)', fontSize: 9, fontWeight: '700', letterSpacing: 1.5 }}>HOLO</Text>
      <Text style={{ position: 'absolute', top: 14, right: 16, color: 'rgba(0,255,200,0.62)', fontSize: 9, letterSpacing: 1 }}>SRC://LIVE</Text>
      <Text style={{ position: 'absolute', bottom: 14, left: 16, color: 'rgba(0,255,200,0.62)', fontSize: 9, letterSpacing: 1 }}>v2.1.4</Text>
      <Text style={{ position: 'absolute', bottom: 14, right: 16, color: 'rgba(0,255,200,0.62)', fontSize: 9, letterSpacing: 1 }}>{'■■■□ 78%'}</Text>
    </View>
  );
}

// ─── Image Stickers (individual PNGs) ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const VIDRIP_SRC = require('../../assets/sticker-vidrip.png') as number;

/* eslint-disable @typescript-eslint/no-var-requires */
const CREATOR_PNG: { key: string; label: string; src: number }[] = [
  { key: 'behind_scenes', label: 'Behind the Scenes',     src: require('../../assets/stickers/creators/png/sticker_01.png') },
  { key: 'like',          label: 'Like',                  src: require('../../assets/stickers/creators/png/sticker_02.png') },
  { key: 'follow',        label: 'Follow',                src: require('../../assets/stickers/creators/png/sticker_03.png') },
  { key: 'comment',       label: 'Comment',               src: require('../../assets/stickers/creators/png/sticker_04.png') },
  { key: 'subscribe',     label: 'Subscribe!',            src: require('../../assets/stickers/creators/png/sticker_05.png') },
  { key: 'new_video',     label: 'New Video!',            src: require('../../assets/stickers/creators/png/sticker_06.png') },
  { key: 'coming_soon',   label: 'Coming Soon!',          src: require('../../assets/stickers/creators/png/sticker_32.png') },
  { key: 'stay_tuned',    label: 'Stay Tuned!',           src: require('../../assets/stickers/creators/png/sticker_33.png') },
  { key: 'link_in_bio',   label: 'Link in Bio!',          src: require('../../assets/stickers/creators/png/sticker_34.png') },
  { key: 'thank_you',     label: 'Thank You!',            src: require('../../assets/stickers/creators/png/sticker_35.png') },
  { key: 'lets_go',       label: "Let's Go!",             src: require('../../assets/stickers/creators/png/sticker_36.png') },
  { key: 'update',        label: 'Update!',               src: require('../../assets/stickers/creators/png/sticker_37.png') },
  { key: 'daily_upload',  label: 'Daily Upload!',         src: require('../../assets/stickers/creators/png/sticker_79.png') },
  { key: 'notifs',        label: 'Turn on Notifications!',src: require('../../assets/stickers/creators/png/sticker_80.png') },
  { key: 'swipe_up',      label: 'Swipe Up!',             src: require('../../assets/stickers/creators/png/sticker_81.png') },
  { key: 'its_live',      label: "It's Live!",            src: require('../../assets/stickers/creators/png/sticker_82.png') },
  { key: 'epic_content',  label: 'Epic Content!',         src: require('../../assets/stickers/creators/png/sticker_83.png') },
  { key: 'watch_now',     label: 'Watch Now!',            src: require('../../assets/stickers/creators/png/sticker_84.png') },
  { key: 'ring_light',    label: 'Ring Light',            src: require('../../assets/stickers/creators/png/sticker_119.png') },
  { key: 'mic',           label: 'Mic',                   src: require('../../assets/stickers/creators/png/sticker_120.png') },
  { key: 'cam_tripod',    label: 'Phone Tripod',          src: require('../../assets/stickers/creators/png/sticker_121.png') },
  { key: 'laptop',        label: 'Laptop',                src: require('../../assets/stickers/creators/png/sticker_122.png') },
  { key: 'camera',        label: 'Camera',                src: require('../../assets/stickers/creators/png/sticker_123.png') },
  { key: 'video_cam',     label: 'Video Camera',          src: require('../../assets/stickers/creators/png/sticker_124.png') },
  { key: 'lightbulb',     label: 'Lightbulb',             src: require('../../assets/stickers/creators/png/sticker_132.png') },
  { key: 'growth',        label: 'Growth',                src: require('../../assets/stickers/creators/png/sticker_133.png') },
  { key: 'fire',          label: 'Fire',                  src: require('../../assets/stickers/creators/png/sticker_135.png') },
  { key: 'arrow_up',      label: 'Arrow Up',              src: require('../../assets/stickers/creators/png/sticker_136.png') },
  { key: 'heart',         label: 'Heart',                 src: require('../../assets/stickers/creators/png/sticker_139.png') },
  { key: 'curved_arrow',  label: 'Curved Arrow',          src: require('../../assets/stickers/creators/png/sticker_140.png') },
];

const REACTOR_PNG: { key: string; label: string; src: number }[] = [
  { key: 'reaction_time',  label: 'Reaction Time',       src: require('../../assets/stickers/reactors/png/01-reaction-time.png') },
  { key: 'omg',            label: 'OMG!',                src: require('../../assets/stickers/reactors/png/02-omg.png') },
  { key: 'lol',            label: 'LOL!',                src: require('../../assets/stickers/reactors/png/03-lol-laughing.png') },
  { key: 'live_reaction',  label: 'Live Reaction',       src: require('../../assets/stickers/reactors/png/04-live-reaction.png') },
  { key: 'crazy',          label: 'Crazy!',              src: require('../../assets/stickers/reactors/png/05-crazy.png') },
  { key: 'whoa',           label: 'Whoa!',               src: require('../../assets/stickers/reactors/png/06-whoa.png') },
  { key: 'question',       label: '?!',                  src: require('../../assets/stickers/reactors/png/07-question-exclamation.png') },
  { key: 'zoom_in',        label: 'Zoom In!',            src: require('../../assets/stickers/reactors/png/08-zoom-in.png') },
  { key: 'no_way',         label: 'No Way!',             src: require('../../assets/stickers/reactors/png/09-no-way.png') },
  { key: 'teary_gasp',     label: 'Teary Gasp',          src: require('../../assets/stickers/reactors/png/10-teary-gasp.png') },
  { key: 'wow',            label: 'WOW!',                src: require('../../assets/stickers/reactors/png/11-wow.png') },
  { key: 'heart_bang',     label: 'Heart!',              src: require('../../assets/stickers/reactors/png/12-heart-exclamation.png') },
  { key: 'arrows',         label: 'Arrows',              src: require('../../assets/stickers/reactors/png/13-red-blue-arrows.png') },
  { key: 'yellow_curved',  label: 'Curved Arrow',        src: require('../../assets/stickers/reactors/png/14-yellow-curved-arrow.png') },
  { key: 'red_curved',     label: 'Red Arrow',           src: require('../../assets/stickers/reactors/png/15-red-curved-arrow.png') },
  { key: 'fire_r',         label: 'Fire',                src: require('../../assets/stickers/reactors/png/16-fire.png') },
  { key: 'surprised',      label: 'Surprised',           src: require('../../assets/stickers/reactors/png/17-surprised-face.png') },
  { key: 'thumbs_up',      label: 'Thumbs Up',           src: require('../../assets/stickers/reactors/png/18-thumbs-up.png') },
  { key: 'shocked',        label: 'Shocked',             src: require('../../assets/stickers/reactors/png/19-surprised-face-2.png') },
  { key: 'totally_shocked',label: 'Totally Shocked',     src: require('../../assets/stickers/reactors/png/20-totally-shocked.png') },
  { key: 'cant_stop',      label: "Can't Stop Laughing", src: require('../../assets/stickers/reactors/png/21-cant-stop-laughing.png') },
  { key: 'lol_bubble',     label: 'LOL',                 src: require('../../assets/stickers/reactors/png/22-lol-speech-bubble.png') },
  { key: 'yellow_arrow',   label: 'Arrow',               src: require('../../assets/stickers/reactors/png/23-yellow-arrow.png') },
  { key: 'red_q',          label: 'Red Q',               src: require('../../assets/stickers/reactors/png/24-red-q.png') },
  { key: 'smiling',        label: 'Smiling',             src: require('../../assets/stickers/reactors/png/25-smiling-face.png') },
  { key: 'surprised3',     label: 'Surprised',           src: require('../../assets/stickers/reactors/png/26-surprised-face-3.png') },
  { key: 'my_reaction',    label: 'My Reaction',         src: require('../../assets/stickers/reactors/png/27-my-reaction.png') },
  { key: 'what_happened',  label: 'What Happened?',      src: require('../../assets/stickers/reactors/png/28-what-just-happened.png') },
];
/* eslint-enable @typescript-eslint/no-var-requires */

// Render a PNG sticker at a fixed height, preserving its natural aspect ratio.
function PngSticker({ source, height = 64 }: { source: number; height?: number }) {
  const meta  = Image.resolveAssetSource(source);
  const ratio = meta && meta.height ? meta.width / meta.height : 1;
  return <Image source={source} style={{ height, width: height * ratio }} resizeMode="contain" />;
}

const stickers: StickerDef[] = [
  { key: 'st_vidrip', label: 'vidrip', category: 'sticker', render: () => <PngSticker source={VIDRIP_SRC} height={80} /> },
  ...CREATOR_PNG.map((p): StickerDef => ({
    key: `sc_${p.key}`, label: p.label, category: 'sticker', render: () => <PngSticker source={p.src} />,
  })),
  ...REACTOR_PNG.map((p): StickerDef => ({
    key: `sr_${p.key}`, label: p.label, category: 'sticker', render: () => <PngSticker source={p.src} />,
  })),
];

// ─── Catalog ─────────────────────────────────────────────────────────────────

export type StickerCategory = 'emoji' | 'sticker' | 'animated' | 'overlay';

export type StickerDef = {
  key: string;
  label: string;
  category: StickerCategory;
  render: () => React.ReactNode;
  renderFull?: (w: number, h: number) => React.ReactNode;
  isFullscreen?: boolean;
};

const emoji = (e: string): StickerDef => ({ key: `e_${e}`, label: e, category: 'emoji', render: () => <Text style={s.emoji}>{e}</Text> });

const branded: StickerDef[] = [
  { key: 'logo',    label: 'vidrip',  category: 'emoji', render: () => (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <GradientText text="vidrip" size={30} font={FONT.DISPLAY_BOLD} letterSpacing={-0.5} />
        <Text style={{ fontSize: 20, marginLeft: 2 }}>💧</Text>
      </View>
    </View>
  )},
  { key: 'vidrip',  label: 'VIDRIP',  category: 'emoji', render: () => <GradientText text="VIDRIP" size={40} /> },
  { key: 'dripword',label: 'drip',    category: 'emoji', render: () => <GradientText text="drip" size={44} letterSpacing={0} /> },
  { key: 'pov',     label: 'POV',     category: 'emoji', render: () => <GradientText text="POV" size={44} letterSpacing={2} /> },
  { key: 'fyp',     label: 'fyp',     category: 'emoji', render: () => <GradientText text="fyp" size={44} letterSpacing={0} /> },
  { key: 'badge',   label: '🎬vidrip',category: 'emoji', render: () => <GradientPill text="🎬 vidrip" /> },
  { key: 'live',    label: 'LIVE',    category: 'emoji', render: () => <GradientPill text="● LIVE" /> },
  { key: 'newdrop', label: 'NEW DROP',category: 'emoji', render: () => <GradientPill text="NEW DROP 💧" /> },
  { key: 'grwm',    label: 'GRWM',    category: 'emoji', render: () => <GradientPill text="GRWM" /> },
  { key: 'ootd',    label: 'OOTD',    category: 'emoji', render: () => <GradientPill text="OOTD ✨" /> },
  { key: 'sale',    label: 'SALE',    category: 'emoji', render: () => <GradientPill text="SALE 🔥" /> },
  { key: 'tap',     label: 'TAP IN',  category: 'emoji', render: () => <GradientPill text="TAP IN 👀" /> },
  { key: 'sub',     label: 'SUB',     category: 'emoji', render: () => <GradientPill text="SUBSCRIBE 💜" /> },
  { key: 'trending',label: 'TREND',   category: 'emoji', render: () => <GradientPill text="TRENDING 📈" /> },
  { key: 'collab',  label: 'COLLAB',  category: 'emoji', render: () => <GradientPill text="COLLAB 🤝" /> },
  { key: 'drop',    label: 'DROP',    category: 'emoji', render: () => <GradientPill text="DROP NOW 💥" /> },
];

const animated: StickerDef[] = [
  { key: 'a_embers',   label: 'Embers',   category: 'animated', render: () => <EmberSticker /> },
  { key: 'a_electric', label: 'Electric', category: 'animated', render: () => <ElectricSticker /> },
  { key: 'a_blizzard', label: 'Blizzard', category: 'animated', render: () => <BlizzardSticker /> },
  { key: 'a_burst',    label: 'Burst',    category: 'animated', render: () => <StarburstSticker /> },
  { key: 'a_pulse',    label: 'Pulse',    category: 'animated', render: () => <PulseSticker /> },
  { key: 'a_orbit',    label: 'Orbit',    category: 'animated', render: () => <OrbitSticker /> },
  { key: 'a_lava',     label: 'Lava',     category: 'animated', render: () => <LavaSticker /> },
  { key: 'a_matrix',   label: 'Matrix',   category: 'animated', render: () => <MatrixSticker /> },
  { key: 'a_confetti', label: 'Confetti', category: 'animated', render: () => <ConfettiSticker /> },
  { key: 'a_plasma',   label: 'Plasma',   category: 'animated', render: () => <PlasmaSticker /> },
];

const overlays: StickerDef[] = [
  {
    key: 'ov_vhs', label: 'VHS', category: 'overlay', isFullscreen: true,
    render: () => (
      <View style={{ width: 44, height: 56, backgroundColor: '#080808', borderRadius: 4, overflow: 'hidden' }}>
        {[0.2,0.4,0.6,0.8].map(p => <View key={p} style={{ position: 'absolute', top: p * 56, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />)}
        <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D00', marginRight: 4 }} />
          <Text style={{ color: '#fff', fontSize: 7, fontWeight: '700', letterSpacing: 1 }}>REC</Text>
        </View>
        <Text style={{ position: 'absolute', bottom: 7, right: 6, color: 'rgba(255,220,0,0.85)', fontSize: 6 }}>00:03:42</Text>
      </View>
    ),
    renderFull: (w, h) => <VHSOverlay width={w} height={h} />,
  },
  {
    key: 'ov_film', label: 'Cinema', category: 'overlay', isFullscreen: true,
    render: () => (
      <View style={{ width: 44, height: 56, backgroundColor: '#0a0800', borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 9, backgroundColor: 'rgba(0,0,0,0.8)' }}>
          {[0,1,2,3].map(i => <View key={i} style={{ position: 'absolute', top: 6 + i * 14, left: 1, width: 7, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />)}
        </View>
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 9, backgroundColor: 'rgba(0,0,0,0.8)' }}>
          {[0,1,2,3].map(i => <View key={i} style={{ position: 'absolute', top: 6 + i * 14, right: 1, width: 7, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />)}
        </View>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,190,80,0.06)' }} />
        <Text style={{ position: 'absolute', bottom: 6, left: 12, color: 'rgba(255,255,255,0.35)', fontSize: 5 }}>24 fps</Text>
      </View>
    ),
    renderFull: (w, h) => <FilmOverlay width={w} height={h} />,
  },
  {
    key: 'ov_glitch', label: 'Glitch', category: 'overlay', isFullscreen: true,
    render: () => (
      <View style={{ width: 44, height: 56, backgroundColor: '#03020f', borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, backgroundColor: 'rgba(0,0,0,0.6)' }} />
        {[12, 24, 38].map((top, i) => (
          <View key={i} style={{ position: 'absolute', top, left: i % 2 === 0 ? 8 : 0, right: i % 2 === 0 ? 0 : 9, height: 3 + i, backgroundColor: i % 2 === 0 ? 'rgba(255,0,80,0.8)' : 'rgba(0,220,255,0.8)' }} />
        ))}
        <Text style={{ position: 'absolute', top: 3, right: 7, color: 'rgba(0,220,255,0.85)', fontSize: 6, fontWeight: '700', letterSpacing: 1 }}>GX//3K</Text>
      </View>
    ),
    renderFull: (w, h) => <GlitchOverlay width={w} height={h} />,
  },
  {
    key: 'ov_vignette', label: 'Lens', category: 'overlay', isFullscreen: true,
    render: () => (
      <View style={{ width: 44, height: 56, borderRadius: 4, overflow: 'hidden', backgroundColor: 'transparent' }}>
        <View style={{ position: 'absolute', top: 0,    left: 0, right: 0, height: 22, backgroundColor: 'rgba(0,0,0,0.58)', borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 22, backgroundColor: 'rgba(0,0,0,0.58)', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }} />
        <View style={{ position: 'absolute', top: 0, left: 0,  bottom: 0, width: 10, backgroundColor: 'rgba(0,0,0,0.38)', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }} />
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 10, backgroundColor: 'rgba(0,0,0,0.38)', borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
        <View style={{ position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,220,0.5)', shadowColor: '#FFFDE7', shadowRadius: 8, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 } }} />
      </View>
    ),
    renderFull: (w, h) => <VignetteOverlay width={w} height={h} />,
  },
  {
    key: 'ov_neon', label: 'Circuit', category: 'overlay', isFullscreen: true,
    render: () => (
      <View style={{ width: 44, height: 56, borderRadius: 4, borderWidth: 2, borderColor: '#FF4FA3', backgroundColor: 'transparent', shadowColor: '#FF4FA3', shadowRadius: 8, shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 } }}>
        {/* Corner brackets */}
        {[[0,0],[1,0],[0,1],[1,1]].map(([r,b], i) => (
          <View key={i} style={{ position: 'absolute', [r ? 'right' : 'left']: -2, [b ? 'bottom' : 'top']: -2, width: 8, height: 8 }}>
            <View style={{ position: 'absolute', [b ? 'bottom' : 'top']: 0, left: 0, right: 0, height: 2, backgroundColor: '#FF4FA3' }} />
            <View style={{ position: 'absolute', top: 0, [r ? 'right' : 'left']: 0, bottom: 0, width: 2, backgroundColor: '#FF4FA3' }} />
          </View>
        ))}
        <View style={{ position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 1, borderWidth: 0.5, borderColor: '#A05CFF' }} />
        <Text style={{ position: 'absolute', top: 5, left: 6, color: 'rgba(255,79,163,0.85)', fontSize: 5, fontWeight: '700', letterSpacing: 1 }}>● LIVE</Text>
      </View>
    ),
    renderFull: (w, h) => <NeonBorderOverlay width={w} height={h} />,
  },
  {
    key: 'ov_snow', label: 'Monsoon', category: 'overlay', isFullscreen: true,
    render: () => (
      <View style={{ width: 44, height: 56, borderRadius: 4, backgroundColor: 'rgba(10,15,30,0.5)', overflow: 'hidden' }}>
        {[4,14,24,34,10,20,30,40,7,17,27,37].map((left, i) => (
          <View key={i} style={{ position: 'absolute', left, top: (i * 5) % 40, width: 1, height: 10 + (i % 3) * 4, borderRadius: 1, backgroundColor: 'rgba(160,200,255,0.7)', transform: [{ rotate: '-15deg' }] }} />
        ))}
      </View>
    ),
    renderFull: (w, h) => <SnowSceneOverlay width={w} height={h} />,
  },
  {
    key: 'ov_inferno', label: 'Inferno', category: 'overlay', isFullscreen: true,
    render: () => (
      <View style={{ width: 44, height: 56, borderRadius: 4, backgroundColor: 'rgba(20,4,0,0.6)', overflow: 'hidden' }}>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, backgroundColor: 'rgba(255,50,0,0.3)' }} />
        {[6,14,22,30,38].map((left, i) => (
          <View key={i} style={{ position: 'absolute', bottom: 2, left, width: 5 + (i % 3) * 2, height: 5 + (i % 3) * 2, borderRadius: 4, backgroundColor: ['#FF4500','#FFD700','#FF6B00','#FF2200','#FFA500'][i], shadowColor: '#FF4500', shadowRadius: 6, shadowOpacity: 0.9, shadowOffset: { width: 0, height: 0 } }} />
        ))}
      </View>
    ),
    renderFull: (w, h) => <InfernoOverlay width={w} height={h} />,
  },
  {
    key: 'ov_holo', label: 'Hologram', category: 'overlay', isFullscreen: true,
    render: () => (
      <View style={{ width: 44, height: 56, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(0,255,200,0.6)', backgroundColor: 'rgba(0,20,15,0.4)', overflow: 'hidden' }}>
        {[0.2,0.4,0.6,0.8].map(p => <View key={p} style={{ position: 'absolute', top: p * 56, left: 0, right: 0, height: 1, backgroundColor: 'rgba(0,255,200,0.1)' }} />)}
        <View style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 56 }}>
          <LinearGradient colors={['transparent', 'rgba(0,255,200,0.15)', 'rgba(100,200,255,0.12)', 'transparent']} style={{ flex: 1 }} />
        </View>
        <Text style={{ position: 'absolute', top: 5, left: 5, color: 'rgba(0,255,200,0.8)', fontSize: 5, fontWeight: '700', letterSpacing: 1 }}>HOLO</Text>
        <Text style={{ position: 'absolute', bottom: 5, right: 5, color: 'rgba(0,255,200,0.6)', fontSize: 5 }}>78%</Text>
      </View>
    ),
    renderFull: (w, h) => <HologramOverlay width={w} height={h} />,
  },
];

// Subscribe-CTA stickers are hidden while monetization is off (App Store 3.1.1 — no subscribe prompts
// without IAP). `sc_subscribe` is the creator PNG, `sub` the branded "SUBSCRIBE 💜" pill.
const MONETIZATION_STICKER_KEYS = new Set(['sc_subscribe', 'sub']);

export const STICKERS: StickerDef[] = [
  ...stickers,
  ...branded,
  ...['💧','🔥','✨','🌟','💫','⭐️','🌈','☁️','⚡️','💥',
      '😂','🥹','😎','😭','💀','🤳','👀','🙌','💯','🫶',
      '❤️','💜','💖','🩷','🔆','🎬','📸','🎥','🎤','🎧',
      '👑','💎','🦋','🌹','🍒','🤍','🥀','🪩','🛸','🎉',
      '🫦','🧠','🫀','🪐','🌙','🌞','🐉','🦄','🍀','🌺',
      '🎶','🎵','🎸','🎹','🥁','🎺','🎻','🪗','🎠','🎪',
    ].map(emoji),
  ...animated,
  ...overlays,
].filter(st => MONETIZATION_ENABLED || !MONETIZATION_STICKER_KEYS.has(st.key));

export const stickerByKey = (k: string) => STICKERS.find(s => s.key === k);

const s = StyleSheet.create({
  pill:    { borderRadius: 999 },
  pillTxt: { paddingHorizontal: 14, paddingVertical: 7, color: '#fff', fontFamily: FONT.BODY_BOLD, fontSize: 18, fontWeight: '700' },
  emoji:   { fontSize: 52 },
});
