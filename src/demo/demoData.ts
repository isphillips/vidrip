// TEMPORARY demo content for screenshots/previews. See ./demoMode. All gated by DEMO_MODE.
//
// Thumbnails use LoremFlickr (topical placeholder photos by keyword — so a basketball clip looks
// like basketball, a cooking video like food) and avatars use pravatar.cc (placeholder faces).
// Both load over the sim's network and are safe to show in marketing (no real creators'
// content/likeness). `?lock=N` pins a stable image per item so it doesn't change on reload.
// Tapping items won't play (fake ids) — these are for capturing populated screens, not interaction.
import type { ShortRow } from '../infrastructure/supabase/queries/shorts';
import type { MembersOnlyVideo, ChannelUpdateSummary, ChannelSummary, ChannelPost } from '../infrastructure/supabase/queries/channels';
import type { Friend, PendingRequest } from '../infrastructure/supabase/queries/friends';
import type { FeedThread } from '../infrastructure/supabase/queries/threads';
import type { AwardedCollection, AwardGift } from '../infrastructure/exclusive/api';

// Topical portrait thumbnail. keyword = a single word/tag; lock = stable image id.
const thumb = (keyword: string, lock: number) => `https://loremflickr.com/400/640/${keyword}?lock=${lock}`;
const avatar = (n: number) => `https://i.pravatar.cc/200?img=${n}`;
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

// ── Browse / Share grid: YouTube-style shorts ──────────────────────────────────
// [title, channel, category, duration, keyword]
const SHORT_DEFS: [string, string, ShortRow['category'], number, string][] = [
  ['when the beat finally drops 😮‍💨', 'beatlab',   'trending', 38, 'concert'],
  ['he did NOT see that coming 💀',     'sidequest', 'trending', 52, 'surprise'],
  ['last-second buzzer beater 🏀',      'courtside', 'trending', 26, 'basketball'],
  ['60-second pasta that broke me',     'quickbite', 'trending', 59, 'pasta'],
  ['this cat runs the household',       'pawsome',   'trending', 21, 'cat'],
  ['speedrun world record (again)',     'noscope',   'trending', 44, 'videogame'],
  ['detailing a $200k supercar',        'fullsend',  'trending', 57, 'supercar'],
  ['unreleased snippet 🔥',             'latenight', 'trending', 30, 'recordingstudio'],
  ['POV: monday morning',               'relatable', 'trending', 18, 'coffee'],
  ['tiny puppy, big attitude',          'pawsome',   'trending', 23, 'puppy'],
  ['clutch 1v5 ace 🎯',                 'noscope',   'trending', 47, 'esports'],
  ['sunset timelapse, no edits',        'wander',    'trending', 34, 'sunset'],
  ['the recipe that went viral',        'quickbite', 'trending', 41, 'cooking'],
  ['street basketball is unreal',       'courtside', 'sports',   29, 'streetball'],
  ['lofi to study/chill to',            'beatlab',   'music',    55, 'turntable'],
  ['cat vs cucumber (rematch)',         'pawsome',   'pets',     16, 'cat'],
  ['drift compilation 🚗💨',            'fullsend',  'cars',     49, 'drift'],
  ['stand-up bit had me crying',        'relatable', 'funny',    37, 'comedy'],
  ['boss fight, no hits taken',         'noscope',   'gaming',   58, 'gaming'],
  ['marathon finish line tears',        'courtside', 'sports',   33, 'marathon'],
  ['golden retriever zoomies',          'pawsome',   'pets',     19, 'dog'],
  ['new synth patch sounds insane',     'latenight', 'music',    28, 'synthesizer'],
  ['the news in 60 seconds',            'briefly',   'news',     46, 'newsroom'],
  ['off-road build reveal',             'fullsend',  'cars',     53, 'offroad'],
  ['plot twist nobody expected',        'sidequest', 'trending', 24, 'cinema'],
  ['halftime trick shot 🎯',            'courtside', 'sports',   31, 'basketball'],
  ['kitten meets mirror',               'pawsome',   'pets',     17, 'kitten'],
  ['drop your hottest take 👇',         'relatable', 'funny',    40, 'microphone'],
];
export const demoShorts: ShortRow[] = SHORT_DEFS.map(([title, ch, category, duration, kw], i) => ({
  videoId: `demo-sh-${String(i + 1).padStart(2, '0')}`,
  title, thumbnail: thumb(kw, i + 1), channelTitle: ch, duration, category, fetchedAt: ago(6 + i * 9),
}));

