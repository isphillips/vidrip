import { recipeDurationMs, assertRecipeValid, MAX_STUDIO_MS, type StudioRecipe } from './recipe';

const clip = (uri: string, trimStartMs?: number, trimEndMs?: number) => ({ uri, trimStartMs, trimEndMs });

describe('recipeDurationMs', () => {
  it('uses the source duration when a clip has no trim window', () => {
    const r: StudioRecipe = { clips: [clip('a')] };
    expect(recipeDurationMs(r, 5000)).toBe(5000);
  });

  it('honors a trim window', () => {
    const r: StudioRecipe = { clips: [clip('a', 1000, 3000)] };
    expect(recipeDurationMs(r, 10000)).toBe(2000);
  });

  it('sums across clips', () => {
    const r: StudioRecipe = { clips: [clip('a', 0, 1000), clip('b', 500, 2000)] };
    expect(recipeDurationMs(r)).toBe(2500);
  });

  it('clamps an inverted/degenerate window to 0 (never negative)', () => {
    const r: StudioRecipe = { clips: [clip('a', 3000, 1000)] };
    expect(recipeDurationMs(r, 10000)).toBe(0);
  });
});

describe('assertRecipeValid', () => {
  it('passes a valid, in-limit recipe', () => {
    expect(() => assertRecipeValid({ clips: [clip('a', 0, 1000)] })).not.toThrow();
  });

  it('throws when there are no clips', () => {
    expect(() => assertRecipeValid({ clips: [] })).toThrow(/no clips/i);
  });

  it('throws when a clip is missing its uri', () => {
    expect(() => assertRecipeValid({ clips: [clip('', 0, 1000)] })).toThrow(/uri/i);
  });

  it('throws on an empty trim window', () => {
    expect(() => assertRecipeValid({ clips: [clip('a', 2000, 2000)] })).toThrow(/empty trim/i);
  });

  it('throws when total length exceeds MAX_STUDIO_MS', () => {
    expect(() => assertRecipeValid({ clips: [clip('a', 0, MAX_STUDIO_MS + 1000)] })).toThrow(/limit/i);
  });
});
