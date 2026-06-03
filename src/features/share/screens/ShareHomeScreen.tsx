import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  fetchTrendingShorts,
  searchShorts,
  type ShortItem,
} from '../../../infrastructure/youtube/api';
import type { ShareStackScreenProps } from '../../../app/navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

type Mode = 'browse' | 'paste';

export default function ShareHomeScreen({ navigation }: ShareStackScreenProps<'ShareHome'>) {
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('browse');

  // Browse state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextPageToken = useRef<string | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Paste state
  const [url, setUrl] = useState('');
  const [pasting, setPasting] = useState(false);

  // Load trending on mount
  useEffect(() => {
    fetchTrendingShorts().then((res) => {
      setResults(res.items);
      nextPageToken.current = res.nextPageToken;
    }).catch(() => setResults([])).finally(() => setLoading(false));
  }, []);

  // Debounced search
  useEffect(() => {
    if (mode !== 'browse') { return; }
    clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setLoading(true);
      fetchTrendingShorts().then((res) => {
        setResults(res.items);
        nextPageToken.current = res.nextPageToken;
      }).catch(() => setResults([])).finally(() => setLoading(false));
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchShorts(query.trim()).catch(() => ({ items: [], nextPageToken: undefined }));
      setResults(res.items);
      nextPageToken.current = res.nextPageToken;
      setSearching(false);
    }, 600);
    return () => clearTimeout(searchTimer.current);
  }, [query, mode]);

  const handleLoadMore = useCallback(async () => {
    if (!nextPageToken.current || loadingMore) { return; }
    setLoadingMore(true);
    try {
      const res = query.trim()
        ? await searchShorts(query.trim(), 20, nextPageToken.current)
        : await fetchTrendingShorts(20, nextPageToken.current);
      setResults((prev) => [...prev, ...res.items]);
      nextPageToken.current = res.nextPageToken;
    } catch { /* keep existing results */ }
    setLoadingMore(false);
  }, [query, loadingMore]);

  const handleSelectShort = useCallback((item: ShortItem) => {
    navigation.navigate('VideoPreview', {
      videoId: item.videoId,
      videoTitle: item.title,
      videoThumbnail: item.thumbnail,
      channelTitle: item.channelTitle,
    });
  }, [navigation]);

  const handlePasteNext = async () => {
    const videoId = extractYouTubeId(url.trim());
    if (!videoId) {
      Alert.alert('Invalid Link', 'Paste a YouTube Shorts link to continue.');
      return;
    }
    setPasting(true);
    let title = 'YouTube Short';
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );
      if (res.ok) {
        const data = await res.json();
        title = data.title ?? title;
        thumbnail = data.thumbnail_url ?? thumbnail;
      }
    } catch { /* use defaults */ }
    setPasting(false);
    navigation.navigate('SelectRecipients', { videoId, videoTitle: title, videoThumbnail: thumbnail });
  };

  const cardWidth = (width - SPACE.LG * 2 - SPACE.MD) / 2;
  const cardThumbH = Math.round(cardWidth / (16 / 9));

  return (
    <View style={styles.container}>
      {/* Mode toggle */}
      <Text style={[styles.header, { marginTop: top }]}>Share</Text>
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'browse' && styles.toggleBtnActive]}
          onPress={() => setMode('browse')}>
          <Text style={[styles.toggleTxt, mode === 'browse' && styles.toggleTxtActive]}>
            Browse
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'paste' && styles.toggleBtnActive]}
          onPress={() => setMode('paste')}>
          <Text style={[styles.toggleTxt, mode === 'paste' && styles.toggleTxtActive]}>
            Paste Link
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'paste' ? (
        <View style={styles.pasteContainer}>
          <Text style={styles.pasteLabel}>YouTube Shorts URL</Text>
          <TextInput
            style={styles.pasteInput}
            value={url}
            onChangeText={setUrl}
            placeholder="https://youtube.com/shorts/..."
            placeholderTextColor={C.SUBTLE}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus
          />
          <TouchableOpacity
            style={[styles.pasteBtn, (!url.trim() || pasting) && styles.pasteBtnDisabled]}
            onPress={handlePasteNext}
            disabled={!url.trim() || pasting}>
            {pasting
              ? <ActivityIndicator color={C.WHITE} />
              : <Text style={styles.pasteBtnText}>Choose Friends →</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Search bar */}
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search Shorts…"
              placeholderTextColor={C.SUBTLE}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searching && (
              <ActivityIndicator size="small" color={C.ACCENT} style={styles.searchSpinner} />
            )}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={C.ACCENT} />
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.videoId}
              numColumns={2}
              contentContainerStyle={styles.grid}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.4}
              ListFooterComponent={loadingMore ? <ActivityIndicator color={C.ACCENT} style={styles.footerSpinner} /> : null}
              columnWrapperStyle={styles.row}
              ListHeaderComponent={
                !query.trim()
                  ? <Text style={styles.sectionLabel}>Trending Shorts</Text>
                  : null
              }
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyText}>No results found</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.card, { width: cardWidth }]}
                  onPress={() => handleSelectShort(item)}
                  activeOpacity={0.8}>
                  <Image
                    source={{ uri: item.thumbnail }}
                    style={[styles.cardThumb, { height: cardThumbH }]}
                    resizeMode="cover"
                  />
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.cardChannel} numberOfLines={1}>{item.channelTitle}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
    letterSpacing: -1,
    padding: SPACE.LG,
    paddingBottom: 0,
    marginTop: 0,
  },
  toggle: {
    flexDirection: 'row',
    margin: SPACE.LG,
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: SPACE.SM,
    alignItems: 'center',
    borderRadius: RADIUS.SM,
  },
  toggleBtnActive: { backgroundColor: C.ACCENT },
  toggleTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtActive: { color: C.WHITE },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.MD,
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    paddingHorizontal: SPACE.MD,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACE.MD,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
    fontFamily: FONT.BODY,
  },
  searchSpinner: { marginLeft: SPACE.SM },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACE.XXXL },
  sectionLabel: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_SEMIBOLD,
    color: C.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACE.MD,
  },
  grid: { paddingHorizontal: SPACE.LG, paddingBottom: SPACE.XXXL },
  row: { gap: SPACE.MD, marginBottom: SPACE.MD },
  card: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, overflow: 'hidden' },
  cardThumb: { width: '100%' },
  cardInfo: { padding: SPACE.SM, gap: 2 },
  cardTitle: { fontSize: FONT.SIZES.SM, color: C.INK, fontFamily: FONT.BODY_MEDIUM },
  cardChannel: { fontSize: FONT.SIZES.XS, color: C.MUTED, fontFamily: FONT.BODY },
  emptyText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  footerSpinner: { paddingVertical: SPACE.XL },
  pasteContainer: { padding: SPACE.LG, gap: SPACE.MD },
  pasteLabel: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD,
    textTransform: 'uppercase', letterSpacing: 1 },
  pasteInput: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    padding: SPACE.LG,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
    fontFamily: FONT.BODY,
  },
  pasteBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  pasteBtnDisabled: { opacity: 0.4 },
  pasteBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG,
    fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
});
