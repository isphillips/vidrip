import { supabase } from '../client';

/** Block a user app-wide (idempotent). */
export async function blockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { throw new Error('Not authenticated'); }
  const { error } = await (supabase as any)
    .from('user_blocks').insert({ blocker_id: user.id, blocked_id: blockedId });
  if (error && error.code !== '23505') { throw error; }   // ignore duplicate
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
