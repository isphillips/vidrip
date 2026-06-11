import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet,
  TouchableOpacity, Image, ActivityIndicator, Alert, RefreshControl,
  ScrollView, useWindowDimensions, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  fetchShorts, searchShorts, CATEGORIES, type ShortRow, type Category,
} from '../../../infrastructure/supabase/queries/shorts';
import { fetchFriends, type Friend } from '../../../infrastructure/supabase/queries/friends';
import { sendThread } from '../../../infrastructure/supabase/queries/threads';
import { extractTikTokId, fetchTikTokMeta, tikTokPlayerUrl } from '../../../infrastructure/tiktok/api';
import { fetchYouTubeDurationSeconds, MAX_VIDEO_SECONDS } from '../../../infrastructure/youtube/api';
import { useShareIntentStore } from '../../../store/shareIntentStore';
import { shareTextNative, sourceVideoUrl } from '../../../infrastructure/share/nativeShare';
import { fetchMembersOnlyVideos } from '../../../infrastructure/supabase/queries/channels';
import {
  fetchConnectedFeed, refreshConnectedFeed, feedCooldownRemainingMs,
} from '../../../infrastructure/supabase/queries/connectedFeed';
import { fetchSyncedAccounts } from '../../../infrastructure/supabase/queries/syncedAccounts';
import { useAuthStore } from '../../../store/authStore';
import type { ShareStackScreenProps } from '../../../app/navigation/types';

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
type VideoItem = { videoId: string; title: string; thumbnail: string; channelTitle: string; sourceType?: 'youtube' | 'tiktok'; createdAt?: string };
type Mode = 'browse' | 'paste';
const PAGE = 50;
const DRAWER_HEIGHT_PCT = 0.68;

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ShareHomeScreen({ navigation: _nav }: ShareStackScreenProps<'ShareHome'>) {
  const { top, bottom } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { user } = useAuthStore();

  // browse state
  const [mode, setMode]         = useState<Mode>('browse');
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<ShortRow[]>([]);
  const [memberVideos, setMemberVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching]    = useState(false);
  // For You (personal connected feed)
  const [showForYou, setShowForYou]  = useState(false);
  const [feedItems, setFeedItems]    = useState<VideoItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [hasFeedConnection, setHasFeedConnection] = useState(false);
  const [feedLastSyncedAt, setFeedLastSyncedAt] = useState<string | null>(null);
  const offsetRef  = useRef(0);
  const hasMoreRef = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

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

  const drawerH = Math.round(height * DRAWER_HEIGHT_PCT);
  const cardW   = (width - SPACE.LG * 2 - SPACE.MD) / 2;
  const cardH   = Math.round(cardW * (16 / 9));

  // ── Browse data ─────────────────────────────────────────────────────────────
  const loadCategory = useCallback(async (cat: Category, reset = true, silent = false) => {
    if (reset) { if (!silent) { setLoading(true); } offsetRef.current = 0; hasMoreRef.current = true; }
    try {
      const data = await fetchShorts(cat, PAGE, reset ? 0 : offsetRef.current);
      setResults(prev => reset ? data : [...prev, ...data]);
      offsetRef.current += data.length;
      hasMoreRef.current = data.length === PAGE;
    } catch (e) { console.error('[ShareHome]', e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

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
    } catch (e) { console.error('[ShareHome] forYou', e); }
    finally { setFeedLoading(false); }
  }, [user?.id]);

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

  // Members Only videos from channels the user has JOINED — refetch on focus so
  // joining/leaving a channel elsewhere is reflected here.
  useFocusEffect(useCallback(() => {
    if (!user?.id) { setMemberVideos([]); return; }
    fetchMembersOnlyVideos(user.id).then(setMemberVideos).catch(() => {});
  }, [user?.id]));

  // Grid = Members Only videos interleaved into the YouTube shorts feed by recency
  // (newest first), rather than pinned to the top. Search results stay as-is.
  const gridData = useMemo(() => {
    if (showForYou) { return feedItems; }
    type GridItem = VideoItem & { duration?: number; fetchedAt?: string };
    const shorts = results.map(r => ({ ...r })) as GridItem[];
    if (query.trim()) { return shorts; }
    const sortTs = (it: GridItem) => it.fetchedAt ?? it.createdAt ?? '';
    return [...memberVideos, ...shorts].sort((a, b) => sortTs(b).localeCompare(sortTs(a)));
  }, [showForYou, feedItems, results, memberVideos, query]);

  useEffect(() => {
    if (mode !== 'browse') { return; }
    if (showForYou) { loadForYou(); return; }
    clearTimeout(searchTimer.current);
    if (!query.trim()) { loadCategory(category); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchShorts(query.trim())); } catch { /* keep */ }
      setSearching(false);
    }, 500);
    return () => clearTimeout(searchTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, mode, showForYou]);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingMore || query.trim()) { return; }
    setLoadingMore(true);
    loadCategory(category, false);
  }, [loadingMore, query, category, loadCategory]);

  // ── Player open/close ───────────────────────────────────────────────────────
  const openPlayer = (video: VideoItem) => {
    setSelectedVideo(video);
    setSentThisSession(new Set());
    setSelectedFriends(new Set());
    Animated.spring(playerAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
  };

  const closePlayer = () => {
    closeDrawer();
    Animated.timing(playerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setSelectedVideo(null);
    });
  };

  // ── Drawer open/close ───────────────────────────────────────────────────────
  const openDrawer = async () => {
    setDrawerOpen(true);
    setFriendFilter('');
    setSelectedFriends(new Set());
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
      await sendThread(
        user.id,
        selectedVideo.videoId,
        selectedVideo.title,
        selectedVideo.thumbnail,
        [...selectedFriends],
        selectedVideo.sourceType ?? 'youtube',
      );
      setSentThisSession(prev => new Set([...prev, ...selectedFriends]));
      setSelectedFriends(new Set());
      closeDrawer();
      setToastMsg(`Sent to ${selectedFriends.size} friend${selectedFriends.size !== 1 ? 's' : ''}!`);
      setTimeout(() => setToastMsg(''), 2500);
    } catch {
      Alert.alert('Error', 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  // ── Inbound OS share ("Share to Vidrip") → prefill the paste field ───────────
  const pendingShareUrl = useShareIntentStore(s => s.pendingUrl);
  const clearPendingShareUrl = useShareIntentStore(s => s.setPendingUrl);
  useEffect(() => {
    if (!pendingShareUrl) { return; }
    setMode('paste');
    setUrl(pendingShareUrl);
    clearPendingShareUrl(null);
  }, [pendingShareUrl, clearPendingShareUrl]);

  // ── Reactive link validation (runs as the user pastes/types) ─────────────────
  useEffect(() => {
    if (mode !== 'paste') { return; }
    const trimmed = url.trim();
    if (!trimmed) { setLinkStatus('idle'); return; }
    // TikTok: can't fetch duration from the public API → allow through.
    if (extractTikTokId(trimmed)) { setLinkStatus('ok'); return; }
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
  const handlePastePreview = async () => {
    // TikTok first — if it parses as a TikTok URL, treat as TikTok.
    const ttId = extractTikTokId(url.trim());
    if (ttId) {
      setPasting(true);
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

    const videoId = extractYouTubeId(url.trim());
    if (!videoId) { Alert.alert('Invalid Link', 'Paste a YouTube Shorts or TikTok link to continue.'); return; }
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

  const feedCooldownMs  = feedCooldownRemainingMs(feedLastSyncedAt);
  const feedCooldownMin = Math.ceil(feedCooldownMs / 60000);

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { marginTop: top }]}>Share</Text>

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
        <View style={styles.pasteContainer}>
          <Text style={styles.pasteLabel}>YouTube or TikTok URL</Text>
          <TextInput
            style={styles.pasteInput} value={url} onChangeText={setUrl}
            placeholder="Paste a YouTube Shorts or TikTok link" placeholderTextColor={C.SUBTLE}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus
          />
          {linkStatus === 'tooLong' ? (
            <View style={styles.tooLongBox}>
              <Text style={styles.tooLongTitle}>Video too long</Text>
              <Text style={styles.tooLongText}>
                We only allow videos up to 3 minutes (180 seconds). Please find a shorter video to share.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.pasteBtn, (linkStatus !== 'ok' || pasting) && styles.pasteBtnDisabled]}
              onPress={handlePastePreview} disabled={linkStatus !== 'ok' || pasting}>
              {(pasting || linkStatus === 'checking')
                ? <ActivityIndicator color={C.WHITE} />
                : <Text style={styles.pasteBtnText}>Preview & Share →</Text>}
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          {!showForYou && (
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput} value={query} onChangeText={setQuery}
                placeholder="Search Shorts…" placeholderTextColor={C.SUBTLE}
                autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing"
              />
              {searching && <ActivityIndicator size="small" color={C.ACCENT} style={styles.searchSpinner} />}
            </View>
          )}

          {!query.trim() && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              <TouchableOpacity key="foryou" style={[styles.tab, showForYou && styles.tabActive]}
                onPress={() => { setShowForYou(true); setQuery(''); }}>
                <Text style={[styles.tabTxt, showForYou && styles.tabTxtActive]}>For You</Text>
              </TouchableOpacity>
              {CATEGORIES.map(cat => {
                const active = !showForYou && category === cat;
                return (
                  <TouchableOpacity key={cat} style={[styles.tab, active && styles.tabActive]}
                    onPress={() => { setShowForYou(false); setCategory(cat); setQuery(''); }}>
                    <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {showForYou && hasFeedConnection && (
            <View style={styles.feedBar}>
              <Text style={styles.feedBarText}>Liked videos</Text>
              <TouchableOpacity
                style={[styles.feedRefreshBtn, (feedCooldownMs > 0 || feedRefreshing) && styles.feedRefreshBtnDisabled]}
                onPress={handleRefreshFeed}
                disabled={feedCooldownMs > 0 || feedRefreshing}>
                {feedRefreshing
                  ? <ActivityIndicator size="small" color={C.WHITE} />
                  : <Text style={styles.feedRefreshText}>{feedCooldownMs > 0 ? `Refresh in ${feedCooldownMin}m` : 'Refresh'}</Text>}
              </TouchableOpacity>
            </View>
          )}
          <View style={{ height: SPACE.SM }} />

          {(() => {
            const gridLoading = showForYou ? feedLoading : loading;
            const data: typeof gridData = gridLoading ? [] : gridData;
            const isEmpty = data.length === 0;
            return (
              <FlatList
                style={isEmpty ? styles.fill : undefined}
                data={data}
                keyExtractor={item => item.videoId}
                numColumns={2}
                contentContainerStyle={isEmpty ? styles.gridCenter : styles.grid}
                columnWrapperStyle={styles.row}
                refreshControl={showForYou ? undefined : (
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.ACCENT} />
                )}
                onEndReached={(showForYou || isEmpty) ? undefined : handleLoadMore}
                onEndReachedThreshold={0.4}
                ListFooterComponent={!showForYou && loadingMore ? <ActivityIndicator color={C.ACCENT} style={{ paddingVertical: SPACE.XL }} /> : null}
                ListEmptyComponent={
                  gridLoading ? (
                    <ActivityIndicator color={C.ACCENT} style={styles.gridSpinner} />
                  ) : (
                    <Text style={[styles.emptyText, styles.emptyTextCenter]}>
                      {showForYou
                        ? (hasFeedConnection
                            ? 'No videos yet — tap Refresh to pull your liked videos.'
                            : 'Connect a YouTube account in your profile to see your For You feed.')
                        : 'No Shorts yet'}
                    </Text>
                  )
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={[styles.card, { width: cardW }]} onPress={() => openPlayer(item)} activeOpacity={0.8}>
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
      {selectedVideo && (
        <Animated.View style={[styles.playerOverlay, { opacity: playerOpacity, transform: [{ scale: playerScale }] }]}>
          <WebView
            style={StyleSheet.absoluteFill}
            source={selectedVideo.sourceType === 'tiktok'
              ? { html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:#000;overflow:hidden;width:100vw;height:100vh}iframe{width:100vw;height:100vh;border:0}</style></head><body><iframe id="tt" src="${tikTokPlayerUrl(selectedVideo.videoId, { controls: true, autoplay: true })}" allow="autoplay;fullscreen;encrypted-media" allowfullscreen></iframe><script>(function(){var f=document.getElementById('tt');function cmd(t){f.contentWindow.postMessage({'x-tiktok-player':true,type:t},'*');}window.addEventListener('message',function(e){var d=e.data;if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return;}}if(d&&d.type==='onPlayerReady'){cmd('unMute');cmd('play');}});document.addEventListener('click',function(){cmd('unMute');cmd('play');});document.addEventListener('touchstart',function(){cmd('unMute');cmd('play');});})();</script></body></html>`, baseUrl: 'https://www.tiktok.com' }
              : { html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow:hidden;width:100vw;height:100vh}iframe{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56.25vh;height:100vh;min-width:100vw;min-height:177.78vw}</style></head><body><iframe src="https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1&origin=https://youtube.com" frameborder="0" allow="autoplay;fullscreen" allowfullscreen></iframe></body></html>`, baseUrl: 'https://youtube.com' }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo={false}
            javaScriptEnabled
          />

          {/* Close */}
          <TouchableOpacity style={[styles.overlayClose, { top: top + SPACE.MD }]} onPress={closePlayer} activeOpacity={0.8}>
            <Text style={styles.overlayCloseText}>✕</Text>
          </TouchableOpacity>

          {/* Video info + Share button */}
          <View style={[styles.overlayBottom, { paddingBottom: bottom + SPACE.LG }]}>
            <View style={styles.overlayInfo}>
              <Text style={styles.overlayTitle} numberOfLines={2}>{selectedVideo.title}</Text>
              {!!selectedVideo.channelTitle && (
                <Text style={styles.overlayChannel}>{selectedVideo.channelTitle}</Text>
              )}
            </View>
            <View style={styles.shareRow}>
              <TouchableOpacity style={[styles.shareBtn, styles.shareBtnFlex]} onPress={openDrawer} activeOpacity={0.85}>
                <Text style={styles.shareBtnText}>Share with Friend</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nativeShareBtn}
                activeOpacity={0.85}
                onPress={() => selectedVideo && shareTextNative(
                  selectedVideo.title || 'Check out this video',
                  sourceVideoUrl(selectedVideo.videoId, selectedVideo.sourceType ?? 'youtube'),
                )}>
                <Text style={styles.nativeShareIcon}>↗</Text>
              </TouchableOpacity>
            </View>
            {!!toastMsg && (
              <View style={styles.toast}><Text style={styles.toastText}>{toastMsg}</Text></View>
            )}
          </View>
        </Animated.View>
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

  header: {
    fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK, letterSpacing: -1, padding: SPACE.LG, paddingBottom: 0,
  },

  // mode toggle
  toggle: {
    flexDirection: 'row', margin: SPACE.LG,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, padding: 3, gap: 3,
  },
  toggleBtn:       { flex: 1, paddingVertical: SPACE.SM, alignItems: 'center', borderRadius: RADIUS.SM },
  toggleBtnActive: { backgroundColor: C.ACCENT },
  toggleTxt:       { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtActive: { color: C.WHITE },

  // paste
  pasteContainer: { padding: SPACE.LG, gap: SPACE.MD },
  pasteLabel:     { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, textTransform: 'uppercase', letterSpacing: 1 },
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
  gridSpinner: { position: 'absolute', top: '50%' },
  tabs:    { paddingHorizontal: SPACE.LG, gap: SPACE.SM, paddingBottom: SPACE.LG },
  tab:     { paddingHorizontal: SPACE.LG, justifyContent: 'center', height: 36, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER },
  tabActive:    { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  tabTxt:       { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  tabTxtActive: { color: C.WHITE },

  // For You refresh bar
  feedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: SPACE.LG, marginTop: SPACE.SM,
  },
  feedBarText: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  feedRefreshBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM, minWidth: 96, alignItems: 'center',
  },
  feedRefreshBtnDisabled: { opacity: 0.45 },
  feedRefreshText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD },

  // grid
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACE.XXXL },
  fill:          { flex: 1 },
  gridCenter:    { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTextCenter: { textAlign: 'center', paddingHorizontal: SPACE.XL, height: '100%' },
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
  overlayInfo:    { gap: 2 },
  overlayTitle:   { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  overlayChannel: { color: 'rgba(255,255,255,0.7)', fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  shareRow:     { flexDirection: 'row', gap: SPACE.SM, alignItems: 'stretch' },
  shareBtn:     { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, paddingVertical: SPACE.LG, alignItems: 'center', justifyContent: 'center' },
  shareBtnFlex: { flex: 1 },
  shareBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  nativeShareBtn:  { width: 56, borderRadius: RADIUS.MD, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  nativeShareIcon: { color: C.WHITE, fontSize: 24, fontFamily: FONT.BODY_BOLD },
  toast: { backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: RADIUS.MD, paddingVertical: SPACE.SM, paddingHorizontal: SPACE.LG, alignSelf: 'center' },
  toastText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },

  // share drawer
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 20 },
  drawer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.BG,
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
  drawerSearchInput: { paddingVertical: SPACE.SM, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY },
  drawerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  drawerEmpty:  { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },

  // friend rows
  friendRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, gap: SPACE.MD },
  friendRowSent: { opacity: 0.5 },
  friendAvatar:  { width: 44, height: 44, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_LITE, alignItems: 'center', justifyContent: 'center' },
  friendAvatarText: { color: C.ACCENT, fontSize: FONT.SIZES.LG, fontWeight: '700' },
  friendInfo:   { flex: 1 },
  friendName:   { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  friendHandle: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY },
  checkbox: {
    width: 24, height: 24, borderRadius: RADIUS.FULL,
    borderWidth: 2, borderColor: C.BORDER,
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
});
