import { useIntroSeenStore } from './introSeenStore';

const reset = () => useIntroSeenStore.setState({ seen: new Set() });

describe('introSeenStore', () => {
  beforeEach(reset);

  it('hasSeen is false until a thread is marked', () => {
    expect(useIntroSeenStore.getState().hasSeen('t1')).toBe(false);
  });

  it('markSeen records the thread', () => {
    useIntroSeenStore.getState().markSeen('t1');
    expect(useIntroSeenStore.getState().hasSeen('t1')).toBe(true);
  });

  it('markSeen is idempotent and scoped per-thread', () => {
    const { markSeen } = useIntroSeenStore.getState();
    markSeen('t1');
    markSeen('t1');
    expect(useIntroSeenStore.getState().hasSeen('t1')).toBe(true);
    expect(useIntroSeenStore.getState().hasSeen('t2')).toBe(false);
  });
});
