import { supabase } from '../client';

export type Friend = {
  friendshipId: string;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

export type PendingRequest = {
  friendshipId: string;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
};

export async function fetchFriends(userId: string): Promise<Friend[]> {
  const [asA, asB] = await Promise.all([
    supabase.from('friendships').select('id, user_b').eq('user_a', userId).eq('status', 'accepted'),
    supabase.from('friendships').select('id, user_a').eq('user_b', userId).eq('status', 'accepted'),
  ]);

  const pairs = [
    ...(asA.data ?? []).map((f) => ({ friendshipId: f.id, otherId: f.user_b })),
    ...(asB.data ?? []).map((f) => ({ friendshipId: f.id, otherId: f.user_a })),
  ];

  if (pairs.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, handle, display_name, avatar_url')
    .in('id', pairs.map((p) => p.otherId));

  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

  return pairs.map(({ friendshipId, otherId }) => {
    const u: any = userMap.get(otherId);
    return { friendshipId, userId: otherId, handle: u?.handle ?? '?', displayName: u?.display_name ?? '?', avatarUrl: u?.avatar_url ?? null };
  });
}

export async function fetchPendingRequests(userId: string): Promise<PendingRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, user_a')
    .eq('user_b', userId)
    .eq('status', 'pending');

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, handle, display_name, avatar_url')
    .in('id', data.map((f) => f.user_a));

  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

  return data.map((f) => {
    const u: any = userMap.get(f.user_a);
    return { friendshipId: f.id, userId: f.user_a, handle: u?.handle ?? '?', displayName: u?.display_name ?? '?', avatarUrl: u?.avatar_url ?? null };
  });
}

export async function sendFriendRequest(fromUserId: string, toHandle: string): Promise<void> {
  const { data: target, error: findError } = await supabase
    .from('users')
    .select('id')
    .eq('handle', toHandle.toLowerCase().trim())
    .single();

  if (findError || !target) throw new Error('No user found with that handle');
  if (target.id === fromUserId) throw new Error('You cannot add yourself');

  const { error } = await supabase
    .from('friendships')
    .insert({ user_a: fromUserId, user_b: target.id, status: 'pending' });

  if (error) {
    if (error.code === '23505') throw new Error('Friend request already sent');
    throw error;
  }
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  if (error) throw error;
}

export async function declineFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

export async function fetchMyInviteCodes(userId: string) {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('code, used_by, used_at')
    .eq('created_by', userId)
    .order('used_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}
