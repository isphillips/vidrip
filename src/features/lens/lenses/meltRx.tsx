import React from 'react';
import { Group, Path, Circle, SweepGradient, RadialGradient, BlurMask, Vertices, Image as SkiaImage, useImage, Skia, vec, type SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, useAnimatedReaction, runOnJS, type SharedValue } from 'react-native-reanimated';
import { RIGHT_EYE, LEFT_EYE, LIPS_OUTER, MESH_VERTS, FACE_OVAL, delaunay, type ReactiveLensProps, type MeshFrame } from '../core';
import { useHullPath } from './_meshKit';

const DRIPLOGO = require('../../../assets/driplogo.png'); // Vidrip play logo — stamped on the Drippy skin

// MELT — your face becomes a living liquid surface clipped to the face mesh, with travelling speculars
// that sweep as you move and molten droplets that swell off the jawline and fall. Two skins from one
// rig (mesh-overlay → fully baked into the shared clip):
//   • Chrome — mirror-bright liquid metal (epic).
//   • Drippy — translucent brand-gradient slime + subsurface glow + mascot googly eyes (the signature
//     Vidrip mask: "I turned into Vidrip"). Pink→magenta is HeroDrippy's own body gradient.
// (True per-droplet refraction of the live scene is the follow-up; the sweep + speculars carry the
// liquid read today.)

type LiquidSkin = {
  kind: 'sweep' | 'radial';
  colors: string[];
  fillOpacity: number;           // < 1 so the real face shows through → reads as face PAINT, not a sticker
  sheenA: string; sheenB: string;
  rim: string;
  drip: string; dripHi: string;
  seam?: string | null;          // dark feature seams (chrome) — keeps the face legible through metal
  subsurface?: string | null;    // soft inner glow (slime)
  gloss?: boolean;               // big cartoon gloss highlight (slime)
  eyes?: boolean;                // mascot googly eyes (slime)
  logo?: boolean;                // Vidrip play-logo stamp on the forehead (slime)
  wire: string;                  // colour of the triangulation cell edges
};

const CHROME: LiquidSkin = {
  kind: 'sweep',
  colors: ['#0f1318', '#aab8c4', '#ffffff', '#5d6770', '#e8f1f7', '#2a2f37', '#9fb0bd', '#0f1318'],
  fillOpacity: 0.62, // translucent chrome wash → liquid-metal skin you can still see through
  sheenA: 'rgba(255,255,255,0.6)', sheenB: 'rgba(200,235,255,0.4)',
  rim: 'rgba(232,244,255,0.9)', drip: '#c2cdd6', dripHi: 'rgba(255,255,255,0.92)',
  seam: 'rgba(8,12,18,0.55)', wire: 'rgba(224,238,252,0.35)',
};

const SLIME: LiquidSkin = {
  kind: 'radial',
  colors: ['#FFD0EC', '#FF6FB8', '#e056fd', '#A05CFF'], // bright center → magenta → purple edge
  fillOpacity: 0.55, // translucent goo wash → your face reads through the paint
  sheenA: 'rgba(255,255,255,0.7)', sheenB: 'rgba(255,190,235,0.45)',
  rim: 'rgba(255,208,236,0.95)', drip: '#FF6FB8', dripHi: 'rgba(255,255,255,0.95)',
  subsurface: 'rgba(255,150,210,0.5)', gloss: true, eyes: true, logo: true, wire: 'rgba(255,255,255,0.4)',
};

const SEAMS: { idx: number[]; close: boolean }[] = [
  { idx: RIGHT_EYE, close: true }, { idx: LEFT_EYE, close: true }, { idx: LIPS_OUTER, close: true },
];
const DRIP_IDX = [136, 150, 152, 400, 379, 365]; // jawline → chin mesh vertices

