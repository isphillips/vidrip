import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet,
  TouchableOpacity, Image, ActivityIndicator, Alert, RefreshControl,
  ScrollView, useWindowDimensions, Animated, Easing, PanResponder, KeyboardAvoidingView, Keyboard, Platform, BackHandler, InteractionManager,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Video from 'react-native-video';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import GradientButton from '../../studio/components/GradientButton';
import GradientIcon from '../../../components/GradientIcon';
import AccountBlob from '../../../components/AccountBlob';
import SlimeDetective from '../components/SlimeDetective';
import { IG_BLOCK_LAUNCH_JS } from '../../shared/igBlockLaunch';
import { IG_REEL_JS, TapToPlayHint } from '../../shared/igReelPlayer';
import {
  fetchShorts, searchShorts, CATEGORIES, categoryLabel, type ShortRow, type Category,
} from '../../../infrastructure/supabase/queries/shorts';
import { supabase } from '../../../infrastructure/supabase/client';
import { fetchFriends, type Friend } from '../../../infrastructure/supabase/queries/friends';
import { sendThread, updateThreadIntro } from '../../../infrastructure/supabase/queries/threads';
import { assertVideoAllowed, ModerationRejected } from '../../../infrastructure/moderation/moderateVideo';
import { uploadIntro } from '../../../infrastructure/storage/introStorage';
import { usePendingIntroStore } from '../../../store/pendingIntroStore';
import { extractTikTokId, fetchTikTokMeta, tikTokPlayerUrl, isTikTokUrl, isTikTokShortLink, resolveTikTokId, resolveTikTokShortLink } from '../../../infrastructure/tiktok/api';
import { fetchYouTubeDurationSeconds, MAX_VIDEO_SECONDS } from '../../../infrastructure/youtube/api';
import { useShareIntentStore } from '../../../store/shareIntentStore';
import { useShareUiStore } from '../../../store/shareUiStore';
import { fetchMembersOnlyVideos } from '../../../infrastructure/supabase/queries/channels';
import {
  fetchConnectedFeed, refreshConnectedFeed, FEED_REFRESH_COOLDOWN_MS,
} from '../../../infrastructure/supabase/queries/connectedFeed';
import { fetchSyncedAccounts } from '../../../infrastructure/supabase/queries/syncedAccounts';
import { fetchRecommended, refreshRecommended, RECOMMENDED_COOLDOWN_MS } from '../../../infrastructure/supabase/queries/recommended';
import { fetchFriendsTrending, fetchPersonalizedShorts, fetchTrending } from '../../../infrastructure/supabase/queries/personalized';
import { useAuthStore } from '../../../store/authStore';
import VideoCommentsSheet from '../../comments/components/VideoCommentsSheet';
import type { ShareStackScreenProps, RootStackParamList } from '../../../app/navigation/types';

// Natural height of the expanding search row (input padding + line + border).
const SEARCH_ROW_HEIGHT = 56;


// ── Helpers ───────────────────────────────────────────────────────────────────
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) { return m[1]; }
  }
  return null;
}

function extractInstagramId(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Best-effort metadata for a pasted public Reel via the official Instagram oEmbed API
// (server-side fn keeps the app secret off the client). Every field is optional —
// oEmbed may not return a caption, and login-walled posts return nothing — so callers
// fall back to defaults.
async function fetchInstagramOg(
  id: string,
): Promise<{ title: string; thumbnail: string; author: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('instagram-oembed', {
      body: { url: `https://www.instagram.com/reel/${id}/` },
    });
    if (error || !data?.ok) { return { title: '', thumbnail: '', author: '' }; }
    return {
      title: (data.title ?? '').slice(0, 120),
      thumbnail: data.thumbnail ?? '',
      author: data.author ?? '',
    };
  } catch {
    return { title: '', thumbnail: '', author: '' };
  }
}

// Fit-only styling for the official IG /embed/ — fills the width and centers the
// card on black, dropping just the embed's outer card margin/border. The header
// (username) and footer ("View on Instagram") attribution stay intact, so the embed
// renders unmodified in substance — this only resizes it to sit better in the window.
// The white "empty space" is an opaque white box in IG's embed card (the comment
// area / trailing padding), not the WebView backing. IG's CSP blocks injected <style>
// tags, so we set styles directly (CSP-safe) and target elements by trait, not by
// (obfuscated) class: blacken the page, hide the comment composer + any EMPTY white
// box (the dead space), and collapse white-card padding. The footer keeps its content
// (icons, likes, caption, View on Instagram) so attribution stays intact. Re-applied
// on an interval to survive IG's late re-renders.
// Refresh button with a live MM:SS countdown while on cooldown. Self-ticking so it
// re-renders every second without re-rendering the whole share screen. The spinner
// is scaled down to the text size so the button doesn't change size when pressed.
function RefreshButton({ lastFetchedAt, cooldownMs, refreshing, onPress }: {
  lastFetchedAt: string | null; cooldownMs: number; refreshing: boolean; onPress: () => void;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = lastFetchedAt
    ? Math.max(0, cooldownMs - (Date.now() - new Date(lastFetchedAt).getTime())) : 0;
  const onCooldown = remaining > 0;
  const s = Math.ceil(remaining / 1000);
  const label = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <TouchableOpacity
      style={[styles.feedRefreshBtn, (onCooldown || refreshing) && styles.feedRefreshBtnDisabled]}
      onPress={onPress} disabled={onCooldown || refreshing}>
      {refreshing
        ? <ActivityIndicator size="small" color={C.WHITE} style={styles.feedRefreshSpinner} />
        : <Text style={styles.feedRefreshText}>{onCooldown ? `Refresh in ${label}` : 'Refresh'}</Text>}
    </TouchableOpacity>
  );
}

