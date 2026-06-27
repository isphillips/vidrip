import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Modal,
} from 'react-native';
import Video from 'react-native-video';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { useBlockStore } from '../../../store/blockStore';
import {
  fetchChannelPostReactions, fetchPostReviews, addChannelPostEmojiReaction, removeChannelPostEmojiReaction,
  type ChannelPost, type ChannelReview,
} from '../../../infrastructure/supabase/queries/channels';
import EmojiChips from '../../../components/EmojiChips';
import BunnyEmbedPlayer from '../../studio/components/BunnyEmbedPlayer';
import ContentActions from '../../../components/ContentActions';
import { recordView } from '../../../infrastructure/supabase/queries/views';
import type { ReportTargetType } from '../../../infrastructure/supabase/queries/reports';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

export default function ExclusiveWatchScreen({ route, navigation }: FeedStackScreenProps<'ExclusiveWatch'>) {
  const { postId, channelId, title, thumbnail } = route.params;
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const blocked = useBlockStore(s => s.blocked);

  const [reactions, setReactions] = useState<ChannelPost[]>([]);
  const [reviews, setReviews] = useState<ChannelReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'reactions' | 'reviews'>('reactions');
  const [playMain, setPlayMain] = useState(false);
  // Carries the author alongside the URL so the player can offer Report/Block on this UGC clip.
  const [clip, setClip] = useState<{
    url: string; label: string;
    targetType: ReportTargetType; targetId: string; targetUserId: string | null; handle: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, v] = await Promise.all([fetchChannelPostReactions(postId), fetchPostReviews(postId)]);
      setReactions(r); setReviews(v);
    } catch (e) { log.error('[exclusive] thread', e); }
    finally { setLoading(false); }
  }, [postId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hasReacted = reactions.some(r => r.poster_id === user?.id);
  const hasReviewed = reviews.some(r => r.reviewer_id === user?.id);
  // App-wide block: hide reactions/reviews authored by blocked users.
  const visReactions = reactions.filter(r => !blocked.has(r.poster_id));
  const visReviews = reviews.filter(r => !blocked.has(r.reviewer_id));

  // Reuse the channel recorders (they handle bunny posts + parent_post_id; RLS lets awarded users in).
  const recordReaction = () => (navigation as any).navigate('Channels', { screen: 'WatchYouTubePost', params: { postId, channelId } });
  const recordReview = () => (navigation as any).navigate('Channels', { screen: 'RecordReview', params: { postId, channelId } });

  const toggleEmoji = async (r: ChannelPost, emoji: string) => {
    if (!user?.id) { return; }
    const mine = r.emoji_reactions?.some(e => e.emoji === emoji && e.user_id === user.id);
    try {
      if (mine) { await removeChannelPostEmojiReaction(r.id, user.id, emoji); }
      else { await addChannelPostEmojiReaction(r.id, user.id, emoji); }
      load();
    } catch { /* ignore */ }
  };

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={C.INK} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title ?? 'Exclusive'}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: SPACE.XXXL }}>
        {/* Main video play card */}
        <TouchableOpacity style={styles.playCard} activeOpacity={0.9} onPress={() => { setPlayMain(true); recordView('post', postId); }}>
          {thumbnail
            ? <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: '#000' }]} />}
          <View style={styles.playBg}><Ionicons name="play" size={26} color="#fff" /></View>
          <View style={styles.exclusiveTag}><Ionicons name="diamond" size={11} color={C.WHITE} /><Text style={styles.exclusiveTagTxt}>Exclusive</Text></View>
        </TouchableOpacity>

        {/* React / Review actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.action, hasReacted && styles.actionDone]} onPress={recordReaction} activeOpacity={0.85}>
            <Ionicons name={hasReacted ? 'checkmark-circle' : 'videocam'} size={18} color={hasReacted ? C.SUCCESS : C.INK} />
            <Text style={styles.actionTxt}>{hasReacted ? 'Reacted' : 'React'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.action, hasReviewed && styles.actionDone]} onPress={recordReview} activeOpacity={0.85}>
            <Ionicons name={hasReviewed ? 'checkmark-circle' : 'star-outline'} size={18} color={hasReviewed ? C.SUCCESS : C.INK} />
            <Text style={styles.actionTxt}>{hasReviewed ? 'Reviewed' : 'Review'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.privateNote}><Ionicons name="lock-closed" size={11} color={C.SUBTLE} /> Private thread — only people with this collection can see reactions & reviews.</Text>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(['reactions', 'reviews'] as const).map(t => (
            <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)} activeOpacity={0.8}>
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtOn]}>
                {t === 'reactions' ? `Reactions${visReactions.length ? ` ${visReactions.length}` : ''}` : `Reviews${visReviews.length ? ` ${visReviews.length}` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <ActivityIndicator color={C.ACCENT} style={{ marginTop: SPACE.XL }} />
          : tab === 'reactions' ? (
            visReactions.length === 0
              ? <Text style={styles.empty}>No reactions yet. Be the first.</Text>
              : visReactions.map(r => (
                <TouchableOpacity key={r.id} style={styles.row} activeOpacity={r.video_url ? 0.8 : 1}
                  onPress={() => r.video_url && (recordView('post', r.id), setClip({ url: r.video_url, label: `@${r.poster?.handle ?? 'reaction'}`, targetType: 'reaction', targetId: r.id, targetUserId: r.poster_id, handle: r.poster?.handle ?? null }))}>
                  <View style={styles.rowPlay}><Ionicons name="play" size={14} color="#fff" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>@{r.poster?.handle ?? 'someone'}</Text>
                    {r.emoji_reactions?.length > 0 && <EmojiChips reactions={r.emoji_reactions} userId={user?.id} onToggle={(emoji) => toggleEmoji(r, emoji)} />}
                  </View>
                </TouchableOpacity>
              ))
          ) : (
            visReviews.length === 0
              ? <Text style={styles.empty}>No reviews yet.</Text>
              : visReviews.map(rv => (
                <TouchableOpacity key={rv.id} style={styles.row} activeOpacity={rv.video_url ? 0.8 : 1}
                  onPress={() => rv.video_url && (recordView('review', rv.id), setClip({ url: rv.video_url, label: `★ @${rv.reviewer?.handle ?? 'review'}`, targetType: 'clip', targetId: rv.id, targetUserId: rv.reviewer_id, handle: rv.reviewer?.handle ?? null }))}>
                  <View style={[styles.rowPlay, { backgroundColor: C.GOLD }]}><Ionicons name="star" size={13} color="#fff" /></View>
                  <Text style={styles.rowName} numberOfLines={1}>@{rv.reviewer?.handle ?? 'someone'}</Text>
                </TouchableOpacity>
              ))
          )}
      </ScrollView>

      {/* Main video */}
      {playMain && <BunnyEmbedPlayer postId={postId} title={title ?? 'Exclusive'} onClose={() => setPlayMain(false)} />}

      {/* Reaction/review clip player */}
      <Modal visible={!!clip} animationType="fade" onRequestClose={() => setClip(null)}>
        <View style={styles.clipContainer}>
          {clip && <Video source={{ uri: clip.url }} style={StyleSheet.absoluteFill} resizeMode="contain" controls repeat paused={false} />}
          {/* Report this clip / block its author — UGC safety (App Store 1.2). */}
          {clip && clip.targetUserId && clip.targetUserId !== user?.id && (
            <View style={styles.clipActions}>
              <View style={styles.clipCloseBg}>
                <ContentActions
                  targetType={clip.targetType}
                  targetId={clip.targetId}
                  targetUserId={clip.targetUserId}
                  handle={clip.handle}
                  color={C.WHITE}
                  size={22}
                  onBlocked={() => { setClip(null); load(); }}
                />
              </View>
            </View>
          )}
          <TouchableOpacity style={styles.clipClose} onPress={() => setClip(null)} hitSlop={12}>
            <View style={styles.clipCloseBg}><Ionicons name="close" size={22} color="#fff" /></View>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.MD },
  center:    { alignItems: 'center', justifyContent: 'center' },
  header:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginBottom: SPACE.SM },
  iconBtn:   { width: 40, height: 40, borderRadius: RADIUS.FULL, alignItems: 'center', justifyContent: 'center', backgroundColor: C.SURFACE_2 },
  title:     { flex: 1, fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },

  playCard:  { height: 300, borderRadius: RADIUS.MD, backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.MD },
  playBg:    { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: RADIUS.FULL, padding: 16 },
  exclusiveTag: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(160,92,255,0.85)', borderRadius: RADIUS.FULL, paddingHorizontal: 8, paddingVertical: 3 },
  exclusiveTagTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: 10, letterSpacing: 0.5 },

  actions:   { flexDirection: 'row', gap: SPACE.SM },
  action:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE },
  actionDone:{ borderColor: C.SUCCESS },
  actionTxt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  privateNote: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS, marginTop: SPACE.SM, textAlign: 'center' },

  tabBar:    { flexDirection: 'row', gap: SPACE.SM, marginTop: SPACE.LG, marginBottom: SPACE.SM },
  tab:       { flex: 1, alignItems: 'center', paddingVertical: SPACE.SM, borderRadius: RADIUS.MD, backgroundColor: C.SURFACE },
  tabOn:     { backgroundColor: C.ACCENT },
  tabTxt:    { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  tabTxtOn:  { color: C.WHITE },
  empty:     { color: C.SUBTLE, textAlign: 'center', marginTop: SPACE.XL, fontFamily: FONT.BODY },

  row:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, padding: SPACE.SM, marginBottom: SPACE.SM },
  rowPlay:   { width: 34, height: 34, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT, alignItems: 'center', justifyContent: 'center' },
  rowName:   { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },

  clipContainer: { flex: 1, backgroundColor: '#000' },
  clipClose: { position: 'absolute', top: 52, right: 20 },
  clipActions: { position: 'absolute', top: 52, right: 64 },
  clipCloseBg: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: 8 },
});