// A molten bead that swells off `idx`, necks, and falls — looping on its own phase.
function Drip({ f, clock, idx, i, color, hi }: {
  f: SharedValue<MeshFrame | null>; clock: SharedValue<number>; idx: number; i: number; color: string; hi: string;
}) {
  const phase = (i * 0.37) % 1;
  const v = useDerivedValue(() => (((clock.value * (0.3 + 0.05 * (i % 3)) + phase) % 1) + 1) % 1);
  const ax = useDerivedValue(() => { const xy = f.value?.xy; return xy && !isNaN(xy[2 * idx]) ? xy[2 * idx] : -1000; });
  const ay = useDerivedValue(() => { const xy = f.value?.xy; return xy ? xy[2 * idx + 1] : -1000; });
  const fw = useDerivedValue(() => f.value?.faceW ?? 120);
  const dropY = useDerivedValue(() => ay.value + v.value * fw.value * 0.9);
  const r = useDerivedValue(() => fw.value * 0.05 * (1 - v.value * 0.35));
  const op = useDerivedValue(() => { const t = v.value; return t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92; });
  const neck = useDerivedValue(() => {
    const p = Skia.Path.Make();
    p.moveTo(ax.value, ay.value);
    p.lineTo(ax.value, dropY.value);
    return p;
  });
  const neckW = useDerivedValue(() => Math.max(0.5, fw.value * 0.05 * (1 - v.value) * 1.1));
  const hiX = useDerivedValue(() => ax.value - r.value * 0.3);
  const hiY = useDerivedValue(() => dropY.value - r.value * 0.35);
  const hiR = useDerivedValue(() => r.value * 0.34);
  return (
    <Group opacity={op}>
      <Path path={neck} style="stroke" strokeWidth={neckW} strokeCap="round" color={color} />
      <Circle cx={ax} cy={dropY} r={r} color={color}><BlurMask blur={1} style="solid" /></Circle>
      <Circle cx={hiX} cy={hiY} r={hiR} color={hi} />
    </Group>
  );
}

// One mascot googly eye pinned to an eye centre, with a shared dart + periodic blink.
function MascotEye({ center, r, dart, blink, clock }: {
  center: SharedValue<{ x: number; y: number }>; r: SharedValue<number>;
  dart: SharedValue<number>; blink: SharedValue<number>; clock: SharedValue<number>;
}) {
  const cx = useDerivedValue(() => center.value.x);
  const cy = useDerivedValue(() => center.value.y);
  const origin = useDerivedValue(() => vec(center.value.x, center.value.y));
  const tf = useDerivedValue(() => [{ scaleY: blink.value }]);
  const pupX = useDerivedValue(() => center.value.x + dart.value);
  const pupR = useDerivedValue(() => r.value * 0.5);
  const hiX = useDerivedValue(() => center.value.x - r.value * 0.28);
  const hiY = useDerivedValue(() => center.value.y - r.value * 0.28);
  const hiR = useDerivedValue(() => r.value * 0.2);
  return (
    <Group origin={origin} transform={tf}>
      <Circle cx={cx} cy={cy} r={r} color="#FFFFFF" />
      <Circle cx={pupX} cy={cy} r={pupR} color="#16091f" />
      <Circle cx={hiX} cy={hiY} r={hiR} color="rgba(255,255,255,0.95)" />
    </Group>
  );
}

// ── Faceted (low-poly) fill ────────────────────────────────────────────────────
const SUB_STEP = 3; // subsample the mesh → fewer, chunkier facets (the low-poly look) + cheaper

function hexLerp(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}
function ramp(stops: string[], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return i >= stops.length - 1 ? stops[stops.length - 1] : hexLerp(stops[i], stops[i + 1], x - i);
}

type Facets = { sub: number[]; tris: number[]; colors: string[] };