// ── Browse grid: creators' imported videos (interleaved with shorts) ────────────
// [title, handle, sourceType, keyword]
const MV_DEFS: [string, string, MembersOnlyVideo['sourceType'], string][] = [
  ['my new track is OUT 🎧',     '@maya',  'vidrip', 'recordingstudio'],
  ['studio vlog day 3',          '@theo',  'youtube',   'vlogger'],
  ['tried the viral recipe 👀',  '@rin',   'tiktok',    'cooking'],
  ['behind the scenes 🎬',       '@theo',  'youtube',   'filmset'],
  ['gym fit check 💪',           '@jules', 'instagram', 'gym'],
  ['Q&A — you asked, I answer',  '@maya',  'youtube',   'microphone'],
  ['day in my life vlog',        '@nova',  'tiktok',    'citylife'],
  ['cooking for 100 people',     '@rin',   'youtube',   'kitchen'],
  ['leg day went crazy',         '@jules', 'instagram', 'fitness'],
  ['acoustic version 🎸',        '@maya',  'instagram', 'guitar'],
];
export const demoMemberVideos: MembersOnlyVideo[] = MV_DEFS.map(([title, ch, sourceType, kw], i) => ({
  videoId: `demo-mv-${String(i + 1).padStart(2, '0')}`,
  title, thumbnail: thumb(kw, 100 + i), channelTitle: ch, sourceType, videoUrl: null, createdAt: ago(4 + i * 22),
}));

// ── Friends list (A–Z, one per letter for a full index) + pending requests ──────
const FRIEND_DEFS: [string, string, number][] = [
  ['ava', 'Ava Chen', 1], ['ben', 'Ben Adams', 3], ['cara', 'Cara Diaz', 5], ['dom', 'Dom Lee', 7],
  ['eli', 'Eli Tan', 9], ['finn', "Finn O'Hara", 11], ['gabi', 'Gabi Rossi', 13], ['hana', 'Hana Kim', 15],
  ['ian', 'Ian Walsh', 17], ['jules', 'Jules Park', 19], ['kofi', 'Kofi Mensah', 21], ['lena', 'Lena Sokolov', 23],
  ['maya', 'Maya Rivera', 25], ['nia', 'Nia Brooks', 27], ['omar', 'Omar Haddad', 31], ['priya', 'Priya Nair', 33],
  ['quinn', 'Quinn Foster', 35], ['rosa', 'Rosa Mendez', 37], ['sam', 'Sam Okafor', 39], ['theo', 'Theo Park', 41],
  ['uma', 'Uma Shah', 43], ['vik', 'Vik Patel', 45], ['wes', 'Wes Carter', 47], ['xena', 'Xena Lin', 51],
  ['yara', 'Yara Haddad', 60], ['zoe', 'Zoe Lindqvist', 65],
];
export const demoFriends: Friend[] = FRIEND_DEFS.map(([handle, displayName, av], i) => ({
  friendshipId: `demo-f-${String(i + 1).padStart(2, '0')}`,
  userId: `demo-u-${String(i + 1).padStart(2, '0')}`,
  handle, displayName, avatarUrl: avatar(av),
}));
// userId lookup by handle so threads/posts can reference the same people.
const uid = (handle: string) => demoFriends.find(f => f.handle === handle)?.userId ?? 'demo-u-00';

export const demoPending: PendingRequest[] = [
  { friendshipId: 'demo-p-01', userId: 'demo-u-41', handle: 'andre',  displayName: 'André Costa',  avatarUrl: avatar(60) },
  { friendshipId: 'demo-p-02', userId: 'demo-u-42', handle: 'mina',   displayName: 'Mina Sato',    avatarUrl: avatar(48) },
  { friendshipId: 'demo-p-03', userId: 'demo-u-43', handle: 'devon',  displayName: 'Devon Clarke', avatarUrl: avatar(52) },
];

