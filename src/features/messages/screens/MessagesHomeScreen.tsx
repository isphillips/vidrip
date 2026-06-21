import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Animated,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { renameGroupChat } from '../../../infrastructure/supabase/queries/channels';
import ConversationRow from '../../../components/conversation/ConversationRow';
import { relativeTime } from '../../../utils/relativeTime';
import GradientButton from '../../studio/components/GradientButton';
import AccountBlob from '../../../components/AccountBlob';
import SlimeFriendsIcon from '../../../components/SlimeFriendsIcon';
import ChannelsFeedBlock from '../../feed/components/ChannelsFeedBlock';
import { Swipeable } from 'react-native-gesture-handler';
import { useFriendConversations, convKey } from '../../feed/conversation/useFriendConversations';
import type { MessagesStackScreenProps } from '../../../app/navigation/types';

// ── Messages: the full conversation home — 1:1 friend chats + group chats, newest first ─────────
export default function MessagesHomeScreen({ navigation }: MessagesStackScreenProps<'MessagesHome'>) {
  const { top } = useSafeAreaInsets();
  const { items, loading, refreshing, refresh, hideConversation } = useFriendConversations();

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

  // Friends context window — an animated popover from the header (Add a friend / New group chat).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const openMenu = () => {
    setMenuOpen(true);
    Animated.spring(menuAnim, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220, mass: 0.7 }).start();
  };
  const closeMenu = () => {
    Animated.timing(menuAnim, { toValue: 0, duration: 140, useNativeDriver: true })
      .start(({ finished }) => { if (finished) { setMenuOpen(false); } });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={{ marginTop: top }}>
        <View style={styles.header}>
          <View style={styles.wordmarkRow}>
            <Text style={[styles.wordmarkText, styles.titleVi]}>Messages</Text>
          </View>
          <View style={styles.headerActions}>
            {/* Friends — opens the add-friend / new-group context window. */}
            <TouchableOpacity hitSlop={8} activeOpacity={0.7} onPress={openMenu}>
              <SlimeFriendsIcon size={30} active={menuOpen} />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={8} activeOpacity={0.7} onPress={() => (navigation as any).getParent()?.navigate('Account')}>
              <AccountBlob size={34} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

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
        renderItem={({ item }) => (
          <Swipeable
            overshootRight={false}
            renderRightActions={() => (
              <TouchableOpacity style={styles.hideAction} activeOpacity={0.85} onPress={() => hideConversation(convKey(item))}>
                <Ionicons name="eye-off-outline" size={20} color={C.WHITE} />
                <Text style={styles.hideActionTxt}>Hide</Text>
              </TouchableOpacity>
            )}>
            {item.kind === 'friend' ? (
          <ConversationRow
            avatarUrl={item.conv.avatarUrl}
            fallbackInitial={(item.conv.displayName || item.conv.handle || '?').charAt(0).toUpperCase()}
            title={item.conv.displayName || `@${item.conv.handle}`}
            subtitle={item.conv.dmUnread > 0 ? `${item.conv.dmUnread} new`
              : item.conv.lastActivityAt > 0 ? 'Tap to chat' : 'Say hi 👋'}
            unreadCount={item.conv.dmUnread}
            state={item.conv.dmUnread > 0 ? 'unread' : 'caughtup'}
            timestamp={relativeTime(item.conv.lastActivityAt)}
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
            )}
          </Swipeable>
        )}
      />

      {/* Friends context window — Add a friend / New group chat. */}
      <Modal visible={menuOpen} transparent animationType="none" onRequestClose={closeMenu}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu}>
          <Animated.View style={[
            styles.menuCard,
            { top: top + 52 },
            {
              opacity: menuAnim,
              transform: [
                { scale: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                { translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
              ],
            },
          ]}>
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}
              onPress={() => { closeMenu(); navigation.navigate('AddFriend'); }}>
              <Ionicons name="person-add-outline" size={20} color={C.ACCENT_HOT} />
              <Text style={styles.menuItemText}>Add a friend</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}
              onPress={() => { closeMenu(); navigation.navigate('InviteContacts'); }}>
              <Ionicons name="people-circle-outline" size={20} color={C.ACCENT_HOT} />
              <Text style={styles.menuItemText}>Import from contacts</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}
              onPress={() => { closeMenu(); navigation.navigate('CreateGroupChat'); }}>
              <Ionicons name="people-outline" size={20} color={C.ACCENT_HOT} />
              <Text style={styles.menuItemText}>New group chat</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Rename group chat — native slide-up branded bottom sheet (any member can rename). */}
      <Modal visible={!!renaming} transparent animationType="slide" onRequestClose={() => setRenaming(null)}>
        <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setRenaming(null)} />
          <View style={[styles.sheet, { paddingBottom: SPACE.XXL }]}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>Rename group</Text>
            <Text style={styles.sheetSub}>Give this chat a name everyone will see.</Text>
            <TextInput
              style={styles.sheetInput}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Group name"
              placeholderTextColor={C.SUBTLE}
              autoFocus
              maxLength={40}
            />
            <GradientButton label="Save name" icon="checkmark" onPress={() => saveRename(draftName)} style={styles.sheetCta} />
            <TouchableOpacity style={styles.sheetReset} onPress={() => saveRename('')} activeOpacity={0.7}>
              <Text style={styles.sheetResetTxt}>Reset to default name</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
    paddingBottom: SPACE.SM,
    zIndex: 10,
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 },
  wordmarkText: {
    fontSize: FONT.SIZES.XL,
    fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: FONT.WEIGHTS.BOLD,
    letterSpacing: -1,
    textTransform: 'uppercase',
    color: C.BLACK,
  },
  titleVi: { color: C.WHITE },
  headerActions: { marginLeft: 'auto', marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: SPACE.MD },

  // Friends context window (animated popover)
  menuBackdrop: { flex: 1 },
  menuCard: {
    position: 'absolute', right: SPACE.LG, minWidth: 210,
    backgroundColor: C.SURFACE_2, borderRadius: RADIUS.LG, borderWidth: 1, borderColor: C.BORDER,
    paddingVertical: SPACE.SM, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG },
  menuItemText: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  menuDivider: { height: 1, backgroundColor: C.BORDER, marginHorizontal: SPACE.SM },

  // Swipe-to-hide action (delete-for-me)
  hideAction: {
    width: 88, alignItems: 'center', justifyContent: 'center', gap: 2,
    backgroundColor: C.ACCENT, marginVertical: 1,
  },
  hideActionTxt: { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_BOLD },

  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: SPACE.XL, gap: SPACE.SM },
  emptyTitle: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.INK },
  emptySubtitle: { fontSize: FONT.SIZES.MD, color: C.MUTED, textAlign: 'center' },

  // Rename group — branded slide-up bottom sheet
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: C.SURFACE_2,
    borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    borderTopWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.LG, paddingTop: SPACE.SM,
  },
  sheetGrabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: C.BORDER_STRONG, marginBottom: SPACE.LG },
  sheetTitle: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, fontWeight: '700', color: C.INK },
  sheetSub: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, marginTop: 2, marginBottom: SPACE.LG },
  sheetInput: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY,
  },
  sheetCta: { marginTop: SPACE.LG },
  sheetReset: { alignItems: 'center', paddingVertical: SPACE.MD, marginTop: SPACE.XS },
  sheetResetTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
});
