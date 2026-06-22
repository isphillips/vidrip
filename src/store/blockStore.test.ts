// Mock the network-backed queries so importing the store doesn't pull in the supabase client.
jest.mock('../infrastructure/supabase/queries/blocks', () => ({
  fetchBlockedIds: jest.fn(),
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
}));

import { useBlockStore } from './blockStore';

const reset = () => useBlockStore.setState({ blocked: new Set() });

describe('blockStore.isBlocked', () => {
  beforeEach(reset);

  it('is false for unknown / null / undefined ids', () => {
    expect(useBlockStore.getState().isBlocked('x')).toBe(false);
    expect(useBlockStore.getState().isBlocked(null)).toBe(false);
    expect(useBlockStore.getState().isBlocked(undefined)).toBe(false);
  });

  it('is true once the id is in the blocked set', () => {
    useBlockStore.setState({ blocked: new Set(['u1']) });
    expect(useBlockStore.getState().isBlocked('u1')).toBe(true);
    expect(useBlockStore.getState().isBlocked('u2')).toBe(false);
  });
});
