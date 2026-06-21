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
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE } from '../../../theme';
import { useFeedStore } from '../../../store/feedStore';
import ConversationRow from '../../../components/conversation/ConversationRow';
import ExclusiveRail from '../../exclusive/components/ExclusiveRail';
import { useFriendConversations } from '../conversation/useFriendConversations';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

// Flowing-water wordmark: a pink↔purple gradient slides under a "drip" text mask.
const FLOW_PINK = '#FF4FA3';
const FLOW_PURPLE = '#A05CFF';
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// ── Main screen: a Messenger-style per-friend conversation list ─────────────────
export default function FeedHomeScreen({ navigation }: FeedStackScreenProps<'FeedHome'>) {
  const { top } = useSafeAreaInsets();
  const { conversations, toReactCount, loading, refreshing, refresh } = useFriendConversations();

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
        </View>
      </View>

      <ExclusiveRail
        onOpenGift={awardId => navigation.navigate('GiftReveal', { awardId })}
        onOpenCollection={collectionId => navigation.navigate('ExclusiveCollection', { collectionId })}
      />

      <FlatList
        style={styles.fill}
        data={conversations}
        keyExtractor={c => c.friendUserId}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.ACCENT} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>Add friends and share a Short to start a chat.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ConversationRow
            avatarUrl={item.avatarUrl}
            fallbackInitial={(item.displayName || item.handle || '?').charAt(0).toUpperCase()}
            title={item.displayName || `@${item.handle}`}
            subtitle={item.subtitle}
            unreadCount={item.unreadCount}
            state={item.state}
            exclusiveGlow={item.hasExclusiveDrop}
            onPress={() => navigation.navigate('FriendConversation', {
              friendUserId: item.friendUserId,
              displayName: item.displayName,
              handle: item.handle,
              avatarUrl: item.avatarUrl,
              dmChannelId: item.dmChannelId,
              threadIds: item.threadIds,
            })}
          />
        )}
      />
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
  headerLogo: { width: 48, height: 84, marginTop: -8, marginBottom: -32, pointerEvents: 'none' },
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

  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: SPACE.XL, gap: SPACE.SM },
  emptyTitle: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.INK },
  emptySubtitle: { fontSize: FONT.SIZES.MD, color: C.MUTED, textAlign: 'center' },
});
