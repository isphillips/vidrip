import { useReactedThreadsStore } from './reactedThreadsStore';

const reset = () => useReactedThreadsStore.setState({ reacted: new Set() });
const get = () => useReactedThreadsStore.getState();

describe('reactedThreadsStore', () => {
  beforeEach(reset);

  it('marks a thread reacted (optimistic Feed clear)', () => {
    get().markReacted('t1');
    expect(get().reacted.has('t1')).toBe(true);
  });

  it('is idempotent and keeps a stable reference when nothing changes', () => {
    get().markReacted('t1');
    const before = get().reacted;
    get().markReacted('t1');
    expect(get().reacted).toBe(before); // no re-render churn for a repeat mark
  });

  it('reconcile drops ids the server now reports reacted', () => {
    get().markReacted('t1');
    get().markReacted('t2');
    get().reconcile(['t1']); // server caught up on t1 only
    expect(get().reacted.has('t1')).toBe(false);
    expect(get().reacted.has('t2')).toBe(true); // still optimistic until server confirms
  });

  it('reconcile is a no-op (stable ref) when no ids overlap', () => {
    get().markReacted('t2');
    const before = get().reacted;
    get().reconcile(['t1', 't3']);
    expect(get().reacted).toBe(before);
  });

  it('reconcile is a no-op on empty inputs', () => {
    const before = get().reacted;
    get().reconcile(['t1']);
    expect(get().reacted).toBe(before);
  });
});
