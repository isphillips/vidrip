import React from 'react';
import { Skia, FillType, Group, Path, Circle, RadialGradient, LinearGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import {
  off, meshPath, LIPS_OUTER, LIPS_INNER, RIGHT_EYE, LEFT_EYE, RIGHT_UPPER_LID, LEFT_UPPER_LID,
  RIGHT_BROW, LEFT_BROW, type LensProps, type Pt,
} from '../core';

// BEAUTY LENSES — realistic makeup painted onto the live 478-pt face mesh. The trick to looking like
// makeup and not stickers: every layer is multiply-blended (it TINTS the skin, so real shading and
// texture show through) and shaped to actual mesh regions — lips fill the lip ring, eyeshadow is
// extruded from the upper-lash line up toward the brow and fades into the crease, liner traces the
// real upper-lash line with a wing, blush sits on the cheekbone. Two looks share one renderer via a
// config: "Natural" is sheer/soft; "Glam" is editorial. Anchor fallbacks keep it usable when the mesh
// is absent (BlazeFace builds / replay). Pure overlay → composites live AND on replay.

// ── config ──────────────────────────────────────────────────────────────────
type LookCfg = {
  lip: { color: string; edge: string; opacity: number; gloss: number };
  blush: { color: string; opacity: number; size: number };
  shadow: { inner: string; outer: string; opacity: number; lift: number } | null;
  liner: { color: string; width: number; wing: number } | null;
  brow: { color: string; opacity: number; width: number } | null;
  highlight: number; // 0..1 cheekbone / nose / cupid's-bow sheen
};

// Tuned to read as real makeup, not paint: muted (desaturated toward skin undertones), sheer (low
// multiply opacity so it tints rather than covers), softly feathered. "Natural" is no-makeup-makeup;
// "Glam" is done-up but still believable.
const NATURAL: LookCfg = {
  lip: { color: '#B5818A', edge: '#9C6770', opacity: 0.22, gloss: 0.12 },
  blush: { color: '#D69BA0', opacity: 0.12, size: 0.38 },
  shadow: { inner: '#A88E80', outer: '#8B7468', opacity: 0.14, lift: 0.45 },
  liner: { color: 'rgba(74,54,48,0.6)', width: 0.022, wing: 0.08 },
  brow: { color: 'rgba(96,72,60,0.32)', opacity: 1, width: 0.055 },
  highlight: 0.16,
};

const GLAM: LookCfg = {
  lip: { color: '#BC5A68', edge: '#923C49', opacity: 0.42, gloss: 0.24 },
  blush: { color: '#D27E8C', opacity: 0.2, size: 0.42 },
  shadow: { inner: '#94768F', outer: '#5E4A63', opacity: 0.26, lift: 0.62 },
  liner: { color: 'rgba(26,18,24,0.82)', width: 0.036, wing: 0.2 },
  brow: { color: 'rgba(64,46,40,0.5)', opacity: 1, width: 0.08 },
  highlight: 0.32,
};

// ── mesh helpers ──────────────────────────────────────────────────────────────
function centroid(mesh: (Pt | undefined)[] | undefined, idx: number[]): Pt | null {
  if (!mesh) { return null; }
  let sx = 0, sy = 0, n = 0;
  for (const i of idx) { const p = mesh[i]; if (p) { sx += p.x; sy += p.y; n++; } }
  return n ? { x: sx / n, y: sy / n } : null;
}

const present = (mesh: (Pt | undefined)[], idx: number[]): Pt[] => idx.map(i => mesh[i]).filter(Boolean) as Pt[];

// The lip surface as a filled ring (outer minus inner, even-odd) so an open mouth isn't painted over.
function lipRing(mesh: (Pt | undefined)[] | undefined): SkPath | null {
  if (!mesh) { return null; }
  const addLoop = (p: SkPath, idx: number[]) => {
    const pts = present(mesh, idx);
    if (pts.length < 3) { return false; }
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) { p.lineTo(pts[i].x, pts[i].y); }
    p.close();
    return true;
  };
  const p = Skia.Path.Make();
  p.setFillType(FillType.EvenOdd);
  if (!addLoop(p, LIPS_OUTER)) { return null; }
  addLoop(p, LIPS_INNER);
  return p;
}