// ── Feed: the Channels block marquee ("N new in …") ────────────────────────────
export const demoChannelUpdates: ChannelUpdateSummary[] = [
  { channel_id: 'demo-c-01', name: 'Maya',  unseen_count: 3, last_unseen_at: ago(15),  is_members_only: true,  kind: 'channel' },
  { channel_id: 'demo-c-02', name: 'Theo',  unseen_count: 1, last_unseen_at: ago(95),  is_members_only: true,  kind: 'channel' },
  { channel_id: 'demo-c-05', name: 'Rin',   unseen_count: 2, last_unseen_at: ago(120), is_members_only: true,  kind: 'channel' },
  { channel_id: 'demo-c-03', name: 'Movie Night', unseen_count: 5, last_unseen_at: ago(140), is_members_only: false, kind: 'group' },
];

// ── Channels tab: channel cards ────────────────────────────────────────────────
const channelCard = (o: Partial<ChannelSummary> & Pick<ChannelSummary, 'id' | 'name' | 'created_by' | 'owner'>): ChannelSummary => ({
  description: null, is_public: true,
  pinned_video_id: null, pinned_video_title: null, pinned_video_thumbnail: null,
  member_count: 0, post_count: 0, live_count: 0, is_joined: false, unread_count: 0, last_message_at: null,
  ...o,
});

export const demoCreatorChannels: ChannelSummary[] = [
  channelCard({ id: 'demo-c-01', name: 'Maya', created_by: uid('maya'), owner: { handle: 'maya', avatar_url: avatar(25) },
    description: 'New music + studio vlogs 🎧', avatar_url: avatar(25), is_members_only: true, is_listed: true, is_joined: true,
    member_count: 1284, post_count: 24, unread_count: 3, last_message_at: ago(15),
    pinned_video_id: 'demo-mv-01', pinned_video_title: 'my new track is OUT 🎧', pinned_video_thumbnail: thumb('recordingstudio', 100) }),
  channelCard({ id: 'demo-c-02', name: 'Theo', created_by: uid('theo'), owner: { handle: 'theo', avatar_url: avatar(41) },
    description: 'Daily vlogs + BTS 🎬', avatar_url: avatar(41), is_members_only: true, is_listed: true, is_joined: true,
    member_count: 902, post_count: 31, unread_count: 1, last_message_at: ago(95),
    pinned_video_id: 'demo-mv-02', pinned_video_title: 'studio vlog day 3', pinned_video_thumbnail: thumb('vlogger', 101) }),
  channelCard({ id: 'demo-c-04', name: 'Jules', created_by: uid('jules'), owner: { handle: 'jules', avatar_url: avatar(19) },
    description: 'Fitness + fits 💪', avatar_url: avatar(19), is_members_only: true, is_listed: true, is_joined: true,
    member_count: 611, post_count: 12, last_message_at: ago(320) }),
  channelCard({ id: 'demo-c-05', name: 'Rin', created_by: 'demo-u-51', owner: { handle: 'rin', avatar_url: avatar(36) },
    description: 'Recipes you can actually make 🍜', avatar_url: avatar(36), is_members_only: true, is_listed: true,
    member_count: 2240, post_count: 40, unread_count: 2, last_message_at: ago(120),
    pinned_video_id: 'demo-mv-03', pinned_video_title: 'tried the viral recipe 👀', pinned_video_thumbnail: thumb('cooking', 102) }),
  channelCard({ id: 'demo-c-06', name: 'Nova', created_by: 'demo-u-52', owner: { handle: 'nova', avatar_url: avatar(58) },
    description: 'Late-night lo-fi sets 🌙', avatar_url: avatar(58), is_members_only: true, is_listed: true,
    member_count: 768, post_count: 17, last_message_at: ago(410) }),
  channelCard({ id: 'demo-c-07', name: 'Court Side', created_by: 'demo-u-53', owner: { handle: 'courtside', avatar_url: avatar(12) },
    description: 'Highlights + trick shots 🏀', avatar_url: avatar(12), is_members_only: true, is_listed: true,
    member_count: 3120, post_count: 52, unread_count: 4, last_message_at: ago(80) }),
];

