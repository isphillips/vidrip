import { supabase } from '../supabase/client';

const STORAGE_BASE = 'https://ltpscwticavqutbzrrjb.supabase.co/storage/v1/object';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cHNjd3RpY2F2cXV0YnpycmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDEwMTEsImV4cCI6MjA5NTc3NzAxMX0.wHXV1IFLk7UbRWOrJWZN-sjsw8Kau0Rn6OKs29debKo';

/** Upload a collection cover (image or video) to public storage; returns its URL. The channel-clips
 * bucket requires the first path folder to be the uploader's uid. */
export async function uploadCollectionCover(localUri: string, kind: 'image' | 'video'): Promise<string> {
  const fileUri = localUri.startsWith('file://') ? localUri : `file://${localUri}`;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { throw new Error('Not authenticated'); }
  const uid = session!.user.id;
  const ext = kind === 'video' ? 'mp4' : 'jpg';
  const type = kind === 'video' ? 'video/mp4' : 'image/jpeg';
  const path = `${uid}/collection-covers/${uid}-${Date.now()}.${ext}`;
  const form = new FormData();
  (form as any).append('file', { uri: fileUri, type, name: `cover.${ext}` });
  const res = await fetch(`${STORAGE_BASE}/channel-clips/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'x-upsert': 'true' },
    body: form,
  });
  if (!res.ok) { throw new Error(`cover upload ${res.status}`); }
  return supabase.storage.from('channel-clips').getPublicUrl(path).data.publicUrl;
}

// Exclusive collections client SDK. Tables are newer than the generated DB types, so queries run
// untyped via `(supabase as any)`. Awards are immutable (no revoke) — see the migration.

export type ExclusiveCollection = {
  id: string;
  channelId: string;
  creatorId: string;
  name: string;
  coverUrl: string | null;
  coverVideoUrl: string | null;
  videoCount?: number;
};

export type AwardedCollection = ExclusiveCollection & {
  channelName: string;
  awardId: string;
  awardedAt: string;
  seenAt: string | null;
};

// One unopened gift in the inbox (collection_awards.seen_at is null).
export type AwardGift = {
  awardId: string;
  collectionId: string;
  collectionName: string;
  coverUrl: string | null;
  channelName: string;
  creatorName: string;
  awardedAt: string;
};

const mapCollection = (r: any): ExclusiveCollection => ({
  id: r.id, channelId: r.channel_id, creatorId: r.creator_id, name: r.name,
  coverUrl: r.cover_url ?? null, coverVideoUrl: r.cover_video_url ?? null,
  videoCount: Array.isArray(r.collection_videos) ? r.collection_videos.length : undefined,
});

// ── Creator side ─────────────────────────────────────────────────────────────

export async function createCollection(input: {
  channelId: string; creatorId: string; name: string; coverUrl?: string | null; coverVideoUrl?: string | null;
}): Promise<ExclusiveCollection> {
  const { data, error } = await (supabase as any).from('exclusive_collections').insert({
    channel_id: input.channelId, creator_id: input.creatorId, name: input.name,
    cover_url: input.coverUrl ?? null, cover_video_url: input.coverVideoUrl ?? null,
  }).select('*').single();
  if (error) { throw error; }
  return mapCollection(data);
}

export async function updateCollection(id: string, patch: { name?: string; coverUrl?: string | null; coverVideoUrl?: string | null }): Promise<void> {
  const row: any = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) { row.name = patch.name; }
  if (patch.coverUrl !== undefined) { row.cover_url = patch.coverUrl; }
  if (patch.coverVideoUrl !== undefined) { row.cover_video_url = patch.coverVideoUrl; }
  const { error } = await (supabase as any).from('exclusive_collections').update(row).eq('id', id);
  if (error) { throw error; }
}

/** Delete a collection. Awards cascade — only allow when none have been granted (can't revoke). */
export async function deleteCollection(id: string): Promise<void> {
  const { count } = await (supabase as any).from('collection_awards')
    .select('id', { count: 'exact', head: true }).eq('collection_id', id);
  if ((count ?? 0) > 0) { throw new Error('This collection has been awarded and can’t be deleted.'); }
  const { error } = await (supabase as any).from('exclusive_collections').delete().eq('id', id);
  if (error) { throw error; }
}

/** The creator's collections for a channel (with video counts). */
export async function fetchMyCollections(channelId: string): Promise<ExclusiveCollection[]> {
  const { data, error } = await (supabase as any).from('exclusive_collections')
    .select('*, collection_videos(post_id)')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).map(mapCollection);
}

/** All of a creator's collections across their channels (with video counts + channel name). */
export async function fetchCollectionsByCreator(creatorId: string): Promise<(ExclusiveCollection & { channelName: string })[]> {
  const { data, error } = await (supabase as any).from('exclusive_collections')
    .select('*, collection_videos(post_id), channel:groups(name)')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({ ...mapCollection(r), channelName: r.channel?.name ?? 'Channel' }));
}

/** Load one collection plus its current video ids and tier ids (for the editor). */
export async function fetchCollectionById(id: string): Promise<{ collection: ExclusiveCollection; videoIds: string[]; tierIds: string[] } | null> {
  const { data } = await (supabase as any).from('exclusive_collections')
    .select('*, collection_videos(post_id), collection_tier_grants(tier_id)')
    .eq('id', id).maybeSingle();
  if (!data) { return null; }
  return {
    collection: mapCollection(data),
    videoIds: (data.collection_videos ?? []).map((r: any) => r.post_id),
    tierIds: (data.collection_tier_grants ?? []).map((r: any) => r.tier_id),
  };
}

/** Add a video to a collection and mark it exclusive (removes it from the regular feed). */
export async function addVideoToCollection(collectionId: string, postId: string): Promise<void> {
  const { error } = await (supabase as any).from('collection_videos')
    .upsert({ collection_id: collectionId, post_id: postId }, { onConflict: 'collection_id,post_id', ignoreDuplicates: true });
  if (error) { throw error; }
  await (supabase as any).from('channel_posts').update({ is_exclusive: true }).eq('id', postId);
}

export async function removeVideoFromCollection(collectionId: string, postId: string): Promise<void> {
  const { error } = await (supabase as any).from('collection_videos')
    .delete().eq('collection_id', collectionId).eq('post_id', postId);
  if (error) { throw error; }
  // is_exclusive is sticky by default (decision #5) — the creator toggles it back via setPostExclusive.
}

/** Toggle a post's exclusive flag directly (the configurable part of "sticky"). */
export async function setPostExclusive(postId: string, exclusive: boolean): Promise<void> {
  const { error } = await (supabase as any).from('channel_posts').update({ is_exclusive: exclusive }).eq('id', postId);
  if (error) { throw error; }
}

/** Replace the set of tiers that grant a collection. */
export async function setCollectionTiers(collectionId: string, tierIds: string[]): Promise<void> {
  await (supabase as any).from('collection_tier_grants').delete().eq('collection_id', collectionId);
  if (tierIds.length) {
    const { error } = await (supabase as any).from('collection_tier_grants')
      .insert(tierIds.map(t => ({ collection_id: collectionId, tier_id: t })));
    if (error) { throw error; }
  }
}

export async function fetchCollectionTiers(collectionId: string): Promise<string[]> {
  const { data } = await (supabase as any).from('collection_tier_grants').select('tier_id').eq('collection_id', collectionId);
  return (data ?? []).map((r: any) => r.tier_id);
}

export type ChannelTier = { id: string; title: string; priceCents: number };
export async function fetchChannelTiers(channelId: string): Promise<ChannelTier[]> {
  const { data } = await (supabase as any).from('channel_subscription_tiers')
    .select('id, title, price_cents').eq('channel_id', channelId).eq('active', true).order('idx');
  return (data ?? []).map((r: any) => ({ id: r.id, title: r.title, priceCents: r.price_cents }));
}

/** Award collections to specific users immediately (individual grant). Idempotent server-side. */
export async function awardCollectionsToUsers(collectionIds: string[], userIds: string[]): Promise<number> {
  const { data, error } = await supabase.functions.invoke('award-collection', { body: { collectionIds, userIds } });
  if (error) { throw new Error(error.message); }
  if ((data as any)?.error) { throw new Error((data as any).error); }
  return (data as any)?.awarded ?? 0;
}

// ── Viewer side ──────────────────────────────────────────────────────────────

/** Collections the signed-in user has been awarded (for the feed's Exclusive Content list). */
export async function fetchMyAwardedCollections(): Promise<AwardedCollection[]> {
  const { data, error } = await (supabase as any).from('collection_awards')
    .select('id, awarded_at, seen_at, collection:exclusive_collections(*, channel:groups(name))')
    .order('awarded_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).filter((r: any) => r.collection).map((r: any) => ({
    ...mapCollection(r.collection),
    channelName: r.collection.channel?.name ?? 'Channel',
    awardId: r.id, awardedAt: r.awarded_at, seenAt: r.seen_at,
  }));
}

/** Unopened gifts → inbox messages (merged into the feed inbox). */
export async function fetchUnopenedAwards(): Promise<AwardGift[]> {
  const { data, error } = await (supabase as any).from('collection_awards')
    .select('id, awarded_at, collection:exclusive_collections(id, name, cover_url, channel:groups(name), creator:users!creator_id(display_name, handle))')
    .is('seen_at', null)
    .order('awarded_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).filter((r: any) => r.collection).map((r: any) => ({
    awardId: r.id,
    collectionId: r.collection.id,
    collectionName: r.collection.name,
    coverUrl: r.collection.cover_url ?? null,
    channelName: r.collection.channel?.name ?? 'a channel',
    creatorName: r.collection.creator?.display_name || (r.collection.creator?.handle ? `@${r.collection.creator.handle}` : 'A creator'),
    awardedAt: r.awarded_at,
  }));
}

export async function markAwardSeen(awardId: string): Promise<void> {
  await (supabase as any).rpc('mark_award_seen', { award: awardId });
}

/** Load one award's gift details (for the reveal screen, reached from a push or the inbox). */
export async function fetchAward(awardId: string): Promise<AwardGift | null> {
  const { data } = await (supabase as any).from('collection_awards')
    .select('id, awarded_at, collection:exclusive_collections(id, name, cover_url, channel:groups(name), creator:users!creator_id(display_name, handle))')
    .eq('id', awardId).maybeSingle();
  if (!data?.collection) { return null; }
  return {
    awardId: data.id,
    collectionId: data.collection.id,
    collectionName: data.collection.name,
    coverUrl: data.collection.cover_url ?? null,
    channelName: data.collection.channel?.name ?? 'a channel',
    creatorName: data.collection.creator?.display_name || (data.collection.creator?.handle ? `@${data.collection.creator.handle}` : 'A creator'),
    awardedAt: data.awarded_at,
  };
}

/** Videos inside an awarded collection (RLS returns rows only if the caller holds the award). */
export async function fetchCollectionVideos(collectionId: string): Promise<{ postId: string }[]> {
  const { data, error } = await (supabase as any).from('collection_videos')
    .select('post_id').eq('collection_id', collectionId);
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({ postId: r.post_id }));
}

export type ExclusiveVideo = {
  postId: string;
  title: string;
  thumbnail: string | null;
  status: string;
  durationSec: number | null;
};

/** Videos in an awarded collection, with playback metadata (joined from channel_posts). */
export async function fetchExclusiveCollectionVideos(collectionId: string): Promise<ExclusiveVideo[]> {
  const { data, error } = await (supabase as any).from('collection_videos')
    .select('post_id, post:channel_posts(id, yt_video_title, yt_video_thumbnail, media_status, duration, created_at)')
    .eq('collection_id', collectionId);
  if (error) { throw error; }
  return (data ?? [])
    .filter((r: any) => r.post)
    .map((r: any) => ({
      postId: r.post.id,
      title: r.post.yt_video_title ?? 'Untitled',
      thumbnail: r.post.yt_video_thumbnail ?? null,
      status: r.post.media_status ?? 'processing',
      durationSec: r.post.duration ?? null,
    }));
}

/** The collection's display info for a recipient (cover + name + channel). */
export async function fetchAwardedCollection(collectionId: string): Promise<(ExclusiveCollection & { channelName: string }) | null> {
  const { data } = await (supabase as any).from('exclusive_collections')
    .select('*, channel:groups(name)').eq('id', collectionId).maybeSingle();
  if (!data) { return null; }
  return { ...mapCollection(data), channelName: data.channel?.name ?? 'Channel' };
}