// Eyeshadow region: the upper-lash line, then back along an arched edge extruded `lift`×(eye→brow) up
// toward the crease — so colour hugs the lash line and fades into the socket.
function eyeshadowPath(mesh: (Pt | undefined)[], lidIdx: number[], up: Pt, lift: number): SkPath | null {
  const pts = present(mesh, lidIdx);
  if (pts.length < 3) { return null; }
  const p = Skia.Path.Make();
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) { p.lineTo(pts[i].x, pts[i].y); }
  for (let i = pts.length - 1; i >= 0; i--) {
    const t = i / (pts.length - 1);
    const arch = 0.45 + 0.55 * Math.sin(t * Math.PI); // taller over the middle of the lid
    p.lineTo(pts[i].x + up.x * lift * arch, pts[i].y + up.y * lift * arch);
  }
  p.close();
  return p;
}

// Upper-lash liner: the lid line, extended past the outer corner into a wing. The wing direction is
// taken from the lid's own tangent at the outer corner (pts[0]→pts[1]) so it flicks the right way
// regardless of mirror/orientation — no left/right sign to get backwards.
function linerPath(mesh: (Pt | undefined)[], lidIdx: number[], up: Pt, wing: number): SkPath | null {
  const pts = present(mesh, lidIdx); // [0] = outer corner, last = inner corner
  if (pts.length < 2) { return null; }
  const p = Skia.Path.Make();
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) { p.lineTo(pts[i].x, pts[i].y); }
  // Outward tangent at the outer corner = (pts[0] - pts[1]); flick out along it, lifted slightly up.
  const ox = pts[0].x - pts[1].x, oy = pts[0].y - pts[1].y;
  const ol = Math.hypot(ox, oy) || 1;
  const tipX = pts[0].x + (ox / ol) * wing + up.x * wing * 0.4;
  const tipY = pts[0].y + (oy / ol) * wing + up.y * wing * 0.4;
  p.moveTo(pts[0].x, pts[0].y);
  p.lineTo(tipX, tipY);
  return p;
}