export const demoPublicChannels: ChannelSummary[] = [
  channelCard({ id: 'demo-c-03', name: 'Movie Night', created_by: uid('cara'), owner: { handle: 'cara', avatar_url: avatar(5) },
    description: 'React to trailers together 🍿', is_members_only: false, is_listed: true,
    member_count: 540, post_count: 18, unread_count: 5, last_message_at: ago(140) }),
  channelCard({ id: 'demo-c-08', name: 'Gaming Lounge', created_by: uid('eli'), owner: { handle: 'eli', avatar_url: avatar(9) },
    description: 'Clips, clutches & rage 🎮', is_members_only: false, is_listed: true,
    member_count: 1890, post_count: 64, unread_count: 2, last_message_at: ago(55) }),
  channelCard({ id: 'demo-c-09', name: 'Foodies', created_by: uid('hana'), owner: { handle: 'hana', avatar_url: avatar(15) },
    description: 'Recipes & taste tests 🍝', is_members_only: false, is_listed: true,
    member_count: 980, post_count: 33, last_message_at: ago(260) }),
];

// ── Feed: private GROUP chats (buildGroupConversations filters is_group_chat) ───
export const demoGroupChats: ChannelSummary[] = [
  channelCard({ id: 'demo-g-01', name: 'The Group Chat 💬', created_by: uid('ava'), owner: { handle: 'ava', avatar_url: avatar(1) },
    is_public: false, is_group_chat: true, member_count: 6, unread_count: 4, last_message_at: ago(11) }),
  channelCard({ id: 'demo-g-02', name: 'Roommates', created_by: uid('ben'), owner: { handle: 'ben', avatar_url: avatar(3) },
    is_public: false, is_group_chat: true, member_count: 3, unread_count: 0, last_message_at: ago(70) }),
  channelCard({ id: 'demo-g-03', name: 'Festival Crew 🎪', created_by: uid('zoe'), owner: { handle: 'zoe', avatar_url: avatar(65) },
    is_public: false, is_group_chat: true, member_count: 9, unread_count: 12, last_message_at: ago(38) }),
];

// ── Channel detail: a creator's videos (the grid) ──────────────────────────────
const channelPost = (o: Partial<ChannelPost> & Pick<ChannelPost, 'id' | 'yt_video_id' | 'yt_video_title' | 'yt_video_thumbnail'>): ChannelPost => ({
  channel_id: 'demo-c-01', poster_id: uid('maya'), poster: { handle: 'maya' },
  post_type: 'youtube', source_type: 'bunny', video_url: null, duration: 40,
  is_pinned: false, created_at: ago(60), message: null,
  emoji_reactions: [], reaction_count: 0, has_my_reaction: true, review_count: 0, has_my_review: false,
  parent_post_id: null, parent_yt_video_id: null, parent_source_type: 'youtube',
  ...o,
});
const REACT = [{ emoji: '🔥', user_id: 'demo-u-02' }, { emoji: '😍', user_id: 'demo-u-04' }, { emoji: '👏', user_id: 'demo-u-05' }];
export const demoChannelPosts: ChannelPost[] = [
  channelPost({ id: 'demo-cp-01', yt_video_id: 'demo-mv-01', yt_video_title: 'my new track is OUT 🎧', yt_video_thumbnail: thumb('recordingstudio', 100),
    is_pinned: true, duration: 41, created_at: ago(15), reaction_count: 9, emoji_reactions: REACT, review_count: 3 }),
  channelPost({ id: 'demo-cp-02', yt_video_id: 'demo-mv-02', yt_video_title: 'studio vlog day 3', yt_video_thumbnail: thumb('vlogger', 101),
    duration: 57, created_at: ago(120), reaction_count: 5, emoji_reactions: REACT.slice(0, 1) }),
  channelPost({ id: 'demo-cp-03', yt_video_id: 'demo-mv-04', yt_video_title: 'behind the scenes 🎬', yt_video_thumbnail: thumb('filmset', 103),
    duration: 44, created_at: ago(220), reaction_count: 12, emoji_reactions: REACT, review_count: 2 }),
  channelPost({ id: 'demo-cp-04', yt_video_id: 'demo-mv-06', yt_video_title: 'Q&A — you asked, I answer', yt_video_thumbnail: thumb('microphone', 105),
    duration: 49, created_at: ago(300), reaction_count: 7, emoji_reactions: REACT.slice(0, 2) }),
  channelPost({ id: 'demo-cp-05', yt_video_id: 'demo-mv-10', yt_video_title: 'acoustic version 🎸', yt_video_thumbnail: thumb('guitar', 109),
    duration: 30, created_at: ago(420), reaction_count: 18, emoji_reactions: REACT, review_count: 4 }),
  channelPost({ id: 'demo-cp-06', yt_video_id: 'demo-sh-08', yt_video_title: 'unreleased snippet 🔥', yt_video_thumbnail: thumb('recordingstudio', 8),
    duration: 52, created_at: ago(560), reaction_count: 11, emoji_reactions: REACT.slice(0, 2) }),
  channelPost({ id: 'demo-cp-07', yt_video_id: 'demo-sh-15', yt_video_title: 'lofi to study/chill to', yt_video_thumbnail: thumb('turntable', 15),
    duration: 55, created_at: ago(720), reaction_count: 6 }),
  channelPost({ id: 'demo-cp-08', yt_video_id: 'demo-sh-01', yt_video_title: 'when the beat finally drops 😮‍💨', yt_video_thumbnail: thumb('concert', 1),
    duration: 38, created_at: ago(900), reaction_count: 22, emoji_reactions: REACT, review_count: 5 }),
];

