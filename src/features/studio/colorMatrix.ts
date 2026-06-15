// Color matrices — the shared primitive for studio looks. A CMatrix is 20 numbers
// (4×5 RGBA + bias), the exact format Skia's <ColorMatrix> and Core Image's
// CIColorMatrix both consume, so the live preview and the native bake are identical.
// Operates on normalised [0,1] channels.
export type CMatrix = number[]; // length 20

export const IDENTITY: CMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

// Compose: returns a ∘ b (apply b to the pixel first, then a).
export function mul(a: CMatrix, b: CMatrix): CMatrix {
  const out = new Array(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) { sum += a[r * 5 + k] * b[k * 5 + c]; }
      if (c === 4) { sum += a[r * 5 + 4]; }   // b's homogeneous row contributes only the bias column
      out[r * 5 + c] = sum;
    }
  }
  return out;
}

export const compose = (...ms: CMatrix[]): CMatrix => ms.reduce((acc, m) => mul(m, acc), IDENTITY);

// --- primitives ---
const LR = 0.213, LG = 0.715, LB = 0.072;   // luma weights

export const brightness = (v: number): CMatrix =>            // v: -1..1 (additive)
  [1, 0, 0, 0, v, 0, 1, 0, 0, v, 0, 0, 1, 0, v, 0, 0, 0, 1, 0];

export const exposure = (ev: number): CMatrix => {           // ev: stops (gain = 2^ev)
  const g = Math.pow(2, ev);
  return [g, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, 1, 0];
};

export const contrast = (c: number): CMatrix => {            // c: 0..2 (1 = none)
  const t = 0.5 * (1 - c);
  return [c, 0, 0, 0, t, 0, c, 0, 0, t, 0, 0, c, 0, t, 0, 0, 0, 1, 0];
};

export const saturation = (s: number): CMatrix => {          // s: 0..2 (1 = none)
  const r = (1 - s) * LR, g = (1 - s) * LG, b = (1 - s) * LB;
  return [r + s, g, b, 0, 0, r, g + s, b, 0, 0, r, g, b + s, 0, 0, 0, 0, 0, 1, 0];
};

export const hue = (a: number): CMatrix => {                 // a: radians
  const c = Math.cos(a), s = Math.sin(a);
  return [
    LR + c * (1 - LR) + s * (-LR),      LG + c * (-LG) + s * (-LG),      LB + c * (-LB) + s * (1 - LB),     0, 0,
    LR + c * (-LR) + s * (0.143),       LG + c * (1 - LG) + s * (0.140), LB + c * (-LB) + s * (-0.283),     0, 0,
    LR + c * (-LR) + s * (-(1 - LR)),   LG + c * (-LG) + s * (LG),       LB + c * (1 - LB) + s * (LB),       0, 0,
    0, 0, 0, 1, 0,
  ];
};

// Per-channel gain (tint).
export const channelGain = (rg: number, gg: number, bg: number): CMatrix =>
  [rg, 0, 0, 0, 0, 0, gg, 0, 0, 0, 0, 0, bg, 0, 0, 0, 0, 0, 1, 0];

export type AdjustValues = { brightness?: number; contrast?: number; saturation?: number; exposure?: number; hue?: number };

// Build a single matrix from the adjust sliders (only non-neutral knobs included).
export function adjustMatrix(a: AdjustValues): CMatrix {
  const parts: CMatrix[] = [];
  if (a.exposure)   { parts.push(exposure(a.exposure)); }
  if (a.contrast != null && a.contrast !== 1)     { parts.push(contrast(a.contrast)); }
  if (a.saturation != null && a.saturation !== 1) { parts.push(saturation(a.saturation)); }
  if (a.brightness) { parts.push(brightness(a.brightness)); }
  if (a.hue)        { parts.push(hue(a.hue)); }
  return parts.length ? compose(...parts) : IDENTITY;
}

export const isIdentity = (m: CMatrix): boolean => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-4);
