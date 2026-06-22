import { useReactQueueStore } from './reactQueueStore';

const reset = () => useReactQueueStore.setState({ queue: [] });

describe('reactQueueStore', () => {
  beforeEach(reset);

  it('setQueue replaces the queue', () => {
    useReactQueueStore.getState().setQueue([{ kind: 'thread', threadId: 't1' }]);
    expect(useReactQueueStore.getState().queue).toHaveLength(1);
  });

  it('shiftNext pops FIFO and shortens the queue', () => {
    useReactQueueStore.getState().setQueue([{ threadId: 'a' }, { threadId: 'b' }, { threadId: 'c' }]);
    const first = useReactQueueStore.getState().shiftNext();
    expect(first?.threadId).toBe('a');
    expect(useReactQueueStore.getState().queue.map(t => t.threadId)).toEqual(['b', 'c']);
  });

  it('shiftNext returns null on an empty queue', () => {
    expect(useReactQueueStore.getState().shiftNext()).toBeNull();
  });

  it('clear empties the queue', () => {
    useReactQueueStore.getState().setQueue([{ threadId: 'x' }]);
    useReactQueueStore.getState().clear();
    expect(useReactQueueStore.getState().queue).toEqual([]);
  });

  it('carries channel-kind targets through the queue (doom-react across channels)', () => {
    useReactQueueStore.getState().setQueue([{ kind: 'channel', postId: 'p1', channelId: 'c1' }]);
    expect(useReactQueueStore.getState().shiftNext()).toMatchObject({ kind: 'channel', postId: 'p1', channelId: 'c1' });
  });
});