// ── A post's reaction clips (the reactions list on a post detail) ──────────────
// Rendered as watchable in DEMO (ChannelPostScreen forces 'local' state). post_type 'clip',
// poster = a friend, parented to the pinned post (demo-cp-01).
const reactionClip = (id: string, handle: string, duration: number, emoji: ChannelPost['emoji_reactions']): ChannelPost => ({
  id, channel_id: 'demo-c-01', poster_id: uid(handle), poster: { handle },
  post_type: 'clip', source_type: 'youtube', yt_video_id: null, yt_video_title: null, yt_video_thumbnail: null,
  video_url: `https://demo.local/${id}.mp4`, duration, is_pinned: false, created_at: ago(10), message: null,
  emoji_reactions: emoji, reaction_count: emoji.length, has_my_reaction: false, review_count: 0, has_my_review: false,
  parent_post_id: 'demo-cp-01', parent_yt_video_id: 'demo-mv-01', parent_source_type: 'youtube',
});
export const demoPostReactions: ChannelPost[] = [
  reactionClip('demo-r-01', 'kofi',  14, [{ emoji: '😂', user_id: uid('maya') }, { emoji: '🔥', user_id: uid('cara') }]),
  reactionClip('demo-r-02', 'nia',   22, [{ emoji: '😮', user_id: uid('sam') }]),
  reactionClip('demo-r-03', 'eli',   9,  [{ emoji: '😭', user_id: uid('zoe') }, { emoji: '👏', user_id: uid('hana') }]),
  reactionClip('demo-r-04', 'priya', 31, [{ emoji: '❤️', user_id: uid('ben') }]),
  reactionClip('demo-r-05', 'sam',   17, []),
  reactionClip('demo-r-06', 'cara',  12, [{ emoji: '😂', user_id: uid('eli') }, { emoji: '😂', user_id: uid('nia') }, { emoji: '🔥', user_id: uid('sam') }]),
  reactionClip('demo-r-07', 'hana',  26, [{ emoji: '🥹', user_id: uid('maya') }]),
  reactionClip('demo-r-08', 'jules', 19, [{ emoji: '💀', user_id: uid('kofi') }, { emoji: '😂', user_id: uid('zoe') }]),
  reactionClip('demo-r-09', 'theo',  8,  [{ emoji: '👀', user_id: uid('priya') }]),
  reactionClip('demo-r-10', 'ava',   34, [{ emoji: '🔥', user_id: uid('ben') }, { emoji: '❤️', user_id: uid('hana') }]),
  reactionClip('demo-r-11', 'omar',  15, [{ emoji: '😭', user_id: uid('cara') }]),
  reactionClip('demo-r-12', 'zoe',   28, []),
];