function Makeup({ f, cfg }: { f: LensProps['f']; cfg: LookCfg }) {
  const fw = f.faceW;
  const mesh = f.mesh;
  const lips = lipRing(mesh);
  const eyeR = centroid(mesh, RIGHT_EYE) ?? f.re;
  const eyeL = centroid(mesh, LEFT_EYE) ?? f.le;
  const browR = centroid(mesh, RIGHT_BROW) ?? off(f, f.re, fw * 0.14, 0);
  const browL = centroid(mesh, LEFT_BROW) ?? off(f, f.le, fw * 0.14, 0);
  const liftR = Math.hypot(browR.x - eyeR.x, browR.y - eyeR.y) * (cfg.shadow?.lift ?? 0);
  const liftL = Math.hypot(browL.x - eyeL.x, browL.y - eyeL.y) * (cfg.shadow?.lift ?? 0);
  const lipC = f.mouth;
  const wingPx = fw * (cfg.liner?.wing ?? 0);

  return (
    <Group>
      {/* eyeshadow — multiply-tinted region from lash line up into the crease */}
      {cfg.shadow && mesh && [
        { idx: RIGHT_UPPER_LID, c: eyeR, lift: liftR },
        { idx: LEFT_UPPER_LID, c: eyeL, lift: liftL },
      ].map(({ idx, c, lift }, i) => {
        const path = eyeshadowPath(mesh, idx, f.up, lift);
        if (!path) { return null; }
        return (
          <Path key={`sh${i}`} path={path} opacity={cfg.shadow!.opacity} blendMode="multiply">
            <LinearGradient start={vec(c.x, c.y)} end={vec(c.x + f.up.x * lift, c.y + f.up.y * lift)}
              colors={[cfg.shadow!.inner, cfg.shadow!.outer, 'rgba(0,0,0,0)']} positions={[0, 0.6, 1]} />
            <BlurMask blur={fw * 0.03} style="normal" />
          </Path>
        );
      })}

      {/* blush — multiply dab on the apples of the cheeks */}
      {[off(f, eyeR, -fw * 0.32, fw * 0.05), off(f, eyeL, -fw * 0.32, -fw * 0.05)].map((c, i) => (
        <Circle key={`bl${i}`} cx={c.x} cy={c.y} r={fw * cfg.blush.size} opacity={cfg.blush.opacity} blendMode="multiply">
          <RadialGradient c={vec(c.x, c.y)} r={fw * cfg.blush.size} colors={[cfg.blush.color, 'rgba(255,255,255,0)']} />
          <BlurMask blur={fw * 0.24} style="normal" />
        </Circle>
      ))}

      {/* eyeliner — upper lash line + wing */}
      {cfg.liner && mesh && [RIGHT_UPPER_LID, LEFT_UPPER_LID].map((idx, i) => {
        const path = linerPath(mesh, idx, f.up, wingPx);
        if (!path) { return null; }
        return <Path key={`ln${i}`} path={path} style="stroke" strokeWidth={Math.max(1, fw * cfg.liner!.width)}
          strokeCap="round" strokeJoin="round" color={cfg.liner!.color} />;
      })}

      {/* brows — soft multiply definition along the brow */}
      {cfg.brow && mesh && (
        <Group opacity={cfg.brow.opacity} blendMode="multiply">
          <Path path={meshPath(mesh, RIGHT_BROW, false)} style="stroke" strokeWidth={Math.max(1, fw * cfg.brow.width)} strokeCap="round" strokeJoin="round" color={cfg.brow.color}>
            <BlurMask blur={fw * 0.012} style="normal" />
          </Path>
          <Path path={meshPath(mesh, LEFT_BROW, false)} style="stroke" strokeWidth={Math.max(1, fw * cfg.brow.width)} strokeCap="round" strokeJoin="round" color={cfg.brow.color}>
            <BlurMask blur={fw * 0.012} style="normal" />
          </Path>
        </Group>
      )}

      {/* lipstick — multiply tint over the lip ring (lets lip texture/shape read), darker at the edge */}
      {lips ? (
        <Path path={lips} opacity={cfg.lip.opacity} blendMode="multiply">
          <RadialGradient c={vec(lipC.x, lipC.y)} r={fw * 0.32} colors={[cfg.lip.color, cfg.lip.edge]} />
          <BlurMask blur={fw * 0.014} style="normal" />
        </Path>
      ) : (
        <Circle cx={lipC.x} cy={lipC.y} r={fw * 0.2} opacity={cfg.lip.opacity * 0.85} blendMode="multiply">
          <RadialGradient c={vec(lipC.x, lipC.y)} r={fw * 0.2} colors={[cfg.lip.color, cfg.lip.edge]} />
        </Circle>
      )}
      {/* gloss — a soft screen-blended sheen on the lower lip */}
      <Circle cx={lipC.x} cy={lipC.y + fw * 0.04} r={fw * 0.06} color="rgba(255,255,255,0.9)" opacity={cfg.lip.gloss} blendMode="screen">
        <BlurMask blur={fw * 0.035} style="solid" />
      </Circle>

      {/* highlights — sheer screen sheen on cheekbones / nose bridge / cupid's bow */}
      {cfg.highlight > 0 && (
        <Group opacity={cfg.highlight} blendMode="screen">
          {[
            off(f, f.eyeMid, -fw * 0.02, 0), // nose bridge
            off(f, eyeR, -fw * 0.18, fw * 0.18), // right cheekbone
            off(f, eyeL, -fw * 0.18, -fw * 0.18), // left cheekbone
            off(f, lipC, fw * 0.07, 0), // cupid's bow
          ].map((c, i) => (
            <Circle key={`hl${i}`} cx={c.x} cy={c.y} r={fw * (i === 0 ? 0.1 : 0.08)} color="rgba(255,250,244,0.9)">
              <BlurMask blur={fw * 0.05} style="normal" />
            </Circle>
          ))}
        </Group>
      )}
    </Group>
  );
}

export function NaturalLook({ f }: LensProps) { return <Makeup f={f} cfg={NATURAL} />; }
export function GlamLook({ f }: LensProps) { return <Makeup f={f} cfg={GLAM} />; }
