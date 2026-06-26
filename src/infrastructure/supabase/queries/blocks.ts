import { supabase } from '../client';

/**
 * Block a user app-wide (idempotent). Optional `context` is the content the block was triggered from,
 * so the moderation team gets a usable signal.
 *
 * App Store 1.2 requires that blocking ALSO notify the developer of the inappropriate content. We do
 * that by filing a row in `content_reports` (the same queue staff review) whenever a user blocks —
 * best-effort, so logging can never make the block itself fail.
 */
export async function blockUser(
  blockedId: string,
  context?: { targetType?: string; targetId?: string; reason?: string },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { throw new Error('Not authenticated'); }
  const { error } = await (supabase as any)
    .from('user_blocks').insert({ blocker_id: user.id, blocked_id: blockedId });
  if (error && error.code !== '23505') { throw error; }   // ignore duplicate

  // Notify the moderation team that this user was blocked (with any content context).
  try {
    await (supabase as any).from('content_reports').insert({
      reporter_id: user.id,
      target_type: context?.targetType ?? 'user',
      target_id: context?.targetId ?? blockedId,
      reported_user_id: blockedId,
      reason: context?.reason ?? 'blocked',
      details: 'Auto-filed when this user blocked the account — review for abuse.',
    });
  } catch { /* never let notification failure break the block */ }
}

export async function unblockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { throw new Error('Not authenticated'); }
  const { error } = await (supabase as any)
    .from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedId);
  if (error) { throw error; }
}

/** Everyone hidden from me: people I blocked UNION people who blocked me. */
export async function fetchBlockedIds(myId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${myId},blocked_id.eq.${myId}`);
  if (error) { return []; }
  const ids = new Set<string>();
  (data ?? []).forEach((r: any) => { ids.add(r.blocker_id === myId ? r.blocked_id : r.blocker_id); });
  return [...ids];
}
