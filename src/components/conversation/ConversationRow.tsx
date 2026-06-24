import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import ExclusiveGlow from './ExclusiveGlow';
import DrippyEyes from '../DrippyEyes';
import { rowStateStyle, type RowState } from './useRowState';

// Generalized messenger-style conversation row, shared by the Feed (per-friend) and
// Channels (per-channel) lists. Dumb/presentational — it never knows friend vs channel.
// Visual state (teal unread / purple unreplied / grey caught-up / gold exclusive) is
// driven entirely by `state` + `exclusiveGlow` via rowStateStyle / <ExclusiveGlow>.
export type ConversationRowProps = {
  avatarUrl?: string | null;
  fallbackInitial: string;
  // Replaces the avatar slot entirely (e.g. GroupAvatarGrid for group chats).
  customAvatar?: React.ReactNode;
  title: string;
  subtitle?: string | null;
  unreadCount?: number;
  state: RowState;
  exclusiveGlow?: boolean;
  thumbnail?: string | null;
  onPress: () => void;
  onLongPress?: () => void;
  // Optional trailing slot (e.g. invite Accept/Decline) rendered in place of the thumbnail.
  trailing?: React.ReactNode;
  // Show Drippy's animated eyes before the subtitle (the "waiting for your reaction" cue).
  eyes?: boolean;
  // Last-activity stamp shown top-right of the row (e.g. "3:30 PM", "Mon", "Jun 17").
  timestamp?: string;
};

export default function ConversationRow({
  avatarUrl,
  fallbackInitial,
  customAvatar,
  title,
  subtitle,
  unreadCount = 0,
  state,
  exclusiveGlow = false,
  thumbnail,
  onPress,
  onLongPress,
  trailing,
  eyes = false,
  timestamp,
}: ConversationRowProps) {
  const s = rowStateStyle(state, exclusiveGlow);
  const showBadge = unreadCount > 0 && (s.badge != null || exclusiveGlow);
  // Caught-up friends keep full opacity (the dim treatment read too dark in the Feed);
  // the unread/unreplied accent borders still distinguish active conversations.
  const container = { ...s.container, opacity: 1 };

  return (
    <ExclusiveGlow active={exclusiveGlow}>
      <TouchableOpacity
        style={[styles.card, container]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        activeOpacity={0.85}>
        <View style={styles.body}>
          <View>
            {customAvatar ? customAvatar : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLetter}>{fallbackInitial}</Text>
              </View>
            )}
            {showBadge && (
              <View style={[styles.badge, s.badgeBg]}>
                <Text style={[styles.badgeText, s.badge]}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.meta}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, styles.titleFlex]} numberOfLines={1}>{title}</Text>
              {timestamp ? <Text style={styles.timestamp}>{timestamp}</Text> : null}
            </View>
            {subtitle ? (
              <View style={styles.subtitleRow}>
                {eyes ? <DrippyEyes size={11} /> : null}
                <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
              </View>
            ) : null}
          </View>

          {trailing
            ? trailing
            : thumbnail ? (
              <Image source={{ uri: thumbnail }} style={styles.thumbnail} resizeMode="cover" />
            ) : null}
        </View>
      </TouchableOpacity>
    </ExclusiveGlow>
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
  body: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD },
  meta: { flex: 1, gap: SPACE.XS },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.SURFACE_2 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.ACCENT_LITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.ACCENT,
  },
  avatarLetter: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.SURFACE,
  },
  badgeText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_BOLD },
  title: { fontSize: FONT.SIZES.MD, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },
  titleFlex: { flex: 1 },
  timestamp: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.SUBTLE },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subtitle: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  thumbnail: {
    width: 56, height: 56, borderRadius: RADIUS.SM,
    backgroundColor: C.SURFACE_2, overflow: 'hidden',
  },
});
