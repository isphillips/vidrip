import React, { useEffect, useRef, useState } from 'react';
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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useFeedStore } from '../../../store/feedStore';
import { renameGroupChat } from '../../../infrastructure/supabase/queries/channels';
import ConversationRow from '../../../components/conversation/ConversationRow';
import ChannelsFeedBlock from '../components/ChannelsFeedBlock';
import ExclusiveRail from '../../exclusive/components/ExclusiveRail';
import { useFriendConversations } from '../conversation/useFriendConversations';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

// Flowing-water wordmark: a pink↔purple gradient slides under a "drip" text mask.
const FLOW_PINK = '#FF4FA3';
const FLOW_PURPLE = '#A05CFF';
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// ── Main screen: Messenger-style 1:1 friend conversations + group chats ─────────
export default function FeedHomeScreen({ navigation }: FeedStackScreenProps<'FeedHome'>) {
  const { top } = useSafeAreaInsets();
  const { items, toReactCount, loading, refreshing, refresh } = useFriendConversations();

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

  // Bottom-tab Feed badge mirrors the total items needing my attention.
  const setToReactCount = useFeedStore(s => s.setToReactCount);
  useEffect(() => { setToReactCount(toReactCount); }, [toReactCount, setToReactCount]);

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
            style={styles.newGroupBtn}
            hitSlop={10}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('CreateGroupChat')}>
            <Ionicons name="people" size={22} color={C.ACCENT_HOT} />
            <View style={styles.newGroupPlus}>
              <Ionicons name="add" size={12} color={C.WHITE} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ExclusiveRail
        onOpenGift={awardId => navigation.navigate('GiftReveal', { awardId })}
        onOpenCollection={collectionId => navigation.navigate('ExclusiveCollection', { collectionId })}
      />

      <FlatList
        style={styles.fill}
        data={items}
        keyExtractor={it => (it.kind === 'friend' ? `f:${it.conv.friendUserId}` : `g:${it.group.channelId}`)}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.ACCENT} />}
        ListHeaderComponent={
          <ChannelsFeedBlock
            onPress={() => (navigation as any).navigate('Channels', { screen: 'ChannelsHome' })}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>Add friends and share a Short to start a chat.</Text>
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
            exclusiveGlow={item.conv.hasExclusiveDrop}
            onPress={() => navigation.navigate('FriendConversation', {
              friendUserId: item.conv.friendUserId,
              displayName: item.conv.displayName,
              handle: item.conv.handle,
              avatarUrl: item.conv.avatarUrl,
              dmChannelId: item.conv.dmChannelId,
              threadIds: item.conv.threadIds,
            })}
          />
        ) : (
          <ConversationRow
            avatarUrl={null}
            fallbackInitial="👥"
            title={item.group.name}
            subtitle={item.group.unreadCount > 0
              ? `${item.group.unreadCount} new`
              : `${item.group.memberCount} members · hold to rename`}
            unreadCount={item.group.unreadCount}
            state={item.group.state}
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
    paddingTop: SPACE.LG,
    paddingBottom: SPACE.SM,
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
