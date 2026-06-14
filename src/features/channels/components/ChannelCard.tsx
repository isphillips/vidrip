import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import Handle from '../../../components/Handle';
import type { ChannelSummary } from '../../../infrastructure/supabase/queries/channels';

type Props = {
  channel: ChannelSummary;
  userId: string | undefined;
  onPress: () => void;
  onAcceptInvite?: () => void;
  onDeclineInvite?: () => void;
  // When both are supplied (owner's "My Channels"), tappable status/visibility
  // badges are shown so the owner can flip them inline.
  onToggleListed?: () => void;
  onToggleInviteOnly?: () => void;
};

export default function ChannelCard({
  channel, userId, onPress, onAcceptInvite, onDeclineInvite,
  onToggleListed, onToggleInviteOnly,
}: Props) {
  const isOwner = !!userId && channel.created_by === userId;
  const showOwnerControls = !!onToggleListed && !!onToggleInviteOnly;
  const listed = channel.is_listed ?? channel.is_public;
  const inviteOnly = !!channel.invite_only;
  // Public: unreacted YouTube posts. Private: unread messages.
  const hasUnread = channel.unread_count > 0;
  // Members Only channels show a letter circle (matching AccountScreen) until a
  // dedicated Vidrip profile image is added — not the provider avatar.
  const initial = (channel.name || '?').replace(/^@/, '').charAt(0).toUpperCase() || '?';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.body}>
        {channel.is_members_only ? (
          channel.owner?.avatar_url ? (
            <Image source={{ uri: channel.owner.avatar_url }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
          )
        ) : channel.avatar_url ? (
          <Image source={{ uri: channel.avatar_url }} style={styles.avatar} resizeMode="cover" />
        ) : null}
        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {channel.name || (channel.owner?.handle ? `@${channel.owner.handle}` : 'Channel')}
            </Text>
            {hasUnread && <View style={styles.unreadDot} />}
          </View>
          {/* Owner @handle subtitle (the title now always holds the channel name). */}
          {channel.owner && (
            <Handle userId={channel.created_by ?? undefined} handle={channel.owner.handle} style={styles.owner} />
          )}
          {channel.description ? (
            <Text style={styles.description} numberOfLines={2}>{channel.description}</Text>
          ) : null}
          <View style={styles.footer}>
            <Text style={styles.memberCount}>
              {channel.member_count.toLocaleString()} member{channel.member_count !== 1 ? 's' : ''}
            </Text>
            {isOwner
              ? null
              : channel.subscribed ? (
                <View style={styles.joinedPill}>
                  <Text style={styles.joinedText}>Subscribed</Text>
                </View>
              ) : channel.is_joined ? (
                <View style={styles.joinedPill}>
                  <Text style={styles.joinedText}>Joined</Text>
                </View>
              ) : channel.invite_only && channel.invite_status === 'pending' ? (
                <View style={styles.inviteActions}>
                  <TouchableOpacity style={styles.declineBtn} onPress={onDeclineInvite} hitSlop={6} activeOpacity={0.8}>
                    <Text style={styles.declineText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.acceptBtn} onPress={onAcceptInvite} activeOpacity={0.8}>
                    <Text style={styles.acceptText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              ) : channel.invite_only ? (
                <View style={styles.lockPill}>
                  <Text style={styles.lockText}>
                    {channel.subscriber_mode ? '⭐ Subscription Only' : '🔒 Invite only'}
                  </Text>
                </View>
              ) : null
            }

            {showOwnerControls && (
              <>
                <TouchableOpacity
                  style={[styles.statusBadge, listed ? styles.statusOn : styles.statusOff]}
                  onPress={onToggleListed} activeOpacity={0.8}>
                  <Text style={[styles.statusBadgeText, listed ? styles.statusTextOn : styles.statusTextOff]}>
                    {listed ? 'Public' : 'Private'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusBadge, inviteOnly ? styles.statusOff : styles.statusOn]}
                  onPress={onToggleInviteOnly} activeOpacity={0.8}>
                  <Text style={[styles.statusBadgeText, inviteOnly ? styles.statusTextOff : styles.statusTextOn]}>
                    {inviteOnly ? 'Invite Only' : 'Open'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {channel.pinned_video_thumbnail ? (
          <Image
            source={{ uri: channel.pinned_video_thumbnail }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Text style={styles.thumbnailPlaceholderIcon}>▶</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    paddingHorizontal: SPACE.LG,
    paddingVertical: SPACE.MD,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.MD,
  },
  meta: { flex: 1, gap: SPACE.XS },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.SURFACE_2,
  },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.ACCENT_LITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.ACCENT,
  },
  avatarLetter: {
    fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT,
  },
  moBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(180,130,40,0.15)',
    borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.SM, paddingVertical: 1,
    borderWidth: 1, borderColor: 'rgba(180,130,40,0.5)',
  },
  moBadgeText: {
    fontSize: 9, fontFamily: FONT.BODY_BOLD, letterSpacing: 0.8,
    color: 'rgba(200,155,50,1)',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.ACCENT_HOT,
  },
  name: {
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.DISPLAY_SEMIBOLD,
    color: C.INK,
  },
  owner: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY,
    color: C.ACCENT_HOT,
  },
  description: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY,
    color: C.MUTED,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACE.SM,
    marginTop: SPACE.XS,
  },
  memberCount: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY,
    color: C.SUBTLE,
  },
  joinedPill: {
    backgroundColor: C.ACCENT_LITE,
    borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.SM,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: C.ACCENT,
  },
  joinedText: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.ACCENT_HOT,
  },
  ownerPill: {
    backgroundColor: C.ACCENT,
    borderColor: C.INK,
  },
  ownerText: {
    color: C.WHITE,
  },
  inviteActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },
  acceptBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.MD, paddingVertical: 3,
  },
  acceptText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_BOLD, color: C.WHITE },
  declineBtn: { paddingHorizontal: SPACE.SM, paddingVertical: 3 },
  declineText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  lockPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.SURFACE_2, borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.SM, paddingVertical: 2,
    borderWidth: 1, borderColor: C.BORDER,
  },
  lockText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.SM, paddingVertical: 3,
    borderWidth: 1,
  },
  statusOn: { backgroundColor: C.ACCENT_LITE, borderColor: C.ACCENT },
  statusOff: { backgroundColor: C.SURFACE_2, borderColor: C.BORDER },
  statusBadgeText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM },
  statusTextOn: { color: C.ACCENT_HOT },
  statusTextOff: { color: C.MUTED },
  thumbnail: {
    width: 72,
    height: 54,
    borderRadius: RADIUS.SM,
    backgroundColor: C.SURFACE_2,
    overflow: 'hidden',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailPlaceholderIcon: {
    color: C.SUBTLE,
    fontSize: 18,
  },
});