// Triangulate the face ONCE (the first dense frame) into a reusable low-poly index set, then animate
// the vertices each frame. Stays null (→ smooth gradient fallback) when the mesh is sparse (reaction
// replay), so the baked reaction still renders cleanly; Studio bakes the full mesh, so it facets there.
function useFacets(f: SharedValue<MeshFrame | null>, palette: string[]) {
  const [facets, setFacets] = React.useState<Facets | null>(null);
  const tried = React.useRef(false);

  const compute = React.useCallback((xy: number[]) => {
    const sub: number[] = [];
    const seen: Record<number, boolean> = {};
    for (let i = 0; i < MESH_VERTS; i++) { if (i % SUB_STEP === 0 && !isNaN(xy[2 * i])) { sub.push(i); seen[i] = true; } }
    for (const i of FACE_OVAL) { if (!seen[i] && !isNaN(xy[2 * i])) { sub.push(i); seen[i] = true; } } // clean silhouette
    if (sub.length < 8) { return; }
    const pts = sub.map((idx) => ({ x: xy[2 * idx], y: xy[2 * idx + 1] }));
    const tris = delaunay(pts);
    if (tris.length === 0) { return; }
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const p of pts) { if (p.y < minY) { minY = p.y; } if (p.y > maxY) { maxY = p.y; } if (p.x < minX) { minX = p.x; } if (p.x > maxX) { maxX = p.x; } }
    const hY = (maxY - minY) || 1, wX = (maxX - minX) || 1;
    const colors = pts.map((p) => ramp(palette, ((p.y - minY) / hY) * 0.85 + ((p.x - minX) / wX) * 0.15));
    setFacets({ sub, tris, colors });
  }, [palette]);

  useAnimatedReaction(
    () => { const xy = f.value?.xy; if (!xy) { return 0; } let c = 0; for (let i = 0; i < xy.length; i += 2) { if (!isNaN(xy[i])) { c++; } } return c; },
    (count) => { if (count >= 460 && !tried.current) { tried.current = true; const xy = f.value?.xy; if (xy) { runOnJS(compute)(Array.from(xy)); } } },
    [compute],
  );

  // vertices/colors/indices ALL derive from `facets` (same dep) so they're always equal-length — Skia's
  // <Vertices> throws if colors.length ≠ vertices.length, which a lagging animated array would cause.
  const verts = useDerivedValue(() => {
    const out: SkPoint[] = [];
    const xy = f.value?.xy, sub = facets?.sub;
    if (xy && sub) { for (let i = 0; i < sub.length; i++) { const idx = sub[i]; out.push(vec(xy[2 * idx], xy[2 * idx + 1])); } }
    return out;
  }, [facets]);
  const cols = useDerivedValue(() => (facets ? facets.colors : []), [facets]);
  const inds = useDerivedValue(() => (facets ? facets.tris : []), [facets]);
  const wire = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const xy = f.value?.xy, fc = facets;
    if (!xy || !fc) { return p; }
    const sub = fc.sub, tris = fc.tris;
    for (let i = 0; i < tris.length; i += 3) {
      const a = sub[tris[i]], b = sub[tris[i + 1]], c = sub[tris[i + 2]];
      const ax = xy[2 * a], bx = xy[2 * b], cx = xy[2 * c];
      if (isNaN(ax) || isNaN(bx) || isNaN(cx)) { continue; }
      p.moveTo(ax, xy[2 * a + 1]); p.lineTo(bx, xy[2 * b + 1]); p.lineTo(cx, xy[2 * c + 1]); p.close();
    }
    return p;
  });

  return { facets, verts, cols, inds, wire };
}