function DurationBadge({ seconds }: { seconds: number }) {
  const s = seconds % 60;
  const m = Math.floor(seconds / 60);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        {m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`}
      </Text>
    </View>
  );
}


// ── Types ─────────────────────────────────────────────────────────────────────
type VideoItem = { videoId: string; title: string; thumbnail: string; channelTitle: string; sourceType?: 'youtube' | 'tiktok' | 'instagram'; videoUrl?: string | null; duration?: number; createdAt?: string };
type Mode = 'browse' | 'paste';
const PAGE = 50;
const DRAWER_HEIGHT_PCT = 0.68;
const FEED_BAR_HEIGHT = 44;   // fixed height of the collapsible feed bar

// One-line descriptor shown in the feed bar for each category grid. 'latest' is the
// personalized grid (labelled "For You"); the rest are YouTube category buckets.
const CATEGORY_DESC: Record<string, string> = {
  latest:   'Picked for you based on what you react to',
  trending: 'Trending Shorts right now',
  music:    'Music videos & performances',
  gaming:   'Gaming clips & highlights',
  funny:    'Comedy & funny moments',
  sports:   'Sports highlights & plays',
  news:     'News & current events',
  pets:     'Pets & animals',
  cars:     'Cars & motors',
};

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ShareHomeScreen({ navigation: _nav }: ShareStackScreenProps<'ShareHome'>) {
  const { top, bottom } = useSafeAreaInsets();
  const isFocused = useIsFocused();   // pause the instagram preview when leaving the tab
  const { width, height } = useWindowDimensions();
  const { user } = useAuthStore();
  // Root nav so we can reach the RecordIntro full-screen modal (lives in the root stack).
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Optional intro clip recorded for the current share (handed back from RecordIntro).
  const [introClip, setIntroClip] = useState<{ path: string; duration: number } | null>(null);
  const pendingIntroClip = usePendingIntroStore(s => s.clip);
  const clearPendingIntro = usePendingIntroStore(s => s.clear);
  useEffect(() => {
    if (pendingIntroClip) { setIntroClip(pendingIntroClip); clearPendingIntro(); }
  }, [pendingIntroClip, clearPendingIntro]);

  // browse state
  const [mode, setMode]         = useState<Mode>('browse');
  const [category, setCategory] = useState<Category>('latest');
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<ShortRow[]>([]);
  const [memberVideos, setMemberVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching]    = useState(false);
  const [searchOpen, setSearchOpen]  = useState(false);   // header search icon → expanding input
  // Friends (videos your friends reacted to / shared — collaborative signal).
  // Not the default — the personalized "For You" grid (category 'latest') leads.
  const [showFriends, setShowFriends] = useState(false);
  const [friendItems, setFriendItems] = useState<VideoItem[]>([]);
  const [friendsFeedLoading, setFriendsFeedLoading] = useState(false);
  const [friendsRefreshing, setFriendsRefreshing] = useState(false);
  // For You (personal connected feed)
  const [showForYou, setShowForYou]  = useState(false);
  const [feedItems, setFeedItems]    = useState<VideoItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [hasFeedConnection, setHasFeedConnection] = useState(false);
  const [feedLastSyncedAt, setFeedLastSyncedAt] = useState<string | null>(null);
  // Recommended (short-form from the user's relevant subscriptions)
  const [showRecommended, setShowRecommended] = useState(false);
  const [recItems, setRecItems] = useState<VideoItem[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recRefreshing, setRecRefreshing] = useState(false);
  const [recLastFetchedAt, setRecLastFetchedAt] = useState<string | null>(null);
  const offsetRef  = useRef(0);
  const hasMoreRef = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Feed bar collapse-on-scroll: 1 = shown, 0 = collapsed. Fixed bar height (no
  // measuring) so the collapse can't feed back into a re-render mid-animation.
  const feedBarAnim   = useRef(new Animated.Value(1)).current;
  const barShownRef   = useRef(true);
  const lastScrollY   = useRef(0);
  const gridRef       = useRef<FlatList<VideoItem>>(null);
  // Keep the paste-link field above the keyboard (it auto-focuses when you switch to Paste mode).
  const pasteScrollRef = useRef<ScrollView>(null);
  const focusPasteScroll = () => { setTimeout(() => pasteScrollRef.current?.scrollToEnd({ animated: true }), 250); };
  const setFeedBar = useCallback((shown: boolean) => {
    if (barShownRef.current === shown) { return; }
    barShownRef.current = shown;
    Animated.timing(feedBarAnim, {
      toValue: shown ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [feedBarAnim]);
  const onGridScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;
    if (y <= 0) { setFeedBar(true); return; }     // at the top → always show
    if (dy > 6) { setFeedBar(false); }            // scrolling down → collapse
    else if (dy < -6) { setFeedBar(true); }       // scrolling up → reveal
  }, [setFeedBar]);
  // Switching tabs/categories: scroll the grid back to the top and reveal the bar
  // (the single FlatList is reused across tabs, so it otherwise keeps the old offset).
  useEffect(() => {
    gridRef.current?.scrollToOffset({ offset: 0, animated: false });
    lastScrollY.current = 0;
    barShownRef.current = true;
    feedBarAnim.setValue(1);
  }, [showFriends, showForYou, showRecommended, category, query, feedBarAnim]);

  // paste state
  const [url, setUrl]         = useState('');
  const [pasting, setPasting] = useState(false);
  // Reactive link check: gate Preview & Share on the pasted link being valid AND
  // (for YouTube) within the 3-min limit. TikTok can't be length-checked → 'ok'.
  const [linkStatus, setLinkStatus] =
    useState<'idle' | 'checking' | 'ok' | 'tooLong' | 'invalid'>('idle');

  // player overlay
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const playerAnim = useRef(new Animated.Value(0)).current;

  // header search — animate the expanding input row open/closed
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);
  useEffect(() => {
    Animated.timing(searchAnim, {
      toValue: searchOpen ? 1 : 0, duration: 200, useNativeDriver: false,
    }).start();
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [searchOpen, searchAnim]);

  // share drawer
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [friends, setFriends]         = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendFilter, setFriendFilter]     = useState('');
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [sentThisSession, setSentThisSession] = useState<Set<string>>(new Set());
  const [sending, setSending]     = useState(false);
  const [toastMsg, setToastMsg]   = useState('');
  const drawerAnim = useRef(new Animated.Value(height)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // comments sheet
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);

  // 3-slot WebView pool — always keeps prev/current/next video pre-buffering
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [slotVideos, setSlotVideos] = useState<[VideoItem|null, VideoItem|null, VideoItem|null]>([null, null, null]);
  // IG reels are tap-to-play (autoplay triggers the WKWebView black-video bug). Track
  // per-SLOT whether the current reel has started — reset on each (re)load — so the
  // "tap to play" hint reappears every time a slot loads a new reel.
  const [igSlotStarted, setIgSlotStarted] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const slotAnims     = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const slotLogicalX  = useRef([0, 0, 0]);          // tracks position without reading _value
  const activeSlotRef = useRef<0|1|2>(1);
  const slotVideoIdxRef = useRef<[number|null, number|null, number|null]>([null, null, null]);
  const wvRefs        = useRef<(WebView|null)[]>([null, null, null]);
  const slotReadyRef  = useRef([false, false, false]); // doc loaded → safe to injectJavaScript
  const autoSkipRef   = useRef(0);                      // consecutive auto-skips on unplayable videos
  const gooX          = useRef(new Animated.Value(0)).current;
  const gooScaleY     = useRef(new Animated.Value(1)).current;
  const gooOpacity    = useRef(new Animated.Value(0)).current;
  const transitioningRef  = useRef(false);
  const gridDataRef       = useRef<VideoItem[]>([]);
  const nextSlotTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-fetch comments when returning from RecordCommentScreen
  useEffect(() => {
    if (isFocused && commentsOpen) {
      setCommentsRefreshKey(k => k + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const drawerH = Math.round(height * DRAWER_HEIGHT_PCT);
  const cardW   = (width - SPACE.LG * 2 - SPACE.MD) / 2;
  const cardH   = Math.round(cardW * (16 / 9));

  // ── Browse data ─────────────────────────────────────────────────────────────
  const loadCategory = useCallback(async (cat: Category, reset = true, silent = false) => {
    if (reset) { if (!silent) { setLoading(true); } offsetRef.current = 0; hasMoreRef.current = true; }
    try {
      // 'latest' = personalized (affinity-ranked); 'trending' = hybrid velocity +
      // mostPopular; other categories stay chronological so the filter means what it says.
      const data = !user?.id
        ? await fetchShorts(cat, PAGE, reset ? 0 : offsetRef.current)
        : cat === 'latest'
        ? await fetchPersonalizedShorts(user.id, PAGE, reset ? 0 : offsetRef.current)
        : cat === 'trending'
        ? await fetchTrending(user.id, PAGE, reset ? 0 : offsetRef.current)
        : await fetchShorts(cat, PAGE, reset ? 0 : offsetRef.current);
      setResults(prev => reset ? data : [...prev, ...data]);
      offsetRef.current += data.length;
      hasMoreRef.current = data.length === PAGE;
    } catch (e) { log.error('[ShareHome]', e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [user?.id]);

  // ── For You (personal connected feed) ────────────────────────────────────────
  const loadForYou = useCallback(async () => {
    if (!user?.id) { return; }
    setFeedLoading(true);
    try {
      const [items, accts] = await Promise.all([
        fetchConnectedFeed(user.id),
        fetchSyncedAccounts(user.id, 'feed'),
      ]);
      setFeedItems(items.map(it => ({
        videoId: it.videoId, title: it.title, thumbnail: it.thumbnail,
        channelTitle: it.channelTitle, sourceType: it.sourceType,
        createdAt: it.publishedAt ?? undefined,
      })));
      const yt = accts.find(a => a.provider === 'youtube');
      setHasFeedConnection(!!yt);
      setFeedLastSyncedAt(yt?.last_synced_at ?? null);
    } catch (e) { log.error('[ShareHome] forYou', e); }
    finally { setFeedLoading(false); }
  }, [user?.id]);

  // ── Friends (videos friends reacted to / shared) ──────────────────────────────
  const loadFriendsFeed = useCallback(async () => {
    if (!user?.id) { return; }
    setFriendsFeedLoading(true);
    try {
      const items = await fetchFriendsTrending(user.id);
      setFriendItems(items.map(it => ({
        videoId: it.videoId, title: it.title, thumbnail: it.thumbnail,
        channelTitle: it.channelTitle, sourceType: it.sourceType,
      })));
    } catch (e) { log.error('[ShareHome] friends', e); }
    finally { setFriendsFeedLoading(false); }
  }, [user?.id]);

  // Pull-to-refresh for the Friends tab — free (pure SQL, no quota), so no cooldown.
  const onFriendsRefresh = useCallback(async () => {
    setFriendsRefreshing(true);
    try { await loadFriendsFeed(); }
    finally { setFriendsRefreshing(false); }
  }, [loadFriendsFeed]);

  // Know whether the YouTube feed account exists up front — gates the Recommended
  // tab and the For You refresh bar without first opening the For You tab.
  useEffect(() => {
    if (!user?.id) { return; }
    fetchSyncedAccounts(user.id, 'feed')
      .then(accts => {
        const yt = accts.find(a => a.provider === 'youtube');
        setHasFeedConnection(!!yt);
        setFeedLastSyncedAt(yt?.last_synced_at ?? null);
      })
      .catch(() => {});
  }, [user?.id]);

  // ── Recommended (relevant subscriptions, short-form) ──────────────────────────
  const loadRecommended = useCallback(async () => {
    if (!user?.id) { return; }
    setRecLoading(true);
    try {
      const { items, lastFetchedAt } = await fetchRecommended(user.id);
      setRecItems(items.map(it => ({
        videoId: it.videoId, title: it.title, thumbnail: it.thumbnail,
        channelTitle: it.channelTitle, sourceType: it.sourceType,
        createdAt: it.publishedAt ?? undefined,
      })));
      setRecLastFetchedAt(lastFetchedAt);
    } catch (e) { log.error('[ShareHome] recommended', e); }
    finally { setRecLoading(false); }
  }, [user?.id]);

  const handleRefreshRecommended = useCallback(async () => {
    setRecRefreshing(true);
    try {
      await refreshRecommended();
      setRecLastFetchedAt(new Date().toISOString());   // start the cooldown clock now
      await loadRecommended();
    }
    catch (e: any) { Alert.alert('Recommended', e?.message ?? 'Could not refresh recommendations.'); }
    finally { setRecRefreshing(false); }
  }, [loadRecommended]);

  const handleRefreshFeed = useCallback(async () => {
    if (feedRefreshing) { return; }
    setFeedRefreshing(true);
    try {
      await refreshConnectedFeed('youtube');
      await loadForYou();
    } catch (e: any) {
      Alert.alert('Refresh', e?.message ?? 'Could not refresh your feed.');
    } finally { setFeedRefreshing(false); }
  }, [feedRefreshing, loadForYou]);

  // Pull-to-refresh on the category grids (not For You — it has its own Refresh).
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadCategory(category, true, true); }
    finally { setRefreshing(false); }
  }, [loadCategory, category]);

  // Default back to Browse each time the tab is (re)entered, so returning users
  // land on videos rather than being stranded on the Paste Link panel they used
  // last. (Inbound shared links open the preview overlay on top of Browse, so
  // this doesn't disrupt that flow.)
  useFocusEffect(useCallback(() => { setMode('browse'); }, []));

  // Tapping the Browse tab while it's already active also returns to browse — a
  // plain tab tap doesn't change focus, so the tab button bumps this nonce.
  const browseNonce = useShareUiStore(s => s.browseNonce);
  useEffect(() => { setMode('browse'); }, [browseNonce]);

  // Members Only videos from channels the user has JOINED — refetch on focus so
  // joining/leaving a channel elsewhere is reflected here.
  useFocusEffect(useCallback(() => {
    if (!user?.id) { setMemberVideos([]); return; }
    fetchMembersOnlyVideos(user.id).then(setMemberVideos).catch(() => {});
  }, [user?.id]));

  // Android back button: close drawer or player overlay before letting navigation pop.
  // NOTE: closeDrawer/closePlayer are declared further down, so they must NOT appear in
  // the deps array — reading them here would be a temporal-dead-zone access (Hermes
  // currently tolerates it by yielding undefined, but that's engine-specific and fragile).
  // They're referenced only inside the handler, which runs on back-press (long after both
  // are defined), so omitting them from deps is correct and also stops the listener from
  // re-subscribing on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) { closeDrawer(); return true; }
      if (selectedVideo) { closePlayer(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [drawerOpen, selectedVideo]));

  // Grid = Members Only videos interleaved into the YouTube shorts feed by recency
  // (newest first), rather than pinned to the top. Search results stay as-is.
  const gridData = useMemo(() => {
    type GridItem = VideoItem & { duration?: number; fetchedAt?: string };
    const shorts = results.map(r => ({ ...r })) as GridItem[];
    // Active search overrides whatever tab you're on (search runs against Shorts).
    if (query.trim()) { return shorts; }
    if (showFriends) { return friendItems; }
    if (showRecommended) { return recItems; }
    if (showForYou) { return feedItems; }
    // Members Only content only surfaces in the Latest tab for now.
    if (category !== 'latest') { return shorts; }
    const sortTs = (it: GridItem) => it.fetchedAt ?? it.createdAt ?? '';
    return [...memberVideos, ...shorts].sort((a, b) => sortTs(b).localeCompare(sortTs(a)));
  }, [query, results, showFriends, friendItems, showRecommended, recItems, showForYou, feedItems, memberVideos, category]);

  useEffect(() => { gridDataRef.current = gridData; }, [gridData]);

  // Prefetch thumbnails for adjacent videos so the slide animation never shows a blank image
  useEffect(() => {
    if (selectedIndex === null) { return; }
    const data = gridDataRef.current;
    if (data.length < 2) { return; }
    const prev = data[(selectedIndex - 1 + data.length) % data.length];
    const next = data[(selectedIndex + 1) % data.length];
    if (prev?.thumbnail) { Image.prefetch(prev.thumbnail).catch(() => {}); }
    if (next?.thumbnail) { Image.prefetch(next.thumbnail).catch(() => {}); }
  }, [selectedIndex]);

  useEffect(() => {
    if (mode !== 'browse') { return; }
    clearTimeout(searchTimer.current);
    // Searching takes priority over the active tab (works from For You / Recommended too).
    if (query.trim()) {
      searchTimer.current = setTimeout(async () => {
        setSearching(true);
        try { setResults(await searchShorts(query.trim())); } catch { /* keep */ }
        setSearching(false);
      }, 500);
      return () => clearTimeout(searchTimer.current);
    }
    if (showFriends) { loadFriendsFeed(); return; }
    if (showRecommended) { loadRecommended(); return; }
    if (showForYou) { loadForYou(); return; }
    loadCategory(category);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, mode, showFriends, showForYou, showRecommended]);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingMore || query.trim()) { return; }
    setLoadingMore(true);
    loadCategory(category, false);
  }, [loadingMore, query, category, loadCategory]);

  // ── JS injection helpers for mute/unmute control ────────────────────────────
  const injectActivate = (slotIdx: number, sourceType?: string) => {
    const ref = wvRefs.current[slotIdx];
    // Only inject once the slot's document has loaded — injecting commands into a
    // still-loading YouTube/TikTok player can break it ("An error has occurred").
    if (!ref || !slotReadyRef.current[slotIdx]) { return; }
    const t = sourceType ?? 'youtube';
    if (t === 'youtube') {
      ref.injectJavaScript(`window.__ytPlay&&window.__ytPlay();true;`);
    } else if (t === 'tiktok') {
      ref.injectJavaScript(`(function(){var f=document.getElementById('tt');if(f&&f.contentWindow){f.contentWindow.postMessage({'x-tiktok-player':true,type:'unMute'},'*');f.contentWindow.postMessage({'x-tiktok-player':true,type:'play'},'*');}true;})();`);
    } else if (t === 'instagram') {
      ref.injectJavaScript(`(function(){var v=document.querySelector('video');if(v){v.muted=false;try{v.play();}catch(e){}}true;})();`);
    }
  };

  const injectMute = (slotIdx: number, sourceType?: string) => {
    const ref = wvRefs.current[slotIdx];
    if (!ref || !slotReadyRef.current[slotIdx]) { return; }
    const t = sourceType ?? 'youtube';
    if (t === 'youtube') {
      ref.injectJavaScript(`window.__ytPause&&window.__ytPause();true;`);
    } else if (t === 'tiktok') {
      ref.injectJavaScript(`(function(){var f=document.getElementById('tt');if(f&&f.contentWindow){f.contentWindow.postMessage({'x-tiktok-player':true,type:'mute'},'*');f.contentWindow.postMessage({'x-tiktok-player':true,type:'pause'},'*');}true;})();`);
    } else if (t === 'instagram') {
      ref.injectJavaScript(`(function(){var v=document.querySelector('video');if(v){v.muted=true;v.pause();}true;})();`);
    }
  };

  // ── Background slot scheduling ───────────────────────────────────────────────
  // WebViews are always mounted (blank HTML when idle), so navigating to a video
  // source is cheap. We still wait for interactions to settle so the current video's
  // initial playback isn't competing with a navigation on the background slot.
  const scheduleNextSlot = (slotIdx: 0|1|2, video: VideoItem | null) => {
    if (nextSlotTimerRef.current) { clearTimeout(nextSlotTimerRef.current); nextSlotTimerRef.current = null; }
    if (!video) { return; }
    InteractionManager.runAfterInteractions(() => {
      nextSlotTimerRef.current = setTimeout(() => {
        nextSlotTimerRef.current = null;
        setSlotVideos(prev => {
          const next = [...prev] as [VideoItem|null, VideoItem|null, VideoItem|null];
          next[slotIdx] = video;
          return next;
        });
      }, 500);
    });
  };

  // ── Player open/close ───────────────────────────────────────────────────────
  const initSlots = (video: VideoItem, index: number) => {
    const data = gridDataRef.current;
    if (!data.length) { return; }
    const prevIdx = (index - 1 + data.length) % data.length;
    const nextIdx = (index + 1) % data.length;
    activeSlotRef.current = 1;
    slotVideoIdxRef.current = [prevIdx, index, nextIdx];
    slotLogicalX.current = [-width, 0, width];
    slotAnims[0].setValue(-width);
    slotAnims[1].setValue(0);
    slotAnims[2].setValue(width);
    setSlotVideos([null, video, null]);
    scheduleNextSlot(2, data[nextIdx] ?? null);
  };

  const openPlayer = (video: VideoItem, index?: number) => {
    setSelectedVideo(video);
    setSelectedIndex(index ?? null);
    setSentThisSession(new Set());
    setSelectedFriends(new Set());
    if (index != null) {
      initSlots(video, index);
    } else {
      // Pasted / inbound-share URL: there's no feed grid to prev/next through, so
      // mount this single video straight into the active slot. Without this the
      // WebView pool stays empty and the preview is just black.
      activeSlotRef.current = 1;
      slotVideoIdxRef.current = [-1, -1, -1];
      slotLogicalX.current = [-width, 0, width];
      slotAnims[0].setValue(-width);
      slotAnims[1].setValue(0);
      slotAnims[2].setValue(width);
      setSlotVideos([null, video, null]);
    }
    Animated.spring(playerAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
  };

  const closePlayer = () => {
    if (nextSlotTimerRef.current) { clearTimeout(nextSlotTimerRef.current); nextSlotTimerRef.current = null; }
    setCommentsOpen(false);
    transitioningRef.current = false;
    closeDrawer();
    Animated.timing(playerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setSelectedVideo(null);
      setSelectedIndex(null);
      setSlotVideos([null, null, null]);
    });
  };

  // ── Swipe-to-next/prev video ─────────────────────────────────────────────────
  const goToVideoRef = useRef<(dir: 'left' | 'right') => void>(() => {});

  const goToVideo = useCallback((direction: 'left' | 'right') => {
    if (transitioningRef.current) { return; }
    const data = gridDataRef.current;
    if (data.length < 2) { return; }
    const active = activeSlotRef.current;
    // Which slot slides to center, which slot gets freed for the new adjacent video
    const nextActive = ((active + (direction === 'right' ? 1 : 2)) % 3) as 0|1|2;
    const freed      = ((active + (direction === 'right' ? 2 : 1)) % 3) as 0|1|2;

    // Right swipe requires prebuffered next; left loads on demand
    if (direction === 'right' && !slotVideos[nextActive]) { return; }
    const prevIdxForLoad = slotVideoIdxRef.current[nextActive];
    if (direction === 'left' && prevIdxForLoad == null) { return; }

    transitioningRef.current = true;
    const slideBy = (direction === 'right' ? -1 : 1) * width;

    // Stop the current video immediately — don't wait for animation to finish
    injectMute(active, slotVideos[active]?.sourceType);

    // Load prev video now if not prebuffered — WebView will buffer during the animation
    if (direction === 'left' && !slotVideos[nextActive]) {
      setSlotVideos(prev => {
        const next = [...prev] as [VideoItem|null, VideoItem|null, VideoItem|null];
        next[nextActive] = data[prevIdxForLoad!] ?? null;
        return next;
      });
    }

    gooX.setValue(-slideBy * 0.6);
    gooOpacity.setValue(0);
    gooScaleY.setValue(0.7);

    Animated.parallel([
      // All 3 slots slide together
      Animated.timing(slotAnims[0], { toValue: slotLogicalX.current[0] + slideBy, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slotAnims[1], { toValue: slotLogicalX.current[1] + slideBy, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slotAnims[2], { toValue: slotLogicalX.current[2] + slideBy, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      // Goo sweeps through
      Animated.sequence([
        Animated.timing(gooOpacity, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(gooOpacity, { toValue: 0, duration: 130, delay: 170, useNativeDriver: true }),
      ]),
      Animated.timing(gooX, { toValue: slideBy * 0.6, duration: 380, easing: Easing.out(Easing.exp), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(gooScaleY, { toValue: 1.35, duration: 110, useNativeDriver: true }),
        Animated.timing(gooScaleY, { toValue: 0.8, duration: 160, useNativeDriver: true }),
        Animated.spring(gooScaleY, { toValue: 1, useNativeDriver: true, tension: 180, friction: 8 }),
      ]),
    ]).start(() => {
      // Update logical positions
      slotLogicalX.current[0] += slideBy;
      slotLogicalX.current[1] += slideBy;
      slotLogicalX.current[2] += slideBy;
      activeSlotRef.current = nextActive;

      // Use data directly — slotVideos[nextActive] may be stale if we loaded it inline
      const newIdx  = slotVideoIdxRef.current[nextActive]!;
      const newVideo = data[newIdx];
      if (!newVideo) { transitioningRef.current = false; return; }
      setSelectedVideo(newVideo);
      setSelectedIndex(newIdx);

      // Unmute/play the newly active slot — current was already muted before animation
      injectActivate(nextActive, newVideo.sourceType);

      if (direction === 'right') {
        // Snap freed slot to right edge, then schedule next video load after current settles
        const newNextIdx = (newIdx + 1) % data.length;
        slotAnims[freed].setValue(width);
        slotLogicalX.current[freed] = width;
        slotVideoIdxRef.current[freed] = newNextIdx;
        setSlotVideos(prev => {
          const next = [...prev] as [VideoItem|null, VideoItem|null, VideoItem|null];
          next[freed] = null;
          return next;
        });
        scheduleNextSlot(freed, data[newNextIdx] ?? null);
      } else {
        // Snap freed slot to left edge and null it — we don't prebuffer prev
        const newPrevIdx = (newIdx - 1 + data.length) % data.length;
        slotAnims[freed].setValue(-width);
        slotLogicalX.current[freed] = -width;
        slotVideoIdxRef.current[freed] = newPrevIdx;
        setSlotVideos(prev => {
          const next = [...prev] as [VideoItem|null, VideoItem|null, VideoItem|null];
          next[freed] = null;
          return next;
        });
      }

      transitioningRef.current = false;
    });
  }, [width, gooX, gooOpacity, gooScaleY, slotAnims, slotVideos]);

  useEffect(() => { goToVideoRef.current = goToVideo; }, [goToVideo]);

  const swipePanResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) =>
      !transitioningRef.current &&
      Math.abs(gs.dx) > 14 &&
      Math.abs(gs.dx) > Math.abs(gs.dy) * 1.3,
    onPanResponderRelease: (_, gs) => {
      if (Math.abs(gs.dx) > 55 || Math.abs(gs.vx) > 0.4) {
        goToVideoRef.current(gs.dx > 0 ? 'left' : 'right');
      }
    },
    onPanResponderTerminate: () => {},
  })).current;

  // ── Drawer open/close ───────────────────────────────────────────────────────
  const openDrawer = async () => {
    setDrawerOpen(true);
    setFriendFilter('');
    setSelectedFriends(new Set());
    setIntroClip(null);          // intros are per-share; don't leak across videos
    clearPendingIntro();
    // Load friends lazily
    if (!friends.length && user) {
      setFriendsLoading(true);
      try { setFriends(await fetchFriends(user.id)); }
      catch { /* ignore */ }
      finally { setFriendsLoading(false); }
    }
    Animated.parallel([
      Animated.spring(drawerAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(drawerAnim, { toValue: height, duration: 280, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setDrawerOpen(false));
  };

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!user || !selectedVideo || selectedFriends.size === 0) { return; }
    setSending(true);
    try {
      // Moderate the intro up front so a rejected clip never creates a thread.
      if (introClip) {
        await assertVideoAllowed(introClip.path, { durationSec: introClip.duration, contentType: 'reaction' });
      }

      // Upload + attach the intro BEFORE recipients are added (sendThread runs this
      // hook just before inserting members / firing the push), so a failed attach
      // can't notify anyone with a broken share.
      const onThreadReady = introClip
        ? async (threadId: string) => {
            const introUrl = await uploadIntro(threadId, introClip.path);
            await updateThreadIntro(threadId, introUrl, introClip.duration);
          }
        : undefined;

      await sendThread(
        user.id,
        selectedVideo.videoId,
        selectedVideo.title,
        selectedVideo.thumbnail,
        [...selectedFriends],
        selectedVideo.sourceType ?? 'youtube',
        onThreadReady,
      );

      setSentThisSession(prev => new Set([...prev, ...selectedFriends]));
      setSelectedFriends(new Set());
      setIntroClip(null);
      clearPendingIntro();
      closeDrawer();
      setToastMsg(`Sent to ${selectedFriends.size} friend${selectedFriends.size !== 1 ? 's' : ''}!`);
      setTimeout(() => setToastMsg(''), 2500);
    } catch (e: any) {
      if (e instanceof ModerationRejected) {
        Alert.alert('Intro not allowed', e.message);
      } else {
        // Surface the real reason (storage/permission/network) instead of a generic line.
        Alert.alert('Could not send', e?.message ? String(e.message) : 'Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  // ── Inbound OS share ("Share to Vidrip") ─────────────────────────────────────
  // The link is consumed by the focus-gated effect just below handlePastePreview,
  // which jumps STRAIGHT into the preview (no paste field, no keyboard).
  const pendingShareUrl = useShareIntentStore(s => s.pendingUrl);
  const clearPendingShareUrl = useShareIntentStore(s => s.setPendingUrl);

  // ── Reactive link validation (runs as the user pastes/types) ─────────────────
  useEffect(() => {
    if (mode !== 'paste') { return; }
    const trimmed = url.trim();
    if (!trimmed) { setLinkStatus('idle'); return; }
    // TikTok / Instagram: can't fetch duration → allow through.
    if (extractTikTokId(trimmed)) { setLinkStatus('ok'); return; }
    // TikTok short link (tiktok.com/t/…, vm./vt.…) — resolve the redirect to confirm it's valid.
    if (isTikTokShortLink(trimmed)) {
      setLinkStatus('checking');
      let cancelled = false;
      resolveTikTokShortLink(trimmed).then(ttId => { if (!cancelled) { setLinkStatus(ttId ? 'ok' : 'invalid'); } });
      return () => { cancelled = true; };
    }
    if (extractInstagramId(trimmed)) { setLinkStatus('ok'); return; }
    const ytId = extractYouTubeId(trimmed);
    if (!ytId) { setLinkStatus('invalid'); return; }
    setLinkStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      const seconds = await fetchYouTubeDurationSeconds(ytId);
      if (cancelled) { return; }
      // null = unknown length → allow rather than false-block.
      setLinkStatus(seconds != null && seconds > MAX_VIDEO_SECONDS ? 'tooLong' : 'ok');
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [url, mode]);

  // ── Paste flow ──────────────────────────────────────────────────────────────
  // rawUrl lets the inbound-share handler preview a link directly without first
  // round-tripping through the `url` text-field state.
  const handlePastePreview = async (rawUrl?: string) => {
    Keyboard.dismiss();
    const link = (rawUrl ?? url).trim();
    // TikTok first — if it looks like a TikTok URL (incl. short links), treat as TikTok.
    if (isTikTokUrl(link)) {
      setPasting(true);
      const ttId = await resolveTikTokId(link);
      if (!ttId) { setPasting(false); Alert.alert('Invalid Link', 'Couldn’t resolve that TikTok link.'); return; }
      const meta = await fetchTikTokMeta(ttId);
      setPasting(false);
      openPlayer({
        videoId: ttId,
        title: meta?.title || 'TikTok',
        thumbnail: meta?.thumbnail || '',
        channelTitle: meta?.author || '',
        sourceType: 'tiktok',
      });
      return;
    }

    const igId = extractInstagramId(link);
    if (igId) {
      setPasting(true);
      const og = await fetchInstagramOg(igId);   // best-effort title + thumbnail
      setPasting(false);
      openPlayer({
        videoId: igId,
        title: og.title || 'Instagram Reel',
        thumbnail: og.thumbnail,
        channelTitle: og.author,
        sourceType: 'instagram',
      });
      return;
    }

    const videoId = extractYouTubeId(link);
    if (!videoId) { Alert.alert('Invalid Link', 'Paste a YouTube Shorts, TikTok, or Instagram Reel link to continue.'); return; }
    setPasting(true);
    let title = 'YouTube Short';
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (res.ok) { const d = await res.json(); title = d.title ?? title; thumbnail = d.thumbnail_url ?? thumbnail; }
    } catch { /* use defaults */ }
    setPasting(false);
    openPlayer({ videoId, title, thumbnail, channelTitle: '' });
  };

  // Inbound shared URL → jump straight to the preview (no paste field / keyboard).
  // Focus-gated so RootNavigator switches to this tab first, then we consume it.
  useEffect(() => {
    if (!pendingShareUrl || !isFocused) { return; }
    const link = pendingShareUrl;
    clearPendingShareUrl(null);
    setUrl(link);                 // keep it in the field for an easy re-preview/edit
    handlePastePreview(link);     // open the preview directly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShareUrl, isFocused]);

  // ── Filtered friends ────────────────────────────────────────────────────────
  const filteredFriends = friendFilter.trim()
    ? friends.filter(f =>
        f.handle.toLowerCase().includes(friendFilter.toLowerCase()) ||
        (f.displayName ?? '').toLowerCase().includes(friendFilter.toLowerCase()))
    : friends;

  const toggleFriend = (id: string) => {
    if (sentThisSession.has(id)) { return; }
    setSelectedFriends(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const playerOpacity = playerAnim;
  const playerScale   = playerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });


  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { marginTop: top }]}>
        <Text style={styles.headerTitle}>Browse ✵ Share</Text>
        <View style={styles.headerActions}>
          {mode === 'browse' && (
            <TouchableOpacity
              style={styles.searchToggle}
              hitSlop={10}
              onPress={() => { const next = !searchOpen; setSearchOpen(next); if (!next) { setQuery(''); } }}>
              <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={C.INK} />
            </TouchableOpacity>
          )}
          <TouchableOpacity hitSlop={10} activeOpacity={0.7} style={styles.accountButton}
            onPress={() => (rootNav as any).getParent()?.navigate('Account')}>
            <AccountBlob size={34} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Mode toggle */}
      <View style={styles.toggle}>
        <TouchableOpacity style={[styles.toggleBtn, mode === 'browse' && styles.toggleBtnActive]} onPress={() => setMode('browse')}>
          <Text style={[styles.toggleTxt, mode === 'browse' && styles.toggleTxtActive]}>Browse</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, mode === 'paste' && styles.toggleBtnActive]} onPress={() => setMode('paste')}>
          <Text style={[styles.toggleTxt, mode === 'paste' && styles.toggleTxtActive]}>Paste Link</Text>
        </TouchableOpacity>
      </View>

      {/* Paste mode */}
      {mode === 'paste' ? (
        <ScrollView
          ref={pasteScrollRef}
          style={styles.pasteScroll}
          contentContainerStyle={styles.pasteContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets>
          <SlimeDetective />
          <Text style={styles.pasteLabel}>YouTube, TikTok, or Instagram URL</Text>
          <TextInput
            style={styles.pasteInput} value={url} onChangeText={setUrl}
            placeholder="Paste a YouTube, TikTok, or Instagram Reel link" placeholderTextColor={C.SUBTLE}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus
            onFocus={focusPasteScroll}
          />
          {linkStatus === 'tooLong' ? (
            <View style={styles.tooLongBox}>
              <Text style={styles.tooLongTitle}>Video too long</Text>
              <Text style={styles.tooLongText}>
                We only allow videos up to 3 minutes (180 seconds). Please find a shorter video to share.
              </Text>
            </View>
          ) : (
            <GradientButton
              label="Preview & Share →"
              onPress={() => handlePastePreview()}
              disabled={linkStatus !== 'ok'}
              loading={pasting || linkStatus === 'checking'}
            />
          )}
        </ScrollView>
      ) : (
        <>
          <Animated.View
            pointerEvents={searchOpen ? 'auto' : 'none'}
            style={{
              opacity: searchAnim,
              height: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, SEARCH_ROW_HEIGHT] }),
              overflow: 'hidden',
              zIndex: 2, elevation: 2,
            }}>
            <View style={styles.searchRow}>
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput} value={query} onChangeText={setQuery}
                placeholder="Search Shorts…" placeholderTextColor={C.SUBTLE}
                autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing"
              />
              {searching && <ActivityIndicator size="small" color={C.ACCENT} style={styles.searchSpinner} />}
            </View>
          </Animated.View>

          {!query.trim() && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
              {/* "For You" = the personalized 'latest' grid. First + default-selected tab. */}
              <TouchableOpacity key="foryou-latest"
                style={[styles.tab, (!showFriends && !showForYou && !showRecommended && category === 'latest') && styles.tabActive]}
                onPress={() => { setShowFriends(false); setShowForYou(false); setShowRecommended(false); setCategory('latest'); setQuery(''); }}>
                <Text style={[styles.tabTxt, (!showFriends && !showForYou && !showRecommended && category === 'latest') && styles.tabTxtActive]}>For You</Text>
              </TouchableOpacity>
              <TouchableOpacity key="friends" style={[styles.tab, showFriends && styles.tabActive]}
                onPress={() => { setShowFriends(true); setShowForYou(false); setShowRecommended(false); setQuery(''); }}>
                <Text style={[styles.tabTxt, showFriends && styles.tabTxtActive]}>Friends</Text>
              </TouchableOpacity>
              <TouchableOpacity key="foryou" style={[styles.tab, showForYou && styles.tabActive]}
                onPress={() => { setShowForYou(true); setShowFriends(false); setShowRecommended(false); setQuery(''); }}>
                <Text style={[styles.tabTxt, showForYou && styles.tabTxtActive]}>Liked</Text>
              </TouchableOpacity>
              {hasFeedConnection && (
                <TouchableOpacity key="recommended" style={[styles.tab, showRecommended && styles.tabActive]}
                  onPress={() => { setShowRecommended(true); setShowFriends(false); setShowForYou(false); setQuery(''); }}>
                  <Text style={[styles.tabTxt, showRecommended && styles.tabTxtActive]}>Recommended</Text>
                </TouchableOpacity>
              )}
              {CATEGORIES.filter(cat => cat !== 'latest').map(cat => {
                const active = !showFriends && !showForYou && !showRecommended && category === cat;
                return (
                  <TouchableOpacity key={cat} style={[styles.tab, active && styles.tabActive]}
                    onPress={() => { setShowFriends(false); setShowForYou(false); setShowRecommended(false); setCategory(cat); setQuery(''); }}>
                    <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>
                      {categoryLabel(cat)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Feed bar — collapses on scroll down, reveals on scroll up. Fixed height
              so the collapse can't re-measure and clip its own content. */}
          <Animated.View
            style={{
              overflow: 'hidden',
              opacity: feedBarAnim,
              height: feedBarAnim.interpolate({ inputRange: [0, 1], outputRange: [0, FEED_BAR_HEIGHT] }),
            }}>
            <View>
              {showFriends && (
                <View style={styles.feedBar}>
                  <Text style={styles.feedBarText}>Videos your friends reacted to & shared</Text>
                </View>
              )}

              {!showFriends && !showForYou && !showRecommended && !query.trim() && CATEGORY_DESC[category] && (
                <View style={styles.feedBar}>
                  <Text style={styles.feedBarText}>{CATEGORY_DESC[category]}</Text>
                </View>
              )}

              {showForYou && hasFeedConnection && (
                <View style={styles.feedBar}>
                  <Text style={styles.feedBarText}>Your liked videos</Text>
                  <RefreshButton
                    lastFetchedAt={feedLastSyncedAt}
                    cooldownMs={FEED_REFRESH_COOLDOWN_MS}
                    refreshing={feedRefreshing}
                    onPress={handleRefreshFeed}
                  />
                </View>
              )}

              {showRecommended && (
                <View style={styles.feedBar}>
                  <Text style={styles.feedBarText}>Your external subscriptions</Text>
                  <RefreshButton
                    lastFetchedAt={recLastFetchedAt}
                    cooldownMs={RECOMMENDED_COOLDOWN_MS}
                    refreshing={recRefreshing}
                    onPress={handleRefreshRecommended}
                  />
                </View>
              )}
            </View>
          </Animated.View>
          <View style={{ height: SPACE.SM }} />

          {(() => {
            const special = (showFriends || showForYou || showRecommended) && !query.trim();
            const gridLoading = showFriends ? friendsFeedLoading : showRecommended ? recLoading : showForYou ? feedLoading : loading;
            // Keep the current items on screen while any tab reloads — the old
            // category's results linger in state until the new ones land, so there's
            // no blank flash or layout jump. Only truly-empty tabs show a spinner.
            const data = gridData;
            const isEmpty = data.length === 0;
            return (
              <FlatList
                ref={gridRef}
                // No flex:1 — when empty the list shrinks to its content so the
                // spinner/message sits just under the pills instead of centering.
                data={data}
                keyExtractor={item => item.videoId}
                numColumns={2}
                onScroll={onGridScroll}
                scrollEventThrottle={16}
                contentContainerStyle={isEmpty ? [styles.gridTop, { minHeight: height * 0.9 }] : styles.grid}
                columnWrapperStyle={styles.row}
                refreshControl={
                  // Friends is free (pure SQL) → pull-to-refresh. For You / Recommended
                  // hit quota'd APIs so they keep their cooldown buttons (no pull).
                  showFriends ? (
                    <RefreshControl refreshing={friendsRefreshing} onRefresh={onFriendsRefresh} tintColor={C.ACCENT} />
                  ) : special ? undefined : (
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.ACCENT} />
                  )
                }
                onEndReached={(special || isEmpty) ? undefined : handleLoadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={!special && loadingMore ? <ActivityIndicator color={C.ACCENT} style={{ paddingVertical: SPACE.XL }} /> : null}
                ListEmptyComponent={
                  gridLoading ? (
                    <ActivityIndicator color={C.ACCENT} style={styles.gridSpinner} />
                  ) : (
                    <View style={styles.emptyContainer}>
                      <Text style={[styles.emptyText, styles.emptyTextTop]}>
                        {query.trim()
                          ? `No results for "${query.trim()}"`
                          : showFriends
                          ? 'Nothing from friends yet. When your friends react to or share videos, they show up here.'
                          : showRecommended
                          ? 'No recommendations yet. Tap Refresh to pull from your subscriptions.'
                          : showForYou
                          ? (hasFeedConnection
                              ? 'No videos yet. Tap Refresh to pull your liked videos.'
                              : 'Connect a YouTube account in your profile to see your Liked videos.')
                          : 'No Shorts yet'}
                      </Text>
                    </View>
                  )
                }
                renderItem={({ item, index }) => (
                  <TouchableOpacity style={[styles.card, { width: cardW }]} onPress={() => openPlayer(item, index)} activeOpacity={0.8}>
                    <Image source={{ uri: item.thumbnail }} style={[styles.cardThumb, { height: cardH }]} resizeMode="cover" />
                    {item.duration != null && <DurationBadge seconds={item.duration} />}
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.cardChannel} numberOfLines={1}>{item.channelTitle}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            );
          })()}
        </>
      )}

      {/* ── Player overlay ─────────────────────────────────────────────────── */}
      {/*
        The outer Animated.View is ALWAYS mounted (not conditional on selectedVideo).
        This keeps all 3 WebViews permanently in the tree so their browser contexts
        are pre-created — loading a video becomes a cheap navigation rather than an
        expensive mount, eliminating the jitter when the next slot starts buffering.
        When the player is closed: opacity=0, pointerEvents="none" (grid works normally).
      */}
      <Animated.View
        style={[styles.playerOverlay, { opacity: playerOpacity, transform: [{ scale: playerScale }] }]}
        pointerEvents={selectedVideo ? 'auto' : 'none'}
        {...swipePanResponder.panHandlers}>

        {/* Neon goo blob — sweeps behind videos during transition */}
        {selectedVideo && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0, bottom: 0,
              left: -width * 0.5,
              width: width * 2,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: gooOpacity,
              transform: [{ translateX: gooX }, { scaleY: gooScaleY }],
              zIndex: 1,
            }}>
            <View style={{ position: 'absolute', width: width * 1.9, height: height * 0.68, borderRadius: height * 0.34, backgroundColor: 'rgba(88, 14, 180, 0.20)' }} />
            <View style={{ position: 'absolute', width: width * 1.4, height: height * 0.52, borderRadius: height * 0.26, backgroundColor: 'rgba(130, 40, 230, 0.32)' }} />
            <View style={{ position: 'absolute', width: width * 0.95, height: height * 0.38, borderRadius: height * 0.19, backgroundColor: 'rgba(175, 70, 255, 0.44)' }} />
            <View style={{ position: 'absolute', width: width * 0.55, height: height * 0.22, borderRadius: height * 0.11, backgroundColor: 'rgba(215, 120, 255, 0.60)' }} />
          </Animated.View>
        )}

        {/* WebView pool — slots 1 (current) + 2 (next) always mounted with blank HTML
             when idle; slot 0 (prev) only mounts on demand since back-navigation is rare */}
        {([0, 1, 2] as const).map(i => {
          const sv = slotVideos[i];
          // Prev slot: skip when empty — mounts on demand if user swipes back
          if (i === 0 && !sv) { return null; }
          const isActive = i === activeSlotRef.current;
          const onSlotLoad = () => {
            if (!sv) { return; }
            slotReadyRef.current[i] = true; // document loaded → injects are safe now
            if (activeSlotRef.current === i && !transitioningRef.current) {
              injectActivate(i, sv.sourceType);
            } else {
              // Reinforce muting for background slots — URL mute=1 alone can leak
              injectMute(i, sv.sourceType);
            }
          };
          const onSlotLoadStart = () => {
            slotReadyRef.current[i] = false;
            // New reel loading in this slot → show the tap-to-play hint again.
            setIgSlotStarted(p => (p[i] ? (() => { const n = [...p] as [boolean, boolean, boolean]; n[i] = false; return n; })() : p));
          };
          // YouTube IFrame API → RN bridge: reset skip-guard on ready; auto-advance
          // past a video the player can't play (onError) when it's the active slot.
          const onSlotMessage = (e: any) => {
            let msg: any; try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
            if (msg?.type === 'yt-ready') { autoSkipRef.current = 0; return; }
            if (msg?.type === 'yt-error' && activeSlotRef.current === i && !transitioningRef.current) {
              if (autoSkipRef.current < 6) { autoSkipRef.current += 1; goToVideoRef.current('right'); }
            }
          };
          return (
            <Animated.View
              key={i}
              style={[StyleSheet.absoluteFill, { transform: [{ translateX: slotAnims[i] }], zIndex: 2 }]}
            >
              {!sv ? (
                // Idle slot — plain black placeholder. Using a View (not a
                // JS-disabled WebView) avoids react-native-webview's internal
                // bridge throwing "unable to execute JavaScript". The next video
                // still prebuffers as a real WebView via scheduleNextSlot.
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
              ) : sv.sourceType === 'instagram' && sv.videoUrl ? (
                <Video
                  source={{ uri: sv.videoUrl }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                  controls
                  paused={!isFocused || !isActive}
                  muted={!isActive}
                  playInBackground={false}
                  playWhenInactive={false}
                  repeat
                />
              ) : sv.sourceType === 'instagram' ? (
                <View style={[styles.sourceLetterbox, { top: top + 56, bottom: bottom + 88 }]}>
                  <WebView
                    ref={el => { wvRefs.current[i] = el as any; }}
                    style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}
                    source={{ uri: `https://www.instagram.com/reel/${sv.videoId}/?l=1` }}
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                    allowsFullscreenVideo={false}
                    javaScriptEnabled
                    // The live IG reel page's "open in app" uses window.open('instagram://…'),
                    // which spawns a popup WebView that launches the IG app and bounces the
                    // user out of Vidrip. Disabling multiple windows kills that popup; the
                    // https guard blocks any main-frame app-redirect too. (Keeps the ?l=1 look.)
                    setSupportMultipleWindows={false}
                    onShouldStartLoadWithRequest={req => req.url.startsWith('https://') || req.url.startsWith('about:')}
                    injectedJavaScriptBeforeContentLoaded={IG_BLOCK_LAUNCH_JS}
                    injectedJavaScript={IG_REEL_JS}
                    onLoad={onSlotLoad}
                    onLoadStart={onSlotLoadStart}
                    onMessage={e => {
                      try {
                        const m = JSON.parse(e.nativeEvent.data);
                        if (m?.type === 'playing') {
                          setIgSlotStarted(p => (p[i] ? p : (() => { const n = [...p] as [boolean, boolean, boolean]; n[i] = true; return n; })()));
                        }
                      } catch { /* ignore */ }
                    }}
                  />
                  {/* Tap-to-play hint (pointerEvents none → the tap reaches the reel,
                      which is the real touch that makes the inline video composite). */}
                  {!igSlotStarted[i] && <TapToPlayHint />}
                </View>
              ) : sv.sourceType === 'tiktok' ? (
                <View style={[styles.sourceLetterbox, { top: top + 56, bottom: bottom + 88 }]}>
                <WebView
                  ref={el => { wvRefs.current[i] = el as any; }}
                  style={StyleSheet.absoluteFill}
                  source={{ html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:#000;overflow:hidden;width:100vw;height:100vh}iframe{width:100vw;height:100vh;border:0}</style></head><body><iframe id="tt" src="${tikTokPlayerUrl(sv.videoId, { controls: true, autoplay: true })}" allow="autoplay;fullscreen;encrypted-media" allowfullscreen></iframe></body></html>`, baseUrl: 'https://www.tiktok.com' }}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  allowsFullscreenVideo={false}
                  javaScriptEnabled
                  onLoad={onSlotLoad}
                  onLoadStart={onSlotLoadStart}
                />
                </View>
              ) : (
                <WebView
                  ref={el => { wvRefs.current[i] = el as any; }}
                  style={StyleSheet.absoluteFill}
                  source={{ html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow:hidden;width:100vw;height:100vh}#p{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56.25vh;height:100vh;min-width:100vw;min-height:177.78vw}#p iframe{width:100%;height:100%;border:0}</style></head><body><div id="p"></div><script>var player,ready=false,wantPlay=false;function post(m){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(m));}}function onYouTubeIframeAPIReady(){player=new YT.Player('p',{videoId:'${sv.videoId}',playerVars:{autoplay:1,mute:1,playsinline:1,controls:1,rel:0,modestbranding:1,fs:0,origin:'https://lonelycpp.github.io'},events:{onReady:function(e){ready=true;e.target.playVideo();if(wantPlay){e.target.unMute();}post({type:'yt-ready'});},onError:function(e){post({type:'yt-error',code:e.data});}}});}window.__ytPlay=function(){wantPlay=true;if(ready&&player){player.unMute();player.playVideo();}};window.__ytPause=function(){wantPlay=false;if(ready&&player){player.mute();player.pauseVideo();}};var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.head.appendChild(s);</script></body></html>`, baseUrl: 'https://lonelycpp.github.io' }}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  allowsFullscreenVideo={false}
                  javaScriptEnabled
                  onLoad={onSlotLoad}
                  onLoadStart={onSlotLoadStart}
                  onMessage={onSlotMessage}
                />
              )}
            </Animated.View>
          );
        })}

        {/* Close — always on top */}
        {selectedVideo && (
          <TouchableOpacity style={[styles.overlayClose, { top: top + SPACE.MD, zIndex: 5 }]} onPress={closePlayer} activeOpacity={0.8}>
            <Text style={styles.overlayCloseText}>✕</Text>
          </TouchableOpacity>
        )}

        {/* Video info + action buttons — always on top */}
        {selectedVideo && (
          <View style={[styles.overlayBottom, { paddingBottom: bottom + SPACE.LG, zIndex: 5 }]}>
            <View style={styles.overlayRow}>
              <View style={styles.overlayInfo}>
                <Text style={styles.overlayTitle} numberOfLines={2}>{selectedVideo.title}</Text>
                {!!selectedVideo.channelTitle && (
                  <Text style={styles.overlayChannel}>{selectedVideo.channelTitle}</Text>
                )}
              </View>
              <View style={styles.overlayActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentsOpen(true)} activeOpacity={0.8}>
                  <GradientIcon name="chatbubbles" size={22} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={openDrawer} activeOpacity={0.8}>
                  <GradientIcon name="paper-plane" size={22} />
                </TouchableOpacity>
              </View>
            </View>
            {!!toastMsg && (
              <View style={styles.toast}><Text style={styles.toastText}>{toastMsg}</Text></View>
            )}
          </View>
        )}
      </Animated.View>

      {/* ── Video comments sheet ──────────────────────────────────────────── */}
      {selectedVideo && (
        <VideoCommentsSheet
          visible={commentsOpen}
          rootSourceId={selectedVideo.videoId}
          sourceType={selectedVideo.sourceType ?? 'youtube'}
          videoTitle={selectedVideo.title}
          refreshKey={commentsRefreshKey}
          onClose={() => setCommentsOpen(false)}
        />
      )}

      {/* ── Share drawer ───────────────────────────────────────────────────── */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeDrawer} activeOpacity={1} />
          </Animated.View>

          {/* Drawer panel */}
          <Animated.View style={[styles.drawer, { height: drawerH, transform: [{ translateY: drawerAnim }] }]}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={0}>

              {/* Handle */}
              <View style={styles.drawerHandle} />

              {/* Title row */}
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Send to…</Text>
                <TouchableOpacity onPress={closeDrawer}><Text style={styles.drawerClose}>✕</Text></TouchableOpacity>
              </View>

              {/* Filter */}
              <View style={styles.drawerSearch}>
                <TextInput
                  style={styles.drawerSearchInput}
                  value={friendFilter} onChangeText={setFriendFilter}
                  placeholder="Filter friends…" placeholderTextColor={C.SUBTLE}
                  autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing"
                />
              </View>

              {/* Friends list */}
              {friendsLoading ? (
                <View style={styles.drawerCenter}><ActivityIndicator color={C.ACCENT} /></View>
              ) : filteredFriends.length === 0 ? (
                <View style={styles.drawerCenter}>
                  <Text style={styles.drawerEmpty}>{friends.length === 0 ? 'No friends yet' : 'No matches'}</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredFriends}
                  keyExtractor={f => f.userId}
                  style={{ flex: 1 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: f }) => {
                    const sent     = sentThisSession.has(f.userId);
                    const selected = selectedFriends.has(f.userId);
                    const initial  = (f.displayName ?? f.handle).charAt(0).toUpperCase();
                    return (
                      <TouchableOpacity
                        style={[styles.friendRow, sent && styles.friendRowSent]}
                        onPress={() => toggleFriend(f.userId)}
                        activeOpacity={sent ? 1 : 0.7}>
                        <View style={styles.friendAvatar}>
                          <Text style={styles.friendAvatarText}>{initial}</Text>
                        </View>
                        <View style={styles.friendInfo}>
                          <Text style={styles.friendName}>{f.displayName ?? f.handle}</Text>
                          <Text style={styles.friendHandle}>@{f.handle}</Text>
                        </View>
                        <View style={[styles.checkbox, selected && styles.checkboxSelected, sent && styles.checkboxSent]}>
                          {(selected || sent) && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}

              {/* Record-intro row — optional personal intro that plays before the video */}
              {introClip ? (
                <View style={styles.introRowDone}>
                  <Ionicons name="checkmark-circle" size={18} color={C.ACCENT} />
                  <TouchableOpacity style={styles.introRowDoneMain} onPress={() => rootNav.navigate('RecordIntro')} activeOpacity={0.7}>
                    <Text style={styles.introRowDoneText}>Intro ready · tap to re-record</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setIntroClip(null); clearPendingIntro(); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={C.MUTED} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.introRow} onPress={() => rootNav.navigate('RecordIntro')} activeOpacity={0.7}>
                  <Ionicons name="videocam-outline" size={18} color={C.DANGER} />
                  <Text style={styles.introRowText}>Tap to record an intro before sending</Text>
                </TouchableOpacity>
              )}

              {/* Send button */}
              <View style={[styles.drawerFooter, { paddingBottom: bottom + SPACE.MD }]}>
                <TouchableOpacity
                  style={[styles.sendBtn, (selectedFriends.size === 0 || sending) && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={selectedFriends.size === 0 || sending}
                  activeOpacity={0.85}>
                  {sending
                    ? <ActivityIndicator color={C.WHITE} />
                    : <Text style={styles.sendBtnText}>
                        {selectedFriends.size > 0
                          ? `Send to ${selectedFriends.size} friend${selectedFriends.size !== 1 ? 's' : ''}`
                          : 'Select friends to send'}
                      </Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  // Compliance letterbox for IG/TikTok sources — top/bottom set inline from safe insets.
  sourceLetterbox: { position: 'absolute', left: 0, right: 0, backgroundColor: '#000', overflow: 'hidden' },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.LG, paddingTop: SPACE.LG,
  },
  headerTitle: {
    fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK, letterSpacing: -1,
    fontWeight: FONT.WEIGHTS.BOLD,
    textTransform: 'uppercase',
    marginTop: 1
  },
  searchToggle: { padding: SPACE.XS, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },

  // mode toggle
  toggle: {
    flexDirection: 'row', marginHorizontal: SPACE.LG, marginTop: SPACE.MD, marginBottom: SPACE.MD,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, padding: 3, gap: 3,
  },
  toggleBtn:       { flex: 1, paddingVertical: SPACE.SM, alignItems: 'center', borderRadius: RADIUS.SM },
  toggleBtnActive: { backgroundColor: C.ACCENT },
  toggleTxt:       { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtActive: { color: C.WHITE },

  // paste
  pasteScroll:    { flex: 1 },
  pasteContainer: { padding: SPACE.LG, gap: SPACE.MD, marginTop: SPACE.LG },
  pasteLabel:     { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, textTransform: 'uppercase', letterSpacing: 1, marginTop: SPACE.LG },
  pasteInput:     { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, padding: SPACE.LG, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY },
  pasteBtn:         { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center' },
  pasteBtnDisabled: { opacity: 0.4 },
  pasteBtnText:     { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  tooLongBox:   { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.ACCENT_HOT, padding: SPACE.LG, gap: SPACE.XS },
  tooLongTitle: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD, textAlign: 'center' },
  tooLongText:  { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, textAlign: 'center' },

  // search / tabs
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACE.LG, marginBottom: SPACE.SM,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD,
    borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: SPACE.MD,
  },
  searchInput:   { flex: 1, paddingVertical: SPACE.MD, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY },
  searchSpinner: { marginLeft: SPACE.SM },
  gridSpinner: { marginTop: SPACE.XL },
  // zIndex/elevation keeps the pills painted ABOVE the grid, so a short (sparse) grid
  // can't cover their bottom when the search row pushes them down.
  tabsScroll: { height: 55, marginBottom: 0, zIndex: 2, elevation: 2 },
  tabs:    { paddingHorizontal: SPACE.LG, gap: SPACE.SM, alignItems: 'center', height: 33 },
  tab:     { alignItems: 'center', justifyContent: 'center', height: 33, paddingHorizontal: SPACE.MD, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER },
  tabActive:    { borderWidth: 1, borderColor: C.DANGER },
  tabTxt:       { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  tabTxtActive: { color: C.DANGER },

  // For You refresh bar
  feedBar: {
    height: FEED_BAR_HEIGHT,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: SPACE.LG,
  },
  feedBarText: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  feedRefreshBtn: {
    backgroundColor: C.ACCENT_LITE, borderRadius: RADIUS.SM, borderWidth: 1, borderColor: C.ACCENT,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM, minWidth: 96, alignItems: 'center',
  },
  feedRefreshBtnDisabled: { opacity: 0.45 },
  feedRefreshText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD },
  feedRefreshSpinner: { transform: [{ scale: 0.7 }] },   // match text height so the button doesn't grow

  // grid
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACE.XXXL },
  fill:          { flex: 1 },
  gridCenter:    { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  gridTop:       { alignItems: 'center', paddingTop: SPACE.LG, paddingHorizontal: SPACE.LG },
  emptyTextCenter: { textAlign: 'center', paddingHorizontal: SPACE.XL, height: '100%' },
  emptyContainer: { display: 'flex', height: '60%', alignItems: 'center', justifyContent: 'center' },
  emptyTextTop:  { textAlign: 'center', paddingHorizontal: SPACE.XL },
  grid:          { paddingHorizontal: SPACE.LG, paddingBottom: SPACE.XXXL },
  row:           { gap: SPACE.MD, marginBottom: SPACE.MD },
  card:          { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, overflow: 'hidden' },
  cardThumb:     { width: '100%' },
  badge:         { position: 'absolute', top: SPACE.XS, right: SPACE.XS, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: RADIUS.SM, paddingHorizontal: SPACE.XS + 2, paddingVertical: 2 },
  badgeText:     { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM },
  cardInfo:      { padding: SPACE.SM, gap: 2 },
  cardTitle:     { fontSize: FONT.SIZES.SM, color: C.INK, fontFamily: FONT.BODY_MEDIUM },
  cardChannel:   { fontSize: FONT.SIZES.XS, color: C.MUTED, fontFamily: FONT.BODY },
  emptyText:     { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },

  // player overlay
  playerClip:    { overflow: 'hidden' },
  playerWebView: { backgroundColor: '#000', flex: 1 },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 10,
  },
  overlayClose: {
    position: 'absolute', left: SPACE.LG,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 11,
  },
  overlayCloseText: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD },
  overlayBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: SPACE.LG, gap: SPACE.SM,
    zIndex: 11,
  },
  incomingDim:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  overlayRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.MD },
  overlayInfo:    { flex: 1, gap: 2 },
  overlayTitle:   { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  overlayChannel: { color: 'rgba(255,255,255,0.7)', fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  overlayActions: { flexDirection: 'row', gap: SPACE.SM, paddingBottom: 2 },
  actionBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.SURFACE_2,
    borderWidth: 1, borderColor: C.BORDER_STRONG,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },
  toast: { backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: RADIUS.MD, paddingVertical: SPACE.SM, paddingHorizontal: SPACE.LG, alignSelf: 'center' },
  toastText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },

  // share drawer
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 20 },
  drawer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.BG_SOLID,
    borderTopLeftRadius: RADIUS.XL ?? 24,
    borderTopRightRadius: RADIUS.XL ?? 24,
    zIndex: 21,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12,
    elevation: 24,
  },
  drawerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.BORDER, alignSelf: 'center', marginTop: SPACE.SM, marginBottom: SPACE.XS },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD },
  drawerTitle:  { fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, color: C.INK },
  drawerClose:  { fontSize: 18, color: C.MUTED, paddingHorizontal: SPACE.SM },
  drawerSearch: { marginHorizontal: SPACE.LG, marginBottom: SPACE.SM, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: SPACE.MD },
  drawerSearchInput: { paddingVertical: SPACE.MD, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY },
  drawerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  drawerEmpty:  { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },

  // record-intro row
  introRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginHorizontal: SPACE.LG, marginBottom: SPACE.SM, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.MD, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.DANGER },
  introRowText: { color: C.DANGER, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD },
  introRowDone: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginHorizontal: SPACE.LG, marginBottom: SPACE.SM, paddingVertical: SPACE.SM, paddingHorizontal: SPACE.MD, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER },
  introRowDoneMain: { flex: 1 },
  introRowDoneText: { color: C.INK, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },

  // friend rows
  friendRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, gap: SPACE.MD },
  friendRowSent: { opacity: 0.5 },
  friendAvatar:  { width: 44, height: 44, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_LITE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.ACCENT },
  friendAvatarText: { color: C.ACCENT, fontSize: FONT.SIZES.LG, fontWeight: '700' },
  friendInfo:   { flex: 1 },
  friendName:   { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  friendHandle: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY },
  checkbox: {
    width: 24, height: 24, borderRadius: RADIUS.FULL,
    borderWidth: 2, borderColor: C.ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  checkboxSent:     { backgroundColor: C.MUTED,  borderColor: C.MUTED },
  checkmark:        { color: C.WHITE, fontSize: 12, fontFamily: FONT.BODY_BOLD },

  // send button
  drawerFooter: { paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD },
  sendBtn:         { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, paddingVertical: SPACE.LG, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  accountButton:  { marginTop: 2 }
});
