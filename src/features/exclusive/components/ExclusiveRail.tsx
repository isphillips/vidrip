import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchMyAwardedCollections, fetchUnopenedAwards, type AwardedCollection, type AwardGift,
} from '../../../infrastructure/exclusive/api';

const FLOW = ['#FF4FA3', '#A05CFF', '#2DD4BF'];

// Horizontal "Exclusive Content" rail for the feed home. Shows unopened gifts first (tap → reveal),
// then awarded collections (tap → open). Renders nothing when the user has no exclusive content.
export default function ExclusiveRail({ onOpenGift, onOpenCollection }: {
  onOpenGift: (awardId: string) => void;
  onOpenCollection: (collectionId: string) => void;
}) {
  const userId = useAuthStore(s => s.user?.id);
  const [collections, setCollections] = useState<AwardedCollection[]>([]);
  const [gifts, setGifts] = useState<AwardGift[]>([]);
  // Covers that failed to load (e.g. a thumbnail URL the recipient can't read) → fall back to the
  // grey diamond placeholder instead of an empty box.
  const [brokenCovers, setBrokenCovers] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [c, g] = await Promise.all([fetchMyAwardedCollections(), fetchUnopenedAwards()]);
      setCollections(c); setGifts(g);
    } catch { /* feed degrades silently */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live surfacing: a newly delivered award (push or scheduled drop) shows up in the rail without a
  // refresh. RLS limits collection_awards to the viewer's own rows, so the filter is belt-and-suspenders.
  useEffect(() => {
    if (!userId) { return; }
    const ch = supabase.channel(`awards-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'collection_awards', filter: `user_id=eq.${userId}` },
        () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  if (collections.length === 0 && gifts.length === 0) { return null; }
  // One tile per collection: dedupe by collection id so re-delivering (or any stray duplicate award
  // row) can't render the same collection twice.
  const giftIds = new Set(gifts.map(g => g.collectionId));
  const seenGift = new Set<string>();
  const uniqueGifts = gifts.filter(g => (seenGift.has(g.collectionId) ? false : (seenGift.add(g.collectionId), true)));
  const seenCol = new Set<string>();
  const awarded = collections.filter(c => !giftIds.has(c.id) && (seenCol.has(c.id) ? false : (seenCol.add(c.id), true)));

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Ionicons name="diamond-outline" size={14} color={C.ACCENT_HOT} />
        <Text style={styles.heading}>Exclusive Content</Text>
        {uniqueGifts.length > 0 && <View style={styles.newDot}><Text style={styles.newDotTxt}>{uniqueGifts.length}</Text></View>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {/* Unopened gifts */}
        {uniqueGifts.map(g => (
          <TouchableOpacity key={`gift-${g.awardId}`} style={styles.tile} activeOpacity={0.85} onPress={() => onOpenGift(g.awardId)}>
            <LinearGradient colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.giftCover}>
              <Ionicons name="gift" size={30} color={C.WHITE} />
              <View style={styles.newBadge}><Text style={styles.newBadgeTxt}>NEW</Text></View>
            </LinearGradient>
            <Text style={styles.tileName} numberOfLines={1}>{g.collectionName}</Text>
            <Text style={styles.tileSub} numberOfLines={1}>{g.creatorName}</Text>
          </TouchableOpacity>
        ))}
        {/* Awarded collections (skip those still shown as an unopened gift) */}
        {awarded.map(c => (
          <TouchableOpacity key={c.id} style={styles.tile} activeOpacity={0.85} onPress={() => onOpenCollection(c.id)}>
            {c.coverUrl && !brokenCovers.has(c.id)
              ? <Image source={{ uri: c.coverUrl }} style={styles.cover} resizeMode="cover"
                  onError={() => setBrokenCovers(prev => { const n = new Set(prev); n.add(c.id); return n; })} />
              : <View style={[styles.cover, styles.coverEmpty]}><Ionicons name="diamond-outline" size={24} color={C.SUBTLE} /></View>}
            <Text style={styles.tileName} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.tileSub} numberOfLines={1}>{c.channelName}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const COVER = 108;
const styles = StyleSheet.create({
  wrap:      { paddingTop: SPACE.SM, paddingBottom: SPACE.XS },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACE.MD, marginBottom: SPACE.SM },
  heading:   { color: C.INK, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.SM, letterSpacing: 0.3 },
  newDot:    { backgroundColor: C.ACCENT_HOT, borderRadius: RADIUS.FULL, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  newDotTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: 10 },
  row:       { paddingHorizontal: SPACE.MD, gap: SPACE.SM },
  tile:      { width: COVER, gap: 4 },
  cover:     { width: COVER, height: COVER, borderRadius: RADIUS.MD, backgroundColor: C.SURFACE_2 },
  coverEmpty:{ alignItems: 'center', justifyContent: 'center' },
  giftCover: { width: COVER, height: COVER, borderRadius: RADIUS.MD, alignItems: 'center', justifyContent: 'center' },
  newBadge:  { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: RADIUS.FULL, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeTxt:{ color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: 9, letterSpacing: 0.5 },
  tileName:  { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.XS },
  tileSub:   { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: 11 },
});
