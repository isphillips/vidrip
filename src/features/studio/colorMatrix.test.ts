import {
  IDENTITY, mul, compose, brightness, contrast, saturation, exposure, channelGain, adjustMatrix, isIdentity,
} from './colorMatrix';

describe('colorMatrix algebra', () => {
  it('IDENTITY is the identity matrix', () => {
    expect(isIdentity(IDENTITY)).toBe(true);
  });

  it('mul with identity (either side) returns the same matrix', () => {
    const b = brightness(0.2);
    expect(mul(IDENTITY, b)).toEqual(b);
    expect(mul(b, IDENTITY)).toEqual(b);
  });

  it('compose() with no args is identity', () => {
    expect(isIdentity(compose())).toBe(true);
  });

  it('isIdentity tolerates tiny float error but not real drift', () => {
    expect(isIdentity(IDENTITY.map((v, i) => (i === 0 ? v + 5e-5 : v)))).toBe(true);
    expect(isIdentity(IDENTITY.map((v, i) => (i === 0 ? v + 1e-2 : v)))).toBe(false);
  });

  it('neutral knobs are identity', () => {
    expect(isIdentity(exposure(0))).toBe(true);
    expect(isIdentity(contrast(1))).toBe(true);
    expect(isIdentity(saturation(1))).toBe(true);
  });
});

describe('colorMatrix builders', () => {
  it('brightness applies an additive bias to each channel', () => {
    const m = brightness(0.5);
    expect(m[4]).toBeCloseTo(0.5);
    expect(m[9]).toBeCloseTo(0.5);
    expect(m[14]).toBeCloseTo(0.5);
  });

  it('exposure doubles gain per stop', () => {
    const m = exposure(1);
    expect(m[0]).toBeCloseTo(2);
    expect(m[6]).toBeCloseTo(2);
    expect(m[12]).toBeCloseTo(2);
  });

  it('channelGain sets per-channel gains', () => {
    const m = channelGain(1.1, 0.9, 1.2);
    expect(m[0]).toBeCloseTo(1.1);
    expect(m[6]).toBeCloseTo(0.9);
    expect(m[12]).toBeCloseTo(1.2);
  });
});

describe('adjustMatrix', () => {
  it('returns identity when every knob is neutral', () => {
    expect(isIdentity(adjustMatrix({ contrast: 1, saturation: 1, brightness: 0, exposure: 0, hue: 0 }))).toBe(true);
  });

  it('returns a non-identity matrix when a knob is engaged', () => {
    expect(isIdentity(adjustMatrix({ brightness: 0.3 }))).toBe(false);
  });
});
