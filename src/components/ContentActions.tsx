import React, { useState } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useBlockStore } from '../store/blockStore';
import { reportContent, type ReportTargetType } from '../infrastructure/supabase/queries/reports';

const REASONS: { key: string; label: string }[] = [
  { key: 'nudity',     label: 'Nudity or sexual content' },
  { key: 'violence',   label: 'Violence or dangerous acts' },
  { key: 'harassment', label: 'Harassment or hate' },
  { key: 'spam',       label: 'Spam or scam' },
  { key: 'other',      label: 'Something else' },
];

export interface ContentActionsProps {
  targetType: ReportTargetType;
  targetId: string;
  /** Author/owner of the content. Enables Block; omit when there's no single owner (e.g. a channel). */
  targetUserId?: string | null;
  /** @handle (without @) for display in confirmations. */
  handle?: string | null;
  /** Fires after a successful block so the host can hide/refresh the now-blocked content. */
  onBlocked?: () => void;
  /** 'icon' = ellipsis button (default) · 'inline' = labelled Report/Block buttons (profiles). */
  variant?: 'icon' | 'inline';
  /** Icon variant tint/size. */
  color?: string;
  size?: number;
}

/**
 * Shared Report + Block affordance. Drop it next to any user-generated content
 * (reactions, comments, posts, profiles). Self-contained: owns its menu/reason
 * sheet and confirmation dialogs. Hides Block on your own content.
 */
export default function ContentActions({
  targetType, targetId, targetUserId, handle, onBlocked,
  variant = 'icon', color = C.MUTED, size = 20,
}: ContentActionsProps) {
  const { user } = useAuthStore();
  const block = useBlockStore(s => s.block);
  const unblock = useBlockStore(s => s.unblock);
  const isBlocked = useBlockStore(s => (targetUserId ? s.blocked.has(targetUserId) : false));

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'menu' | 'reason'>('menu');
  const [busy, setBusy] = useState(false);

  const isSelf = !!targetUserId && targetUserId === user?.id;
  const canBlock = !!targetUserId && !isSelf;
  const who = handle ? `@${handle}` : 'this user';

  const close = () => setOpen(false);
  const openMenu = () => { setStep('menu'); setOpen(true); };
  const openReason = () => { setStep('reason'); setOpen(true); };

  const submitReport = async (reason: string) => {
    close();
    try {
      await reportContent({ targetType, targetId, reportedUserId: targetUserId ?? null, reason });
      Alert.alert(
        'Report received',
        'Thanks for flagging this. Our team reviews reports within 24 hours and removes anything that breaks our rules.',
      );
    } catch {
      Alert.alert('Couldn’t send report', 'Please try again in a moment.');
    }
  };

  const doBlock = () => {
    close();
    if (!canBlock) { return; }
    if (isBlocked) {
      Alert.alert('Unblock', `Unblock ${who}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: async () => { setBusy(true); try { await unblock(targetUserId!); } catch { Alert.alert('Couldn’t unblock', 'Please try again.'); } finally { setBusy(false); } } },
      ]);
      return;
    }
    Alert.alert('Block', `Block ${who}? You won’t see each other anywhere in the app.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await block(targetUserId!); onBlocked?.(); Alert.alert('Blocked', `You won’t see ${who} anymore.`); }
        catch { Alert.alert('Couldn’t block', 'Please try again.'); }
        finally { setBusy(false); }
      } },
    ]);
  };

  const sheet = (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {step === 'menu' ? (
            <>
              <TouchableOpacity testID="content-actions-report" style={styles.row} onPress={openReason} activeOpacity={0.8}>
                <Ionicons name="flag-outline" size={20} color={C.INK} />
                <Text style={styles.rowTxt}>Report</Text>
              </TouchableOpacity>
              {canBlock && (
                <TouchableOpacity testID="content-actions-block" style={styles.row} onPress={doBlock} activeOpacity={0.8} disabled={busy}>
                  <Ionicons name={isBlocked ? 'lock-open-outline' : 'ban-outline'} size={20} color={C.DANGER} />
                  <Text style={[styles.rowTxt, { color: C.DANGER }]}>{isBlocked ? `Unblock ${who}` : `Block ${who}`}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.row, styles.cancel]} onPress={close} activeOpacity={0.8}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>Why are you reporting this?</Text>
              {REASONS.map(r => (
                <TouchableOpacity key={r.key} testID={`content-actions-reason-${r.key}`} style={styles.row} onPress={() => submitReport(r.key)} activeOpacity={0.8}>
                  <Text style={styles.rowTxt}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.row, styles.cancel]} onPress={close} activeOpacity={0.8}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  if (variant === 'inline') {
    return (
      <View style={styles.inlineRow}>
        <TouchableOpacity style={styles.inlineBtn} onPress={openReason} activeOpacity={0.85}>
          <Ionicons name="flag-outline" size={16} color={C.INK} />
          <Text style={styles.inlineTxt}>Report</Text>
        </TouchableOpacity>
        {canBlock && (
          <TouchableOpacity style={styles.inlineBtn} onPress={doBlock} activeOpacity={0.85} disabled={busy}>
            <Ionicons name={isBlocked ? 'lock-open-outline' : 'ban-outline'} size={16} color={C.DANGER} />
            <Text style={[styles.inlineTxt, { color: C.DANGER }]}>{isBlocked ? 'Unblock' : 'Block'}</Text>
          </TouchableOpacity>
        )}
        {sheet}
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity testID="content-actions-trigger" onPress={openMenu} hitSlop={10} accessibilityLabel="More options" accessibilityRole="button">
        <Ionicons name="ellipsis-horizontal" size={size} color={color} />
      </TouchableOpacity>
      {sheet}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.BG_SOLID, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    paddingTop: SPACE.SM, paddingBottom: SPACE.XXL, paddingHorizontal: SPACE.SM,
    borderTopWidth: 1, borderColor: C.BORDER,
  },
  title: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM, paddingHorizontal: SPACE.MD, paddingTop: SPACE.SM, paddingBottom: SPACE.XS },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.MD, borderRadius: RADIUS.MD },
  rowTxt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  cancel: { justifyContent: 'center', marginTop: SPACE.XS },
  cancelTxt: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  inlineRow: { flexDirection: 'row', gap: SPACE.SM },
  inlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.FULL,
    paddingVertical: SPACE.SM, paddingHorizontal: SPACE.LG,
  },
  inlineTxt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
});