function LiquidFace({ f, clock, skin }: ReactiveLensProps & { skin: LiquidSkin }) {
  // Dilated convex hull (not the face-oval) → the paint covers the nose + cheeks even when you turn.
  const hull = useHullPath(f);
  // Low-poly faceting: triangulated colored cells (falls back to the smooth gradient when sparse).
  const { facets, verts, cols, inds, wire } = useFacets(f, skin.colors);
  const logo = useImage(DRIPLOGO);
  const logoAspect = logo ? logo.width() / logo.height() : 0.6; // driplogo is portrait (~194×321)

  // Fill anchors.
  const noseC = useDerivedValue(() => vec(f.value?.nose.x ?? 0, f.value?.nose.y ?? 0));
  const faceC = useDerivedValue(() => vec(f.value?.eyeMid.x ?? 0, (f.value ? f.value.eyeMid.y + f.value.faceW * 0.28 : 0)));
  const faceCx = useDerivedValue(() => f.value?.eyeMid.x ?? 0);
  const faceCy = useDerivedValue(() => (f.value ? f.value.eyeMid.y + f.value.faceW * 0.28 : 0));
  const faceR = useDerivedValue(() => (f.value?.faceW ?? 0) * 1.05);

  // Dark feature seams (eyes + lips) — chrome only.
  const seams = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const xy = f.value?.xy;
    if (!xy) { return p; }
    for (let li = 0; li < SEAMS.length; li++) {
      const loop = SEAMS[li].idx;
      let started = false;
      for (let i = 0; i < loop.length; i++) {
        const x = xy[2 * loop[i]];
        if (isNaN(x)) { continue; }
        const y = xy[2 * loop[i] + 1];
        if (!started) { p.moveTo(x, y); started = true; } else { p.lineTo(x, y); }
      }
      if (SEAMS[li].close && started) { p.close(); }
    }
    return p;
  });

  // Travelling speculars.
  const sheenX = useDerivedValue(() => {
    const ff = f.value; if (!ff) { return -1000; }
    const t = (clock.value * 0.55) % 2; const k = t < 1 ? t : 2 - t;
    return ff.eyeMid.x - ff.faceW * 0.85 + k * ff.faceW * 1.7;
  });
  const sheenY = useDerivedValue(() => (f.value ? f.value.eyeMid.y + f.value.faceW * 0.1 : -1000));
  const sheenR = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.46);
  const sheen2X = useDerivedValue(() => {
    const ff = f.value; if (!ff) { return -1000; }
    const t = (clock.value * 0.4 + 1) % 2; const k = t < 1 ? t : 2 - t;
    return ff.eyeMid.x - ff.faceW * 0.7 + k * ff.faceW * 1.4;
  });
  const sheen2Y = useDerivedValue(() => (f.value ? f.value.eyeMid.y + f.value.faceW * 0.45 : -1000));

  // Gloss blob (slime) — a fixed cartoon shine up-left of the face.
  const glossX = useDerivedValue(() => (f.value ? f.value.eyeMid.x - f.value.faceW * 0.28 : -1000));
  const glossY = useDerivedValue(() => (f.value ? f.value.eyeMid.y - f.value.faceW * 0.12 : -1000));
  const glossR = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.2);

  // Mascot eyes (slime).
  const leC = useDerivedValue(() => ({ x: f.value?.le.x ?? -1000, y: f.value?.le.y ?? -1000 }));
  const reC = useDerivedValue(() => ({ x: f.value?.re.x ?? -1000, y: f.value?.re.y ?? -1000 }));
  const eyeR = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.15);
  const dart = useDerivedValue(() => Math.sin(clock.value * 0.8) * (f.value?.faceW ?? 0) * 0.03);
  const blink = useDerivedValue<number>(() => { const p = (clock.value * 0.3) % 1; return p > 0.95 ? 0.12 : 1; });

  // Cinematic depth: a soft dark shadow hugging the INNER edge (the stroke's outer half is clipped),
  // so the face reads as a rounded volume; the cell edges shimmer with a slow light pulse.
  const edgeShadowW = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.16);
  const wireOp = useDerivedValue(() => 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(clock.value * 1.6)));

  // Play-logo stamp (slime) — glued to the forehead via the head's up axis, tilting with roll.
  const logoTf = useDerivedValue(() => {
    const ff = f.value;
    if (!ff) { return [{ translateX: -3000 }]; }
    return [
      { translateX: ff.eyeMid.x + ff.up.x * ff.faceW * 0.42 },
      { translateY: ff.eyeMid.y + ff.up.y * ff.faceW * 0.42 },
      { rotate: (ff.rollDeg * Math.PI) / 180 },
    ];
  });
  // Height-driven (the logo is portrait) so it stays a contained forehead emblem.
  const logoH = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.46);
  const logoW = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.46 * logoAspect);
  const logoX = useDerivedValue(() => -((f.value?.faceW ?? 0) * 0.46 * logoAspect) / 2);
  const logoY = useDerivedValue(() => -((f.value?.faceW ?? 0) * 0.46) / 2);

  return (
    <Group>
      <Group clip={hull}>
        {/* liquid base — triangulated low-poly cells once meshed, else a smooth gradient (sparse replay) */}
        {facets ? (
          <Group opacity={skin.fillOpacity}>
            <Vertices vertices={verts} indices={inds} colors={cols} mode="triangles" />
          </Group>
        ) : (
          <Path path={hull} opacity={skin.fillOpacity}>
            {skin.kind === 'sweep'
              ? <SweepGradient c={noseC} colors={skin.colors} />
              : <RadialGradient c={faceC} r={faceR} colors={skin.colors} />}
          </Path>
        )}
        {/* subsurface glow (slime) */}
        {skin.subsurface && (
          <Circle cx={faceCx} cy={faceCy} r={faceR} color={skin.subsurface}>
            <BlurMask blur={30} style="normal" />
          </Circle>
        )}
        {/* travelling speculars */}
        <Circle cx={sheenX} cy={sheenY} r={sheenR} color={skin.sheenA}><BlurMask blur={28} style="normal" /></Circle>
        <Circle cx={sheen2X} cy={sheen2Y} r={sheenR} color={skin.sheenB}><BlurMask blur={32} style="normal" /></Circle>
        {/* cartoon gloss (slime) */}
        {skin.gloss && (
          <Circle cx={glossX} cy={glossY} r={glossR} color="rgba(255,255,255,0.7)"><BlurMask blur={10} style="normal" /></Circle>
        )}
        {/* inner edge shadow → rounded-volume depth (outer half clipped away by the hull) */}
        <Path path={hull} style="stroke" strokeWidth={edgeShadowW} color="rgba(8,3,16,0.4)">
          <BlurMask blur={16} style="normal" />
        </Path>
        {/* triangulation cell edges — the "connect every point" read, with a slow shimmer */}
        {facets && (
          <Group opacity={wireOp}>
            <Path path={wire} style="stroke" strokeWidth={0.75} strokeJoin="round" color={skin.wire} />
          </Group>
        )}
        {/* dark feature seams (chrome) */}
        {skin.seam && (
          <Path path={seams} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round" color={skin.seam} />
        )}
      </Group>

      {/* bright rim light */}
      <Path path={hull} style="stroke" strokeWidth={3} strokeJoin="round" color={skin.rim}>
        <BlurMask blur={6} style="solid" />
      </Path>

      {/* Vidrip play-logo stamp (slime) */}
      {skin.logo && logo && (
        <Group transform={logoTf} opacity={0.92}>
          <SkiaImage image={logo} x={logoX} y={logoY} width={logoW} height={logoH} fit="contain" />
        </Group>
      )}

      {/* mascot googly eyes (slime) */}
      {skin.eyes && (
        <>
          <MascotEye center={leC} r={eyeR} dart={dart} blink={blink} clock={clock} />
          <MascotEye center={reC} r={eyeR} dart={dart} blink={blink} clock={clock} />
        </>
      )}

      {/* molten drips off the jaw */}
      {DRIP_IDX.map((idx, i) => (
        <Drip key={idx} f={f} clock={clock} idx={idx} i={i} color={skin.drip} hi={skin.dripHi} />
      ))}
    </Group>
  );
}

export function MeltRx(props: ReactiveLensProps) { return <LiquidFace {...props} skin={CHROME} />; }
export function DrippyRx(props: ReactiveLensProps) { return <LiquidFace {...props} skin={SLIME} />; }
