import { formatSourceType } from './sourceType';

describe('formatSourceType', () => {
  it('maps known platforms to their display labels', () => {
    expect(formatSourceType('youtube')).toBe('YouTube');
    expect(formatSourceType('tiktok')).toBe('TikTok');
    expect(formatSourceType('instagram')).toBe('Instagram');
    expect(formatSourceType('bunny')).toBe('Vidrip');
  });

  it('title-cases unknown non-empty platforms', () => {
    expect(formatSourceType('facebook')).toBe('Facebook');
    expect(formatSourceType('vimeo')).toBe('Vimeo');
  });

  it('returns empty string for empty input', () => {
    expect(formatSourceType('')).toBe('');
  });
});
