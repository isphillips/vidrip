import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { fetchCollectionsByCreator, type ExclusiveCollection } from '../../../infrastructure/exclusive/api';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

type Row = ExclusiveCollection & { channelName: string };

export default function StudioCollectionsScreen({ navigation }: StudioStackScreenProps<'StudioCollections'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try { setRows(await fetchCollectionsByCreator(user.id)); }
    catch (e) { console.error('[studio] collections', e); }
    finally { setLoading(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: Row }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.85}
      onPress={() => navigation.navigate('StudioCollectionEdit', { collectionId: item.id })}>
      {item.coverUrl
        ? <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
        : <View style={[styles.cover, styles.coverEmpty]}><Ionicons name="diamond-outline" size={22} color={C.SUBTLE} /></View>}
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {item.channelName} · {item.videoCount ?? 0} {item.videoCount === 1 ? 'video' : 'videos'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.SUBTLE} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={C.INK} />
        </TouchableOpacity>
        <Text style={styles.title}>Exclusive</Text>
        <View style={styles.iconBtn} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={r => r.id}
        contentContainerStyle={rows.length === 0 ? styles.emptyWrap : styles.list}
        renderItem={renderItem}
        ListEmptyComponent={loading
          ? <ActivityIndicator color={C.ACCENT} style={{ marginTop: SPACE.XXXL }} />
          : (
            <View style={styles.emptyInner}>
              <Ionicons name="diamond-outline" size={36} color={C.SUBTLE} />
              <Text style={styles.emptyTitle}>No collections yet</Text>
              <Text style={styles.emptyHint}>Group videos into exclusive collections and award them to subscribers or individual fans.</Text>
            </View>
          )}
      />

      <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('StudioCollectionEdit', {})}>
        <LinearGradient colors={['#FF4FA3', '#A05CFF', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newBtn}>
          <Ionicons name="add-circle" size={22} color={C.WHITE} />
          <Text style={styles.newBtnText}>New collection</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.MD },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  iconBtn:   { width: 40, height: 40, borderRadius: RADIUS.FULL, alignItems: 'center', justifyContent: 'center', backgroundColor: C.SURFACE_2 },
  title:     { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  list:      { gap: SPACE.SM, paddingBottom: SPACE.XXXL },
  row:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, backgroundColor: C.SURFACE, padding: SPACE.SM, borderRadius: RADIUS.MD },
  cover:     { width: 64, height: 64, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2 },
  coverEmpty:{ alignItems: 'center', justifyContent: 'center' },
  meta:      { flex: 1 },
  name:      { color: C.INK, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },
  sub:       { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, marginTop: 2 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyInner:{ alignItems: 'center', gap: SPACE.SM, paddingHorizontal: SPACE.XL },
  emptyTitle:{ color: C.INK, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },
  emptyHint: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, textAlign: 'center' },
  newBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM, borderRadius: RADIUS.MD, marginBottom: 50 },
  newBtnText:{ color: C.WHITE, paddingVertical: SPACE.LG, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },
});
