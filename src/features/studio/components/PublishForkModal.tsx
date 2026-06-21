import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';

const BRAND = ['#FF4FA3', '#A05CFF', '#3B82F6'];

// The publish-time "fork in the road" shown to creator-account users at the last step. Path A (share
// with friends → Supabase storage + p2p) is always available; Path B (post to a channel → Bunny
// streaming) is unlocked only for select creators (`creator_studio`). Common users never see this —
// they go straight to Path A — so this modal is only mounted for `is_creator` users.
export default function PublishForkModal({
  visible, canCreate, onPickFriends, onPickChannel, onClose,
}: {
  visible: boolean;
  canCreate: boolean;       // creator_studio — gates Path B
  onPickFriends: () => void;
  onPickChannel: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} supportedOrientations={['portrait']}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* stop taps inside the sheet from dismissing */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Where to post?</Text>
          <Text style={styles.sub}>Choose how this video gets out.</Text>

          {/* Path A — friends (always available) */}
          <TouchableOpacity style={styles.card} onPress={onPickFriends} activeOpacity={0.85}>
            <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardIcon}>
              <Ionicons name="people" size={22} color={C.WHITE} />
            </LinearGradient>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Share with friends</Text>
              <Text style={styles.cardSub}>Hosted on Vidrip and sent to the friends you pick.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.SUBTLE} />
          </TouchableOpacity>

          {/* Path B — channel (creator_studio only) */}
          <TouchableOpacity
            style={[styles.card, !canCreate && styles.cardLocked]}
            onPress={() => { if (canCreate) { onPickChannel(); } }}
            activeOpacity={canCreate ? 0.85 : 1}>
            <View style={[styles.cardIcon, styles.cardIconChannel, !canCreate && styles.cardIconLocked]}>
              <Ionicons name={canCreate ? 'tv' : 'lock-closed'} size={22} color={canCreate ? C.WHITE : C.SUBTLE} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, !canCreate && styles.cardTitleLocked]}>Post to a channel</Text>
              <Text style={styles.cardSub}>
                {canCreate
                  ? 'Streamed to your channel and subscribers.'
                  : 'Streaming channels are available to select creators.'}
              </Text>
            </View>
            {canCreate
              ? <Ionicons name="chevron-forward" size={18} color={C.SUBTLE} />
              : <View style={styles.soonPill}><Text style={styles.soonPillTxt}>Locked</Text></View>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    paddingHorizontal: SPACE.LG, paddingTop: SPACE.SM, paddingBottom: SPACE.XXL,
    borderTopWidth: 1, borderColor: C.BORDER,
  },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: C.BORDER_STRONG, marginBottom: SPACE.LG },
  title: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, fontWeight: '700', color: C.INK },
  sub: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, marginTop: 2, marginBottom: SPACE.LG },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.MD, marginBottom: SPACE.MD,
  },
  cardLocked: { opacity: 0.7 },
  cardIcon: { width: 46, height: 46, borderRadius: RADIUS.MD, alignItems: 'center', justifyContent: 'center' },
  cardIconChannel: { backgroundColor: C.ACCENT_LITE },
  cardIconLocked: { backgroundColor: C.SURFACE_2 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD, fontWeight: '700', color: C.INK },
  cardTitleLocked: { color: C.MUTED },
  cardSub: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, marginTop: 2 },

  soonPill: { backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.SM, paddingVertical: 3 },
  soonPillTxt: { fontSize: 10, fontFamily: FONT.BODY_BOLD, fontWeight: '700', color: C.SUBTLE, textTransform: 'uppercase', letterSpacing: 1 },

  cancel: { alignItems: 'center', paddingVertical: SPACE.MD, marginTop: SPACE.XS },
  cancelTxt: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, fontWeight: '600', color: C.MUTED },
});
