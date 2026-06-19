import React from 'react';
import { Group, Path, RoundedRect, Circle, LinearGradient, BlurMask, Skia, vec } from '@shopify/react-native-skia';
import { sample } from './_meshKit';
import { useDerivedValue } from 'react-native-reanimated';
import { Bubble, GlowOrb, ScreenTint, WorldVignette, GodRays, Motes, off, rnd, type LensProps } from '../core';

// Scuba — a combo lens: a realistic dive mask + snorkel ANCHORED to the face (overlay art, rotates &
// scales with the head), bubbles streaming off the MESH and the snorkel top, all inside an underwater
// world (gradient + god-rays + marine snow). Shows off overlay-art and mesh effects working together.
export function Scuba({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }

  // Local space for the gear: origin = eye midpoint, +x = along the eye axis, +y = down the face,
  // 1 unit = faceW. Translate→rotate→scale (applied innermost-first) glues it to the head through roll.
  const roll = (f.rollDeg * Math.PI) / 180;
  const tf = [{ translateX: f.eyeMid.x }, { translateY: f.eyeMid.y }, { rotate: roll }, { scale: f.faceW }];
  // How far the mouth sits below the eyes (in faceW units) — anchors the snorkel mouthpiece.
  const mouthY = Math.min(0.82, Math.max(0.46, Math.hypot(f.mouth.x - f.eyeMid.x, f.mouth.y - f.eyeMid.y) / f.faceW));

  // Two diagonal reflection streaks across the glass (local units) — the classic "see-through glass"
  // tell. A bold upper-left band + a thin parallel sliver.
  const shine = Skia.Path.Make();
  shine.moveTo(-0.46, -0.2); shine.lineTo(-0.16, -0.24); shine.lineTo(-0.3, 0.1); shine.lineTo(-0.5, 0.12); shine.close();
  const shine2 = Skia.Path.Make();
  shine2.moveTo(-0.04, -0.22); shine2.lineTo(0.06, -0.23); shine2.lineTo(-0.08, 0.12); shine2.lineTo(-0.16, 0.11); shine2.close();
  // Snorkel tube — mouthpiece → out → up past the temple (local units).
  const tube = Skia.Path.Make();
  tube.moveTo(0.16, mouthY); tube.quadTo(0.62, mouthY * 0.5, 0.74, 0.02); tube.quadTo(0.86, -0.55, 0.82, -1.05);

  // Bubble sources: mesh vertices (off the skin) + the snorkel top (pixel space).
  const meshBubbles = sample(f.meshPts, 10);
  const snorkelTop = off(f, f.eyeMid, f.faceW * 1.0, f.faceW * 0.8);
  // Slow caustic light shimmer drifting across the scene.
  const caustic = useDerivedValue(() => [{ translateX: Math.sin(clock.value * 0.3) * w * 0.06 }, { translateY: Math.cos(clock.value * 0.23) * h * 0.03 }]);

  return (
    <>
      {/* ── Underwater world ── */}
      <ScreenTint w={w} h={h} colors={['#0E5A6E', '#063547', '#03202E']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(20,140,160,0)', 'rgba(6,50,70,0.5)', 'rgba(2,20,30,0.85)']} />
      <Group transform={caustic}>
        <GlowOrb x={w * 0.35} y={h * 0.3} r={w * 0.5} colors={['rgba(150,235,255,0.12)', 'rgba(150,235,255,0)']} opacity={0.6} blur={40} />
        <GlowOrb x={w * 0.72} y={h * 0.56} r={w * 0.45} colors={['rgba(120,220,255,0.1)', 'rgba(120,220,255,0)']} opacity={0.5} blur={44} />
      </Group>
      <GodRays w={w} h={h} x={w * 0.4} y={-h * 0.1} color="rgba(180,240,255,0.35)" clock={clock} count={6} length={h * 1.1} spread={1.2} />
      <Motes w={w} h={h} count={26} color="rgba(220,255,255,0.6)" clock={clock} dir={-1} sizeMin={1} sizeMax={3} seed={4} />

      {/* ── Realistic bubbles from the mesh + snorkel ── */}
      {meshBubbles.map((p, i) => (
        <Bubble key={i} x0={p.x} y0={p.y} sway={f.faceW * 0.05} travel={-f.faceW * (1.2 + rnd(i))}
          size={f.faceW * (0.014 + 0.026 * rnd(i, 2))} dur={1.8 + rnd(i, 3) * 1.6} base={rnd(i, 4)}
          color="rgba(210,245,255,0.7)" clock={clock} />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <Bubble key={`s${i}`} x0={snorkelTop.x} y0={snorkelTop.y} sway={f.faceW * 0.06} travel={-f.faceW * 1.7}
          size={f.faceW * (0.018 + 0.03 * rnd(i, 5))} dur={1.3 + rnd(i, 6)} base={rnd(i, 7)}
          color="rgba(225,250,255,0.85)" clock={clock} />
      ))}

      {/* ── Dive mask + snorkel (anchored to the face) ── */}
      <Group transform={tf}>
        {/* head strap */}
        <RoundedRect x={-1.12} y={-0.12} width={0.56} height={0.16} r={0.05} color="#0C0F12" />
        <RoundedRect x={0.56} y={-0.12} width={0.56} height={0.16} r={0.05} color="#0C0F12" />
        {/* silicone skirt (mask body) */}
        <RoundedRect x={-0.6} y={-0.38} width={1.2} height={0.82} r={0.22}>
          <LinearGradient start={vec(0, -0.4)} end={vec(0, 0.45)} colors={['#2A3138', '#12161B', '#0A0D10']} />
        </RoundedRect>
        {/* nose pocket */}
        <RoundedRect x={-0.2} y={0.30} width={0.4} height={0.34} r={0.14} color="#0E1216" />
        {/* coloured frame */}
        <RoundedRect x={-0.56} y={-0.30} width={1.12} height={0.6} r={0.16} style="stroke" strokeWidth={0.055} color="#17C3C9" />
        {/* glass — mostly clear so the eyes read through, with just a faint aqua tint */}
        <RoundedRect x={-0.53} y={-0.27} width={1.06} height={0.55} r={0.14}>
          <LinearGradient start={vec(-0.5, -0.27)} end={vec(0.5, 0.28)} colors={['rgba(165,230,245,0.16)', 'rgba(70,160,195,0.08)', 'rgba(25,85,115,0.18)']} />
        </RoundedRect>
        {/* glass reflection streaks */}
        <Path path={shine} color="rgba(255,255,255,0.4)" />
        <Path path={shine2} color="rgba(255,255,255,0.3)" />
        {/* snorkel tube (dark casing + yellow core) */}
        <Path path={tube} style="stroke" strokeWidth={0.2} strokeCap="round" color="#0C0F12" />
        <Path path={tube} style="stroke" strokeWidth={0.13} strokeCap="round" color="#FFD23F" />
        {/* snorkel top splash guard + mouthpiece */}
        <Circle cx={0.82} cy={-1.05} r={0.12} color="#FF8A1E" />
        <Circle cx={0.82} cy={-1.05} r={0.055} color="#0C0F12" />
        <RoundedRect x={0.03} y={mouthY - 0.08} width={0.22} height={0.16} r={0.06} color="#1A1F24" />
        {/* soft caustic glow along the top rim only (kept light so the eyes stay clear) */}
        <RoundedRect x={-0.53} y={-0.27} width={1.06} height={0.12} r={0.14} color="rgba(190,248,255,0.12)"><BlurMask blur={6} style="normal" /></RoundedRect>
      </Group>
    </>
  );
}