// ── Feed: friend reaction threads (build into conversation rows w/ demoFriends) ─
const thread = (o: Pick<FeedThread, 'id' | 'sender_id' | 'video_title' | 'video_thumbnail' | 'created_at'> & Partial<FeedThread>): FeedThread => ({
  video_id: 'demo-th', source_type: 'youtube',
  sender: null, my_status: 'pending', thread_kind: 'reaction', reaction_count: 1, my_reaction_id: null,
  ...o,
});
const sender = (handle: string) => {
  const f = demoFriends.find(x => x.handle === handle)!;
  return { handle: f.handle, display_name: f.displayName };
};
export const demoThreads: FeedThread[] = [
  thread({ id: 'demo-t-01', sender_id: uid('maya'),  video_title: 'wait for it 😭',          video_thumbnail: thumb('surprise', 201),  created_at: ago(8),  sender: sender('maya') }),
  thread({ id: 'demo-t-02', sender_id: uid('cara'),  video_title: 'you HAVE to see this',     video_thumbnail: thumb('crowd', 202),     created_at: ago(26), sender: sender('cara') }),
  thread({ id: 'demo-t-03', sender_id: uid('kofi'),  video_title: 'best play of the season',  video_thumbnail: thumb('basketball', 203), created_at: ago(54), sender: sender('kofi'), my_status: 'reacted', reaction_count: 2 }),
  thread({ id: 'demo-t-04', sender_id: uid('nia'),   video_title: 'this made me cry laughing', video_thumbnail: thumb('comedy', 204),    created_at: ago(95), sender: sender('nia') }),
  thread({ id: 'demo-t-05', sender_id: uid('eli'),   video_title: 'no way this is real',       video_thumbnail: thumb('fireworks', 205), created_at: ago(140), sender: sender('eli') }),
  thread({ id: 'demo-t-06', sender_id: uid('hana'),  video_title: 'send this to someone 😂',   video_thumbnail: thumb('puppy', 206),     created_at: ago(210), sender: sender('hana'), my_status: 'reacted', reaction_count: 3 }),
  thread({ id: 'demo-t-07', sender_id: uid('sam'),   video_title: 'the ending got me',         video_thumbnail: thumb('cinema', 207),    created_at: ago(300), sender: sender('sam') }),
  thread({ id: 'demo-t-08', sender_id: uid('zoe'),   video_title: 'replay value is insane',    video_thumbnail: thumb('gaming', 208),    created_at: ago(420), sender: sender('zoe') }),
];

// ── Exclusive: awarded collections + unopened gifts ────────────────────────────
export const demoAwardedCollections: AwardedCollection[] = [
  { id: 'demo-col-01', channelId: 'demo-c-01', creatorId: uid('maya'),  name: 'Backstage Pass',  coverUrl: thumb('concert', 301),         coverVideoUrl: null, videoCount: 6, status: 'published', publishAt: null, publishedAt: ago(30),  channelName: 'Maya', awardId: 'demo-aw-01', awardedAt: ago(30),  seenAt: ago(20) },
  { id: 'demo-col-02', channelId: 'demo-c-02', creatorId: uid('theo'),  name: 'Studio Sessions', coverUrl: thumb('recordingstudio', 302), coverVideoUrl: null, videoCount: 4, status: 'published', publishAt: null, publishedAt: ago(5),   channelName: 'Theo', awardId: 'demo-aw-02', awardedAt: ago(5),   seenAt: null },
  { id: 'demo-col-03', channelId: 'demo-c-05', creatorId: 'demo-u-51',  name: 'Secret Recipes',  coverUrl: thumb('cooking', 303),         coverVideoUrl: null, videoCount: 8, status: 'published', publishAt: null, publishedAt: ago(180), channelName: 'Rin',  awardId: 'demo-aw-03', awardedAt: ago(180), seenAt: ago(160) },
  { id: 'demo-col-04', channelId: 'demo-c-04', creatorId: uid('jules'), name: 'Full Programs',   coverUrl: thumb('gym', 304),             coverVideoUrl: null, videoCount: 5, status: 'published', publishAt: null, publishedAt: ago(50),  channelName: 'Jules', awardId: 'demo-aw-04', awardedAt: ago(50),  seenAt: null },
];

export const demoAwardGifts: AwardGift[] = [
  { awardId: 'demo-aw-02', collectionId: 'demo-col-02', collectionName: 'Studio Sessions', coverUrl: thumb('recordingstudio', 302), channelName: 'Theo',  creatorName: 'Theo Park', awardedAt: ago(5) },
  { awardId: 'demo-aw-04', collectionId: 'demo-col-04', collectionName: 'Full Programs',   coverUrl: thumb('gym', 304),             channelName: 'Jules', creatorName: 'Jules Park', awardedAt: ago(50) },
];
