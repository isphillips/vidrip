import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AccountBlob from '../../../components/AccountBlob';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useFeedStore } from '../../../store/feedStore';
import { useAuthStore } from '../../../store/authStore';
import { useReactQueueStore, type ReactTarget } from '../../../store/reactQueueStore';
import {
  renameGroupChat, fetchChannelUpdatesSummary, fetchChannelPosts,
  type ChannelUpdateSummary, type ChannelPost,
} from '../../../infrastructure/supabase/queries/channels';
import ConversationRow from '../../../components/conversation/ConversationRow';
import { relativeTime } from '../../../utils/relativeTime';
import ExclusiveRail from '../../exclusive/components/ExclusiveRail';
import { useFriendConversations } from '../conversation/useFriendConversations';
import type { FeedItem } from '../conversation/friendConversation';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

// One Feed row: a friend conversation, a group chat, or a followed channel with unseen uploads.
type FeedRow = FeedItem | { kind: 'channel'; sortAt: number; channel: ChannelUpdateSummary };

// Flowing-water wordmark: a pink↔purple gradient slides under a "drip" text mask.
const FLOW_PINK = '#FF4FA3';
const FLOW_PURPLE = '#A05CFF';
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// ── Main screen: Messenger-style 1:1 friend conversations + group chats ─────────
export default function FeedHomeScreen({ navigation }: FeedStackScreenProps<'FeedHome'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { items, threads, toReactCount, loading, refreshing, refresh } = useFriendConversations();
  const setQueue = useReactQueueStore(s => s.setQueue);

  // Followed channels (public/members-only) with unseen uploads, fetched alongside the
  // conversation sources so each can be slotted into the recency-sorted Feed.
  const [channelUpdates, setChannelUpdates] = useState<ChannelUpdateSummary[]>([]);
  const loadChannels = useCallback(async () => {
    if (!user) { return; }
    try { setChannelUpdates(await fetchChannelUpdatesSummary(user.id)); } catch { /* ignore */ }
  }, [user]);
  useFocusEffect(useCallback(() => { loadChannels(); }, [loadChannels]));
  const onRefresh = useCallback(() => { refresh(); loadChannels(); }, [refresh, loadChannels]);

  // Feed is actionable-only: a friend, group, or followed channel surfaces here only while it has
  // unseen videos to react to. The full conversation list (including caught-up chats) lives in Messages.
  // Channel rows ('channel' kind only — group chats already arrive via the conversations hook) are
  // interleaved by their last unseen upload time.
  const rows = useMemo<FeedRow[]>(() => {
    const convRows: FeedRow[] = items.filter(it =>
      it.kind === 'friend' ? it.conv.unreadCount > 0 : it.group.unreadCount > 0,
    );
    const channelRows: FeedRow[] = channelUpdates
      .filter(c => c.kind === 'channel' && c.unseen_count > 0)
      .map(c => ({
        kind: 'channel' as const,
        sortAt: c.last_unseen_at ? Date.parse(c.last_unseen_at) || 0 : 0,
        channel: c,
      }));
    return [...convRows, ...channelRows].sort((a, b) => b.sortAt - a.sortAt);
  }, [items, channelUpdates]);

  const channelToReact = useMemo(
    () => channelUpdates.filter(c => c.kind === 'channel').reduce((n, c) => n + c.unseen_count, 0),
    [channelUpdates],
  );

  // "Doom-react": tapping an entry opens its first pending video and chains through every pending
  // video (this entry's first, then the rest). Returns false if there's nothing to react to.
  const startDoomReact = (entryThreadIds: string[]): boolean => {
    const pending = threads.filter(t => t.sender_id !== user?.id && t.my_status !== 'reacted'
      && t.thread_kind !== 'studio_share' && !!t.video_id);
    const mine = pending.filter(t => entryThreadIds.includes(t.id));
    const rest = pending.filter(t => !entryThreadIds.includes(t.id));
    const ordered = [...mine, ...rest];
    if (ordered.length === 0) { return false; }
    const toTarget = (t: typeof ordered[number]): ReactTarget => ({
      threadId: t.id, videoId: t.video_id ?? undefined, sourceType: (t.source_type ?? undefined) as ReactTarget['sourceType'],
    });
    const [first, ...others] = ordered;
    setQueue(others.map(toTarget));
    (navigation as any).getParent()?.navigate('RecordReaction', { ...toTarget(first), queued: true });
    return true;
  };

  // Doom-react a channel: start on its first unwatched video, chain through the channel's
  // remaining pending posts, then continue through the rest of the Feed's pending shares.
  const startChannelDoomReact = async (chId: string, chName: string, isMembersOnly: boolean) => {
    let posts: ChannelPost[] = [];
    try { posts = await fetchChannelPosts(chId, user?.id); } catch { /* ignore */ }
    const channelTargets: ReactTarget[] = posts
      .filter(p => p.parent_post_id == null && p.poster_id !== user?.id && !p.has_my_reaction
        && (p.post_type === 'youtube' || p.post_type === 'creator'))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))   // oldest unwatched first
      .map(p => ({ kind: 'channel' as const, postId: p.id, channelId: chId }));

    const threadTargets: ReactTarget[] = threads
      .filter(t => t.sender_id !== user?.id && t.my_status !== 'reacted'
        && t.thread_kind !== 'studio_share' && !!t.video_id)
      .map(t => ({
        kind: 'thread' as const, threadId: t.id, videoId: t.video_id ?? undefined,
        sourceType: (t.source_type ?? undefined) as ReactTarget['sourceType'],
      }));

    const ordered = [...channelTargets, ...threadTargets];
    if (ordered.length === 0) {
      // Nothing pending after all — just open the channel.
      (navigation as any).navigate('Channel', {
        channelId: chId, channelName: chName,
        isPublic: true, isJoined: true, isOwner: false, isMembersOnly, isGroupChat: false,
      });
      return;
    }
    const [first, ...rest] = ordered;
    setQueue(rest);
    (navigation as any).getParent()?.navigate('RecordReaction', { ...first, queued: true });
  };

  // Long-press a group chat → rename it (any member can; empty reverts to auto name).
  const [renaming, setRenaming] = useState<{ channelId: string; name: string } | null>(null);
  const [draftName, setDraftName] = useState('');
  const saveRename = async (value: string) => {
    if (!renaming) { return; }
    const target = renaming.channelId;
    setRenaming(null);
    try { await renameGroupChat(target, value); } catch { /* ignore */ }
    refresh();
  };

  // Bottom-tab Feed badge mirrors the total items needing my attention (conversations + channels).
  const setToReactCount = useFeedStore(s => s.setToReactCount);
  useEffect(() => {
    setToReactCount(toReactCount + channelToReact);
  }, [toReactCount, channelToReact, setToReactCount]);

  // Flowing "drip" wordmark gradient.
  const [dripSize, setDripSize] = useState({ w: 70, h: 34 });
  const flow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(flow, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [flow]);
  const dripTranslateX = flow.interpolate({ inputRange: [0, 1], outputRange: [0, -dripSize.w] });

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={{ marginTop: top }}>
        <View style={styles.header}>
          <Image source={require('../../../assets/driplogo.png')} style={styles.headerLogo} resizeMode="contain" />
          <View style={styles.wordmarkRow}>
            <Text style={[styles.wordmarkText, styles.titleVi]}>Vi</Text>
            <MaskedView
              style={{ width: dripSize.w, height: dripSize.h }}
              maskElement={
                <Text
                  style={styles.wordmarkText}
                  onLayout={e => {
                    const { width, height } = e.nativeEvent.layout;
                    setDripSize(s => (Math.abs(s.w - width) > 1 || Math.abs(s.h - height) > 1)
                      ? { w: width, h: height } : s);
                  }}>
                  drip
                </Text>
              }>
              <AnimatedLinearGradient
                colors={[FLOW_PINK, FLOW_PURPLE, FLOW_PINK, FLOW_PURPLE, FLOW_PINK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: dripSize.w * 2, height: dripSize.h, transform: [{ translateX: dripTranslateX }] }}
              />
            </MaskedView>
          </View>
          <TouchableOpacity
            style={styles.acctBtn}
            hitSlop={10}
            activeOpacity={0.7}
            onPress={() => (navigation as any).getParent()?.navigate('Account')}>
            <AccountBlob size={34} />
          </TouchableOpacity>
        </View>
      </View>

      <ExclusiveRail
        onOpenGift={awardId => navigation.navigate('GiftReveal', { awardId })}
        onOpenCollection={collectionId => navigation.navigate('ExclusiveCollection', { collectionId })}
      />

      <FlatList
        style={styles.fill}
        data={rows}
        keyExtractor={it => (
          it.kind === 'friend' ? `f:${it.conv.friendUserId}`
          : it.kind === 'group' ? `g:${it.group.channelId}`
          : `c:${it.channel.channel_id}`
        )}
        contentContainerStyle={rows.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.ACCENT} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>You're all caught up 🎉</Text>
            <Text style={styles.emptySubtitle}>New videos to react to will show up here.</Text>
          </View>
        }
        renderItem={({ item }) => item.kind === 'friend' ? (
          <ConversationRow
            avatarUrl={item.conv.avatarUrl}
            fallbackInitial={(item.conv.displayName || item.conv.handle || '?').charAt(0).toUpperCase()}
            title={item.conv.displayName || `@${item.conv.handle}`}
            subtitle={item.conv.subtitle}
            unreadCount={item.conv.unreadCount}
            state={item.conv.state}
            eyes={item.conv.state === 'unreplied'}
            timestamp={relativeTime(item.conv.lastActivityAt)}
            exclusiveGlow={item.conv.hasExclusiveDrop}
            onPress={() => {
              // Doom-react through this friend's pending videos; fall back to the chat if none.
              if (startDoomReact(item.conv.threadIds)) { return; }
              navigation.navigate('FriendConversation', {
                friendUserId: item.conv.friendUserId,
                displayName: item.conv.displayName,
                handle: item.conv.handle,
                avatarUrl: item.conv.avatarUrl,
                dmChannelId: item.conv.dmChannelId,
                threadIds: item.conv.threadIds,
              });
            }}
          />
        ) : item.kind === 'group' ? (
          <ConversationRow
            avatarUrl={null}
            fallbackInitial="👥"
            title={item.group.name}
            subtitle={item.group.unreadCount > 0
              ? `${item.group.unreadCount} new`
              : `${item.group.memberCount} members · hold to rename`}
            unreadCount={item.group.unreadCount}
            state={item.group.state}
            timestamp={relativeTime(item.group.lastActivityAt)}
            onPress={() => (navigation as any).navigate('Channel', {
              channelId: item.group.channelId,
              channelName: item.group.name,
              isPublic: false,
              isJoined: true,
              isOwner: false,
              isMembersOnly: false,
              isGroupChat: true,
            })}
            onLongPress={() => { setDraftName(item.group.name); setRenaming({ channelId: item.group.channelId, name: item.group.name }); }}
          />
        ) : (
          <ConversationRow
            avatarUrl={null}
            fallbackInitial="📢"
            title={item.channel.name}
            subtitle={`${item.channel.unseen_count} new video${item.channel.unseen_count !== 1 ? 's' : ''} to react to`}
            unreadCount={item.channel.unseen_count}
            state="unread"
            timestamp={relativeTime(item.sortAt)}
            onPress={() => startChannelDoomReact(
              item.channel.channel_id, item.channel.name, item.channel.is_members_only,
            )}
          />
        )}
      />

      {/* Rename group chat (any member). */}
      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRenaming(null)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Rename group</Text>
            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Group name"
              placeholderTextColor={C.SUBTLE}
              autoFocus
              maxLength={40}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity onPress={() => saveRename('')} activeOpacity={0.8}>
                <Text style={styles.resetText}>Reset to default</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => saveRename(draftName)} activeOpacity={0.85}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  fill: { flex: 1 },
  center: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.SM,
    paddingHorizontal: SPACE.LG,
    paddingTop: SPACE.MD,
    paddingBottom: SPACE.MD,
    zIndex: 10,
  },
  headerLogo: { width: 32, height: 55, marginTop: -5, marginBottom: -21, pointerEvents: 'none' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginLeft: -5 },
  wordmarkText: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: FONT.WEIGHTS.BOLD,
    letterSpacing: -1,
    textTransform: 'uppercase',
    color: C.BLACK,
  },
  titleVi: { color: C.WHITE },
  acctBtn: { marginLeft: 'auto', marginTop: 6 },
  newGroupBtn: {
    marginLeft: 'auto', marginTop: 4,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER,
  },
  newGroupPlus: {
    position: 'absolute', right: 4, bottom: 4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.ACCENT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.SURFACE,
  },

  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: SPACE.XL, gap: SPACE.SM },
  emptyTitle: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.INK },
  emptySubtitle: { fontSize: FONT.SIZES.MD, color: C.MUTED, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: SPACE.XL },
  modalSheet: { backgroundColor: C.SURFACE, borderRadius: RADIUS.LG, padding: SPACE.LG, gap: SPACE.MD },
  modalTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  input: {
    backgroundColor: C.SURFACE_2, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, color: C.INK, fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY,
  },
  modalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resetText: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  saveBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM },
  saveText: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD, color: C.WHITE },
});
