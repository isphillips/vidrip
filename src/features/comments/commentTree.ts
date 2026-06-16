import type { VideoComment } from '../../infrastructure/supabase/queries/videoComments';

// Key under which root-level comments (parent_comment_id === null) are stored in the
// `childrenById` map. Real comment ids are uuids, so this sentinel can't collide.
export const ROOT_KEY = '__root__';

// How many levels indent before we stop nesting visually and offer "Continue thread →".
// Keeps deep threads readable on a narrow phone instead of squeezing to nothing.
export const DEPTH_CAP = 4;

export type ThreadRow = {
  comment: VideoComment;
  depth: number;
  /** Has (or claims, via reply_count) child replies. */
  hasReplies: boolean;
  /** Children are currently shown beneath this row. */
  isExpanded: boolean;
  /** This is a "Continue thread →" affordance rather than a real comment. */
  isContinue: boolean;
};

type FlattenArgs = {
  childrenById: Record<string, VideoComment[]>;
  expanded: Set<string>;
  pending: VideoComment[];
  rootSourceId: string;
  sourceType: VideoComment['source_type'];
  focusRootId?: string | null;
  depthCap?: number;
};

/** Optimistic, not-yet-uploaded comments belonging to a given parent (null = roots). */
function pendingFor(
  pending: VideoComment[],
  parentId: string | null,
  rootSourceId: string,
  sourceType: VideoComment['source_type'],
  loaded: VideoComment[],
): VideoComment[] {
  return pending.filter(p =>
    p.root_source_id === rootSourceId &&
    p.source_type === sourceType &&
    (p.parent_comment_id ?? null) === parentId &&
    !loaded.some(l => l.id === p.id),
  );
}

/** Find a loaded (or pending) comment by id — used to re-root the "Continue thread" view. */
export function findComment(
  id: string,
  childrenById: Record<string, VideoComment[]>,
  pending: VideoComment[],
): VideoComment | undefined {
  for (const key of Object.keys(childrenById)) {
    const found = childrenById[key].find(c => c.id === id);
    if (found) { return found; }
  }
  return pending.find(p => p.id === id);
}

/**
 * Flattens the lazily-loaded comment tree into an ordered list of rows (with depth) for a
 * single FlatList. Arbitrary nesting is just data: a node renders its children inline when
 * expanded; at the depth cap a "Continue thread →" row re-roots the view instead. Pending
 * (optimistic) comments are merged into their parent bucket, and a parent that has a pending
 * child auto-expands so the just-posted reply shows immediately.
 */
export function flattenThread(args: FlattenArgs): ThreadRow[] {
  const { childrenById, expanded, pending, rootSourceId, sourceType, focusRootId = null, depthCap = DEPTH_CAP } = args;
  const rows: ThreadRow[] = [];

  const childrenOf = (parentId: string | null): VideoComment[] => {
    const loaded = childrenById[parentId ?? ROOT_KEY] ?? [];
    const pend = pendingFor(pending, parentId, rootSourceId, sourceType, loaded);
    return pend.length ? [...pend, ...loaded] : loaded;
  };

  const hasPendingChild = (id: string) =>
    pending.some(p => (p.parent_comment_id ?? null) === id);

  const walk = (comment: VideoComment, depth: number) => {
    const kids = childrenOf(comment.id);
    const hasReplies = comment.reply_count > 0 || kids.length > 0;
    const canExpand = depth < depthCap;
    const isExpanded = canExpand && kids.length > 0 && (expanded.has(comment.id) || hasPendingChild(comment.id));

    rows.push({ comment, depth, hasReplies, isExpanded, isContinue: false });

    if (isExpanded) {
      kids.forEach(k => walk(k, depth + 1));
    } else if (!canExpand && hasReplies) {
      // Reached the indent cap with more thread below — offer to dive in.
      rows.push({ comment, depth, hasReplies: false, isExpanded: false, isContinue: true });
    }
  };

  if (focusRootId) {
    const focused = findComment(focusRootId, childrenById, pending);
    if (focused) { walk(focused, 0); return rows; }
    // Focused node not loaded yet — fall through to roots so the list isn't blank.
  }

  childrenOf(null).forEach(root => walk(root, 0));
  return rows;
}

/** Root-level comment count (loaded + optimistic) for the header label. */
export function rootCount(
  childrenById: Record<string, VideoComment[]>,
  pending: VideoComment[],
  rootSourceId: string,
  sourceType: VideoComment['source_type'],
): number {
  const loaded = childrenById[ROOT_KEY] ?? [];
  const pend = pendingFor(pending, null, rootSourceId, sourceType, loaded);
  return loaded.length + pend.length;
}
