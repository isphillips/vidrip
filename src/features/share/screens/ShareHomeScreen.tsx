import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet,
  TouchableOpacity, Image, ActivityIndicator, Alert,
  ScrollView, useWindowDimensions,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  fetchShorts, searchShorts,
  CATEGORIES, type ShortRow, type Category,
} from '../../../infrastructure/supabase/queries/shorts';
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

function DurationBadge({ seconds }: { seconds: number }) {
  const s = seconds % 60;
  const m = Math.floor(seconds / 60);
  const label = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

type Mode = 'browse' | 'paste';
const PAGE = 50;

export default function ShareHomeScreen({ navigation }: ShareStackScreenProps<'ShareHome'>) {
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('browse');
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [url, setUrl] = useState('');
  const [pasting, setPasting] = useState(false);

  const loadCategory = useCallback(async (cat: Category, reset = true) => {
    if (reset) {
      setLoading(true);
      offsetRef.current = 0;
      hasMoreRef.current = true;
    }
    try {
      const data = await fetchShorts(cat, PAGE, reset ? 0 : offsetRef.current);
      if (reset) {
        setResults(data);
      } else {
        setResults(prev => [...prev, ...data]);
      }
      offsetRef.current += data.length;
      hasMoreRef.current = data.length === PAGE;
    } catch (e) {
      console.error('[ShareHome] fetch error:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'browse') { return; }
    clearTimeout(searchTimer.current);
    if (!query.trim()) {
      loadCategory(category);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchShorts(query.trim());
        setResults(data);
      } catch { /* keep existing */ }
      setSearching(false);
    }, 500);
    return () => clearTimeout(searchTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, mode]);

  const handleCategoryChange = useCallback((cat: Category) => {
    setCategory(cat);
    setQuery('');
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingMore || query.trim()) { return; }
    setLoadingMore(true);
    loadCategory(category, false);
  }, [loadingMore, query, category, loadCategory]);

  const handleSelect = useCallback((item: ShortRow) => {
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
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (res.ok) {
        const d = await res.json();
        title = d.title ?? title;
        thumbnail = d.thumbnail_url ?? thumbnail;
      }
    } catch { /* use defaults */ }
    setPasting(false);
    navigation.navigate('SelectRecipients', { videoId, videoTitle: title, videoThumbnail: thumbnail });
  };

  const cardW = (width - SPACE.LG * 2 - SPACE.MD) / 2;
  const cardH = Math.round(cardW * (16 / 9));  // vertical 9:16 aspect

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { marginTop: top }]}>Share</Text>

      {/* Mode toggle */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'browse' && styles.toggleBtnActive]}
          onPress={() => setMode('browse')}>
          <Text style={[styles.toggleTxt, mode === 'browse' && styles.toggleTxtActive]}>Browse</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'paste' && styles.toggleBtnActive]}
          onPress={() => setMode('paste')}>
          <Text style={[styles.toggleTxt, mode === 'paste' && styles.toggleTxtActive]}>Paste Link</Text>
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
          {/* Search */}
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
            {searching && <ActivityIndicator size="small" color={C.ACCENT} style={styles.searchSpinner} />}
          </View>

          {/* Category tabs */}
          {!query.trim() && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.tab, category === cat && styles.tabActive]}
                  onPress={() => handleCategoryChange(cat)}>
                  <Text style={[styles.tabTxt, category === cat && styles.tabTxtActive]}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {loading ? (
            <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={item => item.videoId}
              numColumns={2}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={styles.row}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.4}
              ListFooterComponent={loadingMore
                ? <ActivityIndicator color={C.ACCENT} style={styles.footerSpinner} />
                : null}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyText}>No Shorts yet — check back soon</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.card, { width: cardW }]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.8}>
                  <Image
                    source={{ uri: item.thumbnail }}
                    style={[styles.cardThumb, { height: cardH }]}
                    resizeMode="cover"
                  />
                  <DurationBadge seconds={item.duration} />
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
    fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK, letterSpacing: -1, padding: SPACE.LG, paddingBottom: 0,
  },
  toggle: {
    flexDirection: 'row', margin: SPACE.LG,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, padding: 3, gap: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: SPACE.SM, alignItems: 'center', borderRadius: RADIUS.SM },
  toggleBtnActive: { backgroundColor: C.ACCENT },
  toggleTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtActive: { color: C.WHITE },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACE.LG, marginBottom: SPACE.SM,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD,
    borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: SPACE.MD,
  },
  searchInput: { flex: 1, paddingVertical: SPACE.MD, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY },
  searchSpinner: { marginLeft: SPACE.SM },
  tabs: { paddingHorizontal: SPACE.LG, gap: SPACE.SM, paddingBottom: SPACE.SM },
  tab: {
    paddingHorizontal: SPACE.LG, display: 'flex', justifyContent: 'center', height: 38,
    borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE, marginBottom: SPACE.SM,
    borderWidth: 1, borderColor: C.BORDER,
  },
  tabActive: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  tabTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  tabTxtActive: { color: C.WHITE },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACE.XXXL },
  grid: { paddingHorizontal: SPACE.LG, paddingBottom: SPACE.XXXL, paddingTop: SPACE.SM },
  row: { gap: SPACE.MD, marginBottom: SPACE.MD },
  card: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, overflow: 'hidden' },
  cardThumb: { width: '100%' },
  badge: {
    position: 'absolute', top: SPACE.XS, right: SPACE.XS,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.XS + 2, paddingVertical: 2,
  },
  badgeText: { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM },
  cardInfo: { padding: SPACE.SM, gap: 2 },
  cardTitle: { fontSize: FONT.SIZES.SM, color: C.INK, fontFamily: FONT.BODY_MEDIUM },
  cardChannel: { fontSize: FONT.SIZES.XS, color: C.MUTED, fontFamily: FONT.BODY },
  emptyText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  footerSpinner: { paddingVertical: SPACE.XL },
  pasteContainer: { padding: SPACE.LG, gap: SPACE.MD },
  pasteLabel: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, textTransform: 'uppercase', letterSpacing: 1 },
  pasteInput: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.LG, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY,
  },
  pasteBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center' },
  pasteBtnDisabled: { opacity: 0.4 },
  pasteBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
});
