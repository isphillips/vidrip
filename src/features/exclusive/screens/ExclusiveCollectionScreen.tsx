import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { resolveTikTokThumbnail } from '../../../infrastructure/tiktok/api';
import ViewBadge from '../../../components/ViewBadge';
import {
  fetchAwardedCollection, fetchExclusiveCollectionVideos, type ExclusiveCollection, type ExclusiveVideo,
} from '../../../infrastructure/exclusive/api';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

export default function ExclusiveCollectionScreen({ route, navigation }: FeedStackScreenProps<'ExclusiveCollection'>) {
  const { collectionId } = route.params;
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuthStore();
  const [collection, setCollection] = useState<(ExclusiveCollection & { channelName: string }) | null>(null);
  const [videos, setVideos] = useState<ExclusiveVideo[]>([]);
  const [loading, setLoading] = useState(true);
  // Fresh TikTok thumbnails resolved by video id (stored ones expire — same as the channel grid).
  const [ttThumbs, setTtThumbs] = useState<Record<string, string>>({});
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([
        fetchAwardedCollection(collectionId),
        fetchExclusiveCollectionVideos(collectionId, user?.id),
      ]);
      if (!mountedRef.current) { return; }
      setCollection(c); setVideos(v);
    } catch (e) { log.error('[exclusive] collection', e); }
    finally { if (mountedRef.current) { setLoading(false); } }
  }, [collectionId, user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Resolve fresh TikTok thumbnails for any visible TikTok video (stored URLs expire).
  useEffect(() => {
    videos.forEach(v => {
      if (v.sourceType !== 'tiktok' || !v.videoId || ttThumbs[v.videoId]) { return; }
      resolveTikTokThumbnail(v.videoId).then(url => {
        if (url && mountedRef.current) { setTtThumbs(prev => (prev[v.videoId!] ? prev : { ...prev, [v.videoId!]: url })); }
      }).catch(() => {});
    });
  }, [videos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proper thumbnail resolution, identical to the channel grid: TikTok uses a freshly resolved URL,
  // Bunny/IG/FB use the stored URL, and YouTube falls back to its derived hqdefault image.
  const resolveThumb = (v: ExclusiveVideo): string | null =>
    v.sourceType === 'tiktok'
      ? (v.videoId ? ttThumbs[v.videoId] ?? null : null)
      : v.sourceType === 'bunny'
      ? v.thumbnail
      : (v.thumbnail ?? (v.sourceType === 'youtube' && v.videoId ? `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg` : null));

  const gap = SPACE.SM;
  const cellW = Math.floor((width - SPACE.MD * 2 - gap) / 2);

  const renderItem = ({ item }: { item: ExclusiveVideo }) => {
    const ready = item.status === 'ready';
    const thumb = resolveThumb(item);
    // React-to-reveal: hide the thumbnail until the viewer reacts. The creator/poster always sees it.
    const isMine = !!user?.id && (item.posterId === user.id || collection?.creatorId === user.id);
    const obscured = ready && !isMine && !item.hasMyReaction;
    return (
      <TouchableOpacity style={[styles.cell, { width: cellW }]} activeOpacity={ready ? 0.85 : 1}
        onPress={() => ready && navigation.navigate('ExclusiveWatch', {
          postId: item.postId, channelId: collection?.channelId ?? '', title: item.title, thumbnail: thumb, posterId: item.posterId,
        })}>
        {/* Studio/exclusive videos are vertical — 9:16 portrait tiles so the frame fills + centers. */}
        <View style={[styles.thumb, { width: cellW, height: Math.round(cellW * 16 / 9) }]}>
          {obscured ? (
            <View style={styles.blind}>
              <Image source={require('../../../assets/questionmark.png')} style={styles.blindImg} resizeMode="contain" />
            </View>
          ) : thumb ? (
            <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center]}><Ionicons name="film-outline" size={22} color={C.SUBTLE} /></View>
          )}
          {!obscured && (
            <View style={styles.playPill}>
              <Ionicons name={ready ? 'play' : 'hourglass-outline'} size={16} color="#fff" />
            </View>
          )}
          {!obscured && ready && item.viewCount > 0 && <ViewBadge count={item.viewCount} style={styles.viewBadge} />}
        </View>
        {obscured
          ? <Text style={styles.vtitleObscured}>React to reveal</Text>
          : <Text style={styles.vtitle} numberOfLines={1}>{item.title}</Text>}
        {!ready
          ? <Text style={styles.vstatus}>Processing…</Text>
          : <Text style={styles.vmeta}>{item.reactionCount > 0 ? `${item.reactionCount} reaction${item.reactionCount !== 1 ? 's' : ''}` : 'No reactions yet'}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={C.INK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{collection?.name ?? 'Collection'}</Text>
          {collection && <Text style={styles.subtitle} numberOfLines={1}>{collection.channelName} · exclusive</Text>}
        </View>
        <View />
      </View>

      <FlatList
        data={videos}
        keyExtractor={v => v.postId}
        numColumns={2}
        columnWrapperStyle={{ gap, paddingHorizontal: SPACE.MD }}
        contentContainerStyle={{ gap, paddingBottom: SPACE.XXXL }}
        renderItem={renderItem}
        ListHeaderComponent={collection?.coverUrl ? (
          <Image source={{ uri: collection.coverUrl }} style={styles.cover} resizeMode="cover" />
        ) : null}
        ListEmptyComponent={loading
          ? <ActivityIndicator color={C.ACCENT} style={{ marginTop: SPACE.XXXL }} />
          : <Text style={styles.empty}>No videos in this collection yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, paddingHorizontal: SPACE.MD, marginBottom: SPACE.SM },
  iconBtn:   { width: 40, height: 40, borderRadius: RADIUS.FULL, alignItems: 'center', justifyContent: 'center', backgroundColor: C.SURFACE_2 },
  title:     { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  subtitle:  { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.ACCENT_HOT, marginTop: 1 },
  center:    { alignItems: 'center', justifyContent: 'center' },
  cover:     { width: '100%', maxHeight: 160, marginBottom: SPACE.MD },
  cell:      { gap: 4 },
  thumb:     { borderRadius: RADIUS.MD, backgroundColor: C.SURFACE_2, overflow: 'hidden' },
  // React-to-reveal blind — a "?" centered on black, matching the channel grid.
  blind:     { ...StyleSheet.absoluteFillObject, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center' },
  blindImg:  { width: 36, height: 52 },
  playPill:  { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.FULL, padding: 6 },
  viewBadge: { position: 'absolute', right: 8, bottom: 8 },
  vtitle:    { color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },
  vtitleObscured: { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS, fontStyle: 'italic' },
  vmeta:     { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS },
  vstatus:   { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS },
  empty:     { color: C.SUBTLE, textAlign: 'center', marginTop: SPACE.XXXL, fontFamily: FONT.BODY },
});
