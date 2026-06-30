import { supabase } from '../supabase/client';
import { DEMO_MODE } from '../../demo/demoMode';
import { demoAwardedCollections, demoAwardGifts } from '../../demo/demoData';

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

// Delivery lifecycle: 'draft' = staged, not sent; 'scheduled' = will deliver at publishAt; 'published' =
// delivered (awards back-filled to subscribers). Older rows with no status read as 'published'.
export type CollectionStatus = 'draft' | 'scheduled' | 'published';

export type ExclusiveCollection = {
  id: string;
  channelId: string;
  creatorId: string;
  name: string;
  coverUrl: string | null;
  coverVideoUrl: string | null;
  videoCount?: number;
  status: CollectionStatus;
  publishAt: string | null;
  publishedAt: string | null;
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
  status: (r.status ?? 'published') as CollectionStatus,
  publishAt: r.publish_at ?? null, publishedAt: r.published_at ?? null,
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

// ── Delivery lifecycle (draft → scheduled → published) ─────────────────────────

/** Publish/send a collection to subscribers now: the edge fn back-fills every CURRENT active subscriber of
 *  its mapped tiers (sending each a gift push) and marks it published. Returns the count delivered. */
export async function publishCollection(collectionId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('award-collection', { body: { publishCollectionId: collectionId } });
  if (error) { throw new Error(error.message); }
  if ((data as any)?.error) { throw new Error((data as any).error); }
  return (data as any)?.awarded ?? 0;
}

/** Stage a collection for future delivery — pg_cron publishes it (awards + pushes) at publishAt. */
export async function scheduleCollection(collectionId: string, publishAtISO: string): Promise<void> {
  const { error } = await (supabase as any).from('exclusive_collections')
    .update({ status: 'scheduled', publish_at: publishAtISO }).eq('id', collectionId);
  if (error) { throw error; }
}

/** Cancel a schedule and return the collection to draft (nothing is delivered until published again). */
export async function cancelSchedule(collectionId: string): Promise<void> {
  const { error } = await (supabase as any).from('exclusive_collections')
    .update({ status: 'draft', publish_at: null }).eq('id', collectionId);
  if (error) { throw error; }
}

export type ScheduledCollection = {
  id: string; name: string; channelId: string; channelName: string; coverUrl: string | null; publishAt: string;
};

/** A creator's collections staged for a future delivery (for the studio calendar). */
export async function fetchScheduledCollections(creatorId: string): Promise<ScheduledCollection[]> {
  const { data, error } = await (supabase as any).from('exclusive_collections')
    .select('id, name, channel_id, cover_url, publish_at, channel:groups(name)')
    .eq('creator_id', creatorId)
    .eq('status', 'scheduled')
    .order('publish_at', { ascending: true });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, channelId: r.channel_id, channelName: r.channel?.name ?? 'Channel',
    coverUrl: r.cover_url ?? null, publishAt: r.publish_at,
  }));
}

// ── Viewer side ──────────────────────────────────────────────────────────────

/** Collections the signed-in user has been awarded (for the feed's Exclusive Content list). */
export async function fetchMyAwardedCollections(): Promise<AwardedCollection[]> {
  if (DEMO_MODE) { return demoAwardedCollections; }
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
  if (DEMO_MODE) { return demoAwardGifts; }
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
  thumbnail: string | null;   // stored yt_video_thumbnail (resolve via ytThumb on the client)
  videoId: string | null;     // yt_video_id — drives the YouTube-img fallback + TikTok re-resolve
  sourceType: 'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook';
  posterId: string | null;    // the creator/poster — owner sees their own clips unobscured
  status: string;
  durationSec: number | null;
  reactionCount: number;
  viewCount: number;
  hasMyReaction: boolean;     // viewer has reacted → reveal the thumbnail (mirrors channel grid)
};

/** Videos in an awarded collection, with playback metadata (joined from channel_posts).
 *  Mirrors the channel grid: each video carries the viewer's reaction state so the screen can
 *  obscure unreacted videos (react-to-reveal). Pass the signed-in userId to compute that state. */
export async function fetchExclusiveCollectionVideos(collectionId: string, userId?: string): Promise<ExclusiveVideo[]> {
  const { data, error } = await (supabase as any).from('collection_videos')
    .select('post_id, post:channel_posts(id, poster_id, yt_video_title, yt_video_thumbnail, yt_video_id, source_type, media_status, duration, view_count, created_at, video_url)')
    .eq('collection_id', collectionId);
  if (error) { throw error; }

  const rows = (data ?? []).filter((r: any) => r.post);
  const postIds = rows.map((r: any) => r.post.id);

  // Reaction tallies + the viewer's own reactions — reactions are channel_posts rows whose
  // parent_post_id points back at the source post (same structure as channels).
  const reactionCount = new Map<string, number>();
  const reactedIds = new Set<string>();
  if (postIds.length) {
    const { data: rx } = await (supabase as any).from('channel_posts')
      .select('parent_post_id, poster_id')
      .in('parent_post_id', postIds);
    (rx ?? []).forEach((r: any) => {
      reactionCount.set(r.parent_post_id, (reactionCount.get(r.parent_post_id) ?? 0) + 1);
      if (userId && r.poster_id === userId) { reactedIds.add(r.parent_post_id); }
    });
  }

  // Bunny auto-generates a thumbnail.jpg beside the HLS playlist — fall back to it when a creator
  // video has no custom thumbnail, so the tile shows a poster instead of a placeholder.
  const bunnyThumb = (post: any): string | null =>
    post.source_type === 'bunny' && typeof post.video_url === 'string' && post.video_url.includes('playlist.m3u8')
      ? post.video_url.replace('playlist.m3u8', 'thumbnail.jpg')
      : null;

  return rows.map((r: any) => ({
    postId: r.post.id,
    title: r.post.yt_video_title ?? 'Untitled',
    thumbnail: r.post.yt_video_thumbnail ?? bunnyThumb(r.post),
    videoId: r.post.yt_video_id ?? null,
    sourceType: (r.post.source_type ?? 'youtube') as ExclusiveVideo['sourceType'],
    posterId: r.post.poster_id ?? null,
    status: r.post.media_status ?? 'processing',
    durationSec: r.post.duration ?? null,
    reactionCount: reactionCount.get(r.post.id) ?? 0,
    viewCount: r.post.view_count ?? 0,
    hasMyReaction: reactedIds.has(r.post.id),
  }));
}

/** The collection's display info for a recipient (cover + name + channel). */
export async function fetchAwardedCollection(collectionId: string): Promise<(ExclusiveCollection & { channelName: string }) | null> {
  const { data } = await (supabase as any).from('exclusive_collections')
    .select('*, channel:groups(name)').eq('id', collectionId).maybeSingle();
  if (!data) { return null; }
  return { ...mapCollection(data), channelName: data.channel?.name ?? 'Channel' };
}
