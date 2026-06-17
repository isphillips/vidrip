import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  fetchAwardedCollection, fetchExclusiveCollectionVideos, type ExclusiveCollection, type ExclusiveVideo,
} from '../../../infrastructure/exclusive/api';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

export default function ExclusiveCollectionScreen({ route, navigation }: FeedStackScreenProps<'ExclusiveCollection'>) {
  const { collectionId } = route.params;
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [collection, setCollection] = useState<(ExclusiveCollection & { channelName: string }) | null>(null);
  const [videos, setVideos] = useState<ExclusiveVideo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([fetchAwardedCollection(collectionId), fetchExclusiveCollectionVideos(collectionId)]);
      setCollection(c); setVideos(v);
    } catch (e) { console.error('[exclusive] collection', e); }
    finally { setLoading(false); }
  }, [collectionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const gap = SPACE.SM;
  const cellW = Math.floor((width - SPACE.MD * 2 - gap) / 2);

  const renderItem = ({ item }: { item: ExclusiveVideo }) => {
    const ready = item.status === 'ready';
    return (
      <TouchableOpacity style={[styles.cell, { width: cellW }]} activeOpacity={ready ? 0.85 : 1}
        onPress={() => ready && navigation.navigate('ExclusiveWatch', { postId: item.postId, channelId: collection?.channelId ?? '', title: item.title, thumbnail: item.thumbnail })}>
        <View style={[styles.thumb, { width: cellW, height: Math.round(cellW * 1.4) }]}>
          {item.thumbnail
            ? <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, styles.center]}><Ionicons name="film-outline" size={22} color={C.SUBTLE} /></View>}
          <View style={styles.playPill}>
            <Ionicons name={ready ? 'play' : 'hourglass-outline'} size={16} color="#fff" />
          </View>
        </View>
        <Text style={styles.vtitle} numberOfLines={1}>{item.title}</Text>
        {!ready && <Text style={styles.vstatus}>Processing…</Text>}
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
        <View style={styles.iconBtn} />
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
  cover:     { width: '100%', height: 160, marginBottom: SPACE.MD },
  cell:      { gap: 4 },
  thumb:     { borderRadius: RADIUS.MD, backgroundColor: C.SURFACE_2, overflow: 'hidden' },
  playPill:  { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.FULL, padding: 6 },
  vtitle:    { color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },
  vstatus:   { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS },
  empty:     { color: C.SUBTLE, textAlign: 'center', marginTop: SPACE.XXXL, fontFamily: FONT.BODY },
});
