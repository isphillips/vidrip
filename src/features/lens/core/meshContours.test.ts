// Skia is a native module; stub it so importing meshContours doesn't load the binary.
// quantize/dequantize never touch Skia — only meshPath does.
jest.mock('@shopify/react-native-skia', () => ({
  Skia: { Path: { Make: () => ({ moveTo: jest.fn(), lineTo: jest.fn(), close: jest.fn() }) } },
}));

import { quantizeMesh, dequantizeMesh, MESH_VERTS, MESH_TRACK_INDICES } from './meshContours';
import type { Pt } from './types';

describe('mesh quantize/dequantize', () => {
  const indices = [0, 5, 17];
  const mesh: (Pt | undefined)[] = [];
  mesh[0] = { x: 0.123, y: 0.456 };
  mesh[5] = { x: 0.5, y: 0.5 };
  mesh[17] = { x: 0.999, y: 0.001 };

  it('quantizes to x1000 integers in [x,y,...] order', () => {
    expect(quantizeMesh(mesh, indices)).toEqual([123, 456, 500, 500, 999, 1]);
  });

  it('round-trips within quantization precision', () => {
    const back = dequantizeMesh(quantizeMesh(mesh, indices), indices);
    for (const i of indices) {
      expect(back[i]!.x).toBeCloseTo(mesh[i]!.x, 3);
      expect(back[i]!.y).toBeCloseTo(mesh[i]!.y, 3);
    }
  });

  it('rebuilds a sparse MESH_VERTS-length mesh (only indices populated)', () => {
    const back = dequantizeMesh(quantizeMesh(mesh, indices), indices);
    expect(back.length).toBe(MESH_VERTS);
    expect(back[0]).toBeDefined();
    expect(back[1]).toBeUndefined();
  });

  it('encodes a missing vertex as 0,0', () => {
    expect(quantizeMesh([], [0])).toEqual([0, 0]);
  });

  it('exposes a duplicate-free track-index set', () => {
    expect(new Set(MESH_TRACK_INDICES).size).toBe(MESH_TRACK_INDICES.length);
  });
});
