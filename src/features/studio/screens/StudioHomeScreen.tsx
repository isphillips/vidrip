import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { fetchMyCreatorVideos, type MyCreatorVideo } from '../../../infrastructure/creatorStudio/api';
import { deleteChannelPost } from '../../../infrastructure/supabase/queries/channels';
import { pickVideo } from '../../../infrastructure/media/imagePicker';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

const STATUS: Record<string, { label: string; color: string }> = {
  uploading:  { label: 'Uploading',  color: C.SUBTLE },
  processing: { label: 'Processing', color: C.GOLD },
  ready:      { label: 'Live',       color: C.SUCCESS },
  failed:     { label: 'Failed',     color: C.DANGER },
};

export default function StudioHomeScreen({ navigation }: StudioStackScreenProps<'StudioHome'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [videos, setVideos] = useState<MyCreatorVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { return; }
    try { setVideos(await fetchMyCreatorVideos(user.id)); }
    catch (e) { console.error('[studio] load', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.id]);

  // Refetch on focus so processing → live transitions show without manual refresh.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startNew = async () => {
    try {
      const picked = await pickVideo();
      if (picked?.uri) {
        navigation.navigate('StudioDetails', { fileUri: picked.uri, durationSec: picked.durationSec });
      }
    } catch (e: any) { Alert.alert('Video', e?.message ?? 'Could not get a video.'); }
  };

  const onDelete = (item: MyCreatorVideo) => {
    Alert.alert('Delete video?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setVideos(prev => prev.filter(v => v.id !== item.id));
        try { await deleteChannelPost(item.id); } catch { load(); }
      } },
    ]);
  };

  const close = () => navigation.getParent()?.goBack();

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Studio</Text>
        <TouchableOpacity onPress={close} hitSlop={10}><Ionicons name="close" size={26} color={C.INK} /></TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={startNew}>
        <LinearGradient
          colors={['#FF4FA3', '#A05CFF', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.newBtn}>
          <Ionicons name="add-circle" size={22} color={C.WHITE} />
          <Text style={styles.newBtnText}>New video</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Your videos</Text>
      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        contentContainerStyle={videos.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.ACCENT} />}
        ListEmptyComponent={loading
          ? <ActivityIndicator color={C.ACCENT} style={{ marginTop: SPACE.XXXL }} />
          : <Text style={styles.empty}>No videos yet — tap “New video” to create your first.</Text>}
        renderItem={({ item }) => {
          const st = STATUS[item.status] ?? STATUS.processing;
          const playable = item.status === 'ready';
          return (
            <TouchableOpacity
              style={styles.row} activeOpacity={playable ? 0.8 : 1}
              onPress={() => playable && navigation.navigate('StudioPlayer', { postId: item.id, title: item.title })}>
              {item.thumbnail
                ? <Image source={{ uri: item.thumbnail }} style={styles.thumb} resizeMode="cover" />
                : <View style={[styles.thumb, styles.thumbPlaceholder]}><Ionicons name="film-outline" size={20} color={C.SUBTLE} /></View>}
              <View style={styles.meta}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.rowSub}>
                  <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                  <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  <Ionicons
                    name={item.visibility === 'subscribers' ? 'lock-closed' : 'globe-outline'}
                    size={12} color={C.SUBTLE} style={{ marginLeft: SPACE.SM }} />
                  <Text style={styles.visText}>{item.visibility === 'subscribers' ? 'Subscribers' : 'Public'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => onDelete(item)} hitSlop={10} style={styles.del}>
                <Ionicons name="trash-outline" size={18} color={C.MUTED} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.LG },
  title: { fontSize: FONT.SIZES.XL, textTransform: 'uppercase', fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM,
    borderRadius: RADIUS.MD,
  },
  newBtnText: { paddingVertical: SPACE.LG, color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  sectionLabel: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED, marginTop: SPACE.XL, marginBottom: SPACE.SM },
  list: { paddingBottom: SPACE.XXXL },
  emptyWrap: { flexGrow: 1, alignItems: 'center', paddingTop: SPACE.XL },
  empty: { color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', paddingHorizontal: SPACE.XL },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, padding: SPACE.SM, marginBottom: SPACE.SM,
    borderWidth: 1, borderColor: C.BORDER,
  },
  thumb: { width: 64, height: 48, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1 },
  rowTitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  rowSub: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM },
  visText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.SUBTLE, marginLeft: 3 },
  del: { padding: SPACE.SM },
});
