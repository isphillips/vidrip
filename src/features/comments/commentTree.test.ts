import { flattenThread, findComment, rootCount, ROOT_KEY, DEPTH_CAP } from './commentTree';
import type { VideoComment } from '../../infrastructure/supabase/queries/videoComments';

const RS = 'vid1';
const ST = 'youtube' as VideoComment['source_type'];

// Minimal fixture — flattenThread/rootCount only read these fields.
const mk = (id: string, parent: string | null, reply_count = 0): VideoComment =>
  ({ id, parent_comment_id: parent, reply_count, root_source_id: RS, source_type: ST } as unknown as VideoComment);

describe('rootCount', () => {
  it('counts loaded roots plus matching pending', () => {
    const childrenById = { [ROOT_KEY]: [mk('r1', null), mk('r2', null)] };
    expect(rootCount(childrenById, [mk('p1', null)], RS, ST)).toBe(3);
  });

  it('excludes pending from a different video', () => {
    const childrenById = { [ROOT_KEY]: [mk('r1', null)] };
    const foreign = { ...mk('p1', null), root_source_id: 'other' } as VideoComment;
    expect(rootCount(childrenById, [foreign], RS, ST)).toBe(1);
  });

  it('does not double-count a pending that is already loaded', () => {
    const childrenById = { [ROOT_KEY]: [mk('r1', null)] };
    expect(rootCount(childrenById, [mk('r1', null)], RS, ST)).toBe(1);
  });
});

describe('findComment', () => {
  it('finds a loaded comment in any bucket', () => {
    const childrenById = { [ROOT_KEY]: [mk('r1', null)], r1: [mk('c1', 'r1')] };
    expect(findComment('c1', childrenById, [])?.id).toBe('c1');
  });

  it('falls back to pending', () => {
    expect(findComment('p1', {}, [mk('p1', null)])?.id).toBe('p1');
  });

  it('returns undefined when missing', () => {
    expect(findComment('nope', {}, [])).toBeUndefined();
  });
});

describe('flattenThread', () => {
  const args = (over: Partial<Parameters<typeof flattenThread>[0]>) => ({
    childrenById: {}, expanded: new Set<string>(), pending: [], rootSourceId: RS, sourceType: ST, ...over,
  });

  it('lists roots collapsed by default', () => {
    const childrenById = { [ROOT_KEY]: [mk('r1', null, 2)], r1: [mk('c1', 'r1'), mk('c2', 'r1')] };
    const rows = flattenThread(args({ childrenById }));
    expect(rows.map(r => r.comment.id)).toEqual(['r1']);
    expect(rows[0].hasReplies).toBe(true);
    expect(rows[0].isExpanded).toBe(false);
  });

  it('expands a root that is in the expanded set', () => {
    const childrenById = { [ROOT_KEY]: [mk('r1', null, 2)], r1: [mk('c1', 'r1'), mk('c2', 'r1')] };
    const rows = flattenThread(args({ childrenById, expanded: new Set(['r1']) }));
    expect(rows.map(r => r.comment.id)).toEqual(['r1', 'c1', 'c2']);
    expect(rows[1].depth).toBe(1);
  });

  it('auto-expands a parent that has a pending child', () => {
    const childrenById = { [ROOT_KEY]: [mk('r1', null, 1)], r1: [mk('c1', 'r1')] };
    const rows = flattenThread(args({ childrenById, pending: [mk('p1', 'r1')] }));
    expect(rows.map(r => r.comment.id)).toContain('p1');
    expect(rows.find(r => r.comment.id === 'r1')?.isExpanded).toBe(true);
  });

  it('offers a "Continue thread" row at the depth cap', () => {
    const childrenById: Record<string, VideoComment[]> = {
      [ROOT_KEY]: [mk('r0', null, 1)],
      r0: [mk('c1', 'r0', 1)], c1: [mk('c2', 'c1', 1)], c2: [mk('c3', 'c2', 1)],
      c3: [mk('c4', 'c3', 1)], c4: [mk('c5', 'c4', 1)],
    };
    const expanded = new Set(['r0', 'c1', 'c2', 'c3', 'c4']);
    const rows = flattenThread(args({ childrenById, expanded }));
    const cont = rows.find(r => r.isContinue);
    expect(cont).toBeTruthy();
    expect(cont?.depth).toBe(DEPTH_CAP);
  });
});
