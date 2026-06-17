import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, Modal,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchMyChannelRole, fetchChannelMembersAdmin,
  promoteMember, muteMember, unmuteMember, kickMember, banMember,
  type ChannelMemberAdmin, type ChannelRole,
} from '../../../infrastructure/supabase/queries/channels';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

const isMuted = (until: string | null) => !!until && new Date(until).getTime() > Date.now();

export default function ManageChannelMembersScreen({
  route, navigation,
}: ChannelsStackScreenProps<'ManageChannelMembers'>) {
  const { channelId, channelName } = route.params;
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [myRole, setMyRole] = useState<ChannelRole | null>(null);
  const [members, setMembers] = useState<ChannelMemberAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<ChannelMemberAdmin | null>(null);   // action sheet target
  const [muteFor, setMuteFor] = useState<ChannelMemberAdmin | null>(null); // mute-duration target
  const [hours, setHours] = useState('24');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { return; }
    try {
      const [role, list] = await Promise.all([
        fetchMyChannelRole(channelId, user.id),
        fetchChannelMembersAdmin(channelId),
      ]);
      setMyRole(role);
      setMembers(list);
    } catch (e) {
      console.error('[ManageMembers] load', e);
    } finally { setLoading(false); }
  }, [channelId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) { return members; }
    return members.filter(m =>
      m.handle.toLowerCase().includes(q) || (m.displayName ?? '').toLowerCase().includes(q));
  }, [members, query]);

  // Which actions can the viewer take on a given member.
  const perms = useCallback((m: ChannelMemberAdmin) => {
    const isMod = myRole === 'owner' || myRole === 'admin';
    const isSelf = m.userId === user?.id;
    const canModerate = isMod && !isSelf && m.role !== 'owner' && !(myRole === 'admin' && m.role === 'admin');
    const canPromote = myRole === 'owner' && !isSelf && m.role !== 'owner';
    return { canModerate, canPromote, isSelf };
  }, [myRole, user?.id]);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); setTarget(null); setMuteFor(null); await load(); }
    catch (e: any) { Alert.alert('Could not ' + label, e?.message ?? 'Please try again.'); }
    finally { setBusy(false); }
  }, [load]);

  const confirmDestructive = (title: string, msg: string, onYes: () => void) =>
    Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: title, style: 'destructive', onPress: onYes }]);

  const renderItem = ({ item }: { item: ChannelMemberAdmin }) => {
    const initial = (item.handle || '?').charAt(0).toUpperCase();
    const { canModerate, canPromote } = perms(item);
    const actionable = canModerate || canPromote;
    return (
      <TouchableOpacity
        style={s.row}
        activeOpacity={actionable ? 0.7 : 1}
        onLongPress={() => actionable && setTarget(item)}
        onPress={() => actionable && setTarget(item)}>
        {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={s.avatar} /> : (
          <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarTxt}>{initial}</Text></View>
        )}
        <View style={s.rowText}>
          <Text style={s.name} numberOfLines={1}>{item.displayName || `@${item.handle}`}</Text>
          <Text style={s.handle} numberOfLines={1}>@{item.handle}</Text>
        </View>
        {isMuted(item.mutedUntil) && <View style={s.mutedPill}><Text style={s.mutedTxt}>Muted</Text></View>}
        {item.role !== 'member' && (
          <View style={[s.rolePill, item.role === 'owner' && s.ownerPill]}>
            <Text style={s.roleTxt}>{item.role === 'owner' ? 'Owner' : 'Admin'}</Text>
          </View>
        )}
        {actionable && <Ionicons name="ellipsis-horizontal" size={18} color={C.MUTED} style={{ marginLeft: SPACE.XS }} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.container, { paddingTop: top + SPACE.SM }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-down" size={26} color={C.INK} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>Members · {channelName}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color={C.SUBTLE} />
        <TextInput
          style={s.search} value={query} onChangeText={setQuery}
          placeholder="Search members" placeholderTextColor={C.SUBTLE} autoCapitalize="none" />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.ACCENT} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={m => m.userId}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: SPACE.XXXL }}
          ListEmptyComponent={<Text style={s.empty}>{query ? 'No matches.' : 'No members yet.'}</Text>}
        />
      )}

      {/* Per-member action sheet */}
      <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => !busy && setTarget(null)}>
          <View style={s.sheet}>
            {target && (() => {
              const { canModerate, canPromote } = perms(target);
              const muted = isMuted(target.mutedUntil);
              return (
                <>
                  <Text style={s.sheetName}>{target.displayName || `@${target.handle}`}</Text>
                  {canPromote && (
                    <TouchableOpacity style={s.action} disabled={busy}
                      onPress={() => run('change role', () => promoteMember(channelId, target.userId, target.role === 'admin' ? 'member' : 'admin'))}>
                      <Ionicons name="shield-checkmark-outline" size={20} color={C.INK} />
                      <Text style={s.actionTxt}>{target.role === 'admin' ? 'Demote to member' : 'Promote to admin'}</Text>
                    </TouchableOpacity>
                  )}
                  {canModerate && (muted ? (
                    <TouchableOpacity style={s.action} disabled={busy}
                      onPress={() => run('unmute', () => unmuteMember(channelId, target.userId))}>
                      <Ionicons name="volume-high-outline" size={20} color={C.INK} />
                      <Text style={s.actionTxt}>Unmute</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={s.action} disabled={busy}
                      onPress={() => { setHours('24'); setMuteFor(target); setTarget(null); }}>
                      <Ionicons name="volume-mute-outline" size={20} color={C.INK} />
                      <Text style={s.actionTxt}>Mute (timed)…</Text>
                    </TouchableOpacity>
                  ))}
                  {canModerate && (
                    <TouchableOpacity style={s.action} disabled={busy}
                      onPress={() => confirmDestructive('Kick', `Remove @${target.handle}? They can rejoin.`,
                        () => run('kick', () => kickMember(channelId, target.userId)))}>
                      <Ionicons name="exit-outline" size={20} color={C.DANGER} />
                      <Text style={[s.actionTxt, { color: C.DANGER }]}>Kick from channel</Text>
                    </TouchableOpacity>
                  )}
                  {canModerate && (
                    <TouchableOpacity style={s.action} disabled={busy}
                      onPress={() => confirmDestructive('Ban', `Ban @${target.handle}? They can't rejoin.`,
                        () => run('ban', () => banMember(channelId, target.userId)))}>
                      <Ionicons name="ban-outline" size={20} color={C.DANGER} />
                      <Text style={[s.actionTxt, { color: C.DANGER }]}>Ban from channel</Text>
                    </TouchableOpacity>
                  )}
                  {busy && <ActivityIndicator color={C.ACCENT} style={{ marginTop: SPACE.SM }} />}
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Mute-duration input */}
      <Modal visible={!!muteFor} transparent animationType="fade" onRequestClose={() => setMuteFor(null)}>
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <Text style={s.sheetName}>Mute {muteFor ? `@${muteFor.handle}` : ''}</Text>
            <Text style={s.muteHint}>Read-only in the channel until it expires.</Text>
            <View style={s.presetRow}>
              {[1, 6, 24, 168].map(h => (
                <TouchableOpacity key={h} style={[s.preset, hours === String(h) && s.presetActive]} onPress={() => setHours(String(h))}>
                  <Text style={[s.presetTxt, hours === String(h) && s.presetTxtActive]}>{h < 24 ? `${h}h` : `${h / 24}d`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.hoursRow}>
              <TextInput style={s.hoursInput} value={hours} onChangeText={t => setHours(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad" placeholder="hours" placeholderTextColor={C.SUBTLE} />
              <Text style={s.hoursLabel}>hours</Text>
            </View>
            <View style={s.muteActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setMuteFor(null)} disabled={busy}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.muteBtn} disabled={busy || !hours}
                onPress={() => muteFor && run('mute', () => muteMember(channelId, muteFor.userId, Math.max(1, parseInt(hours, 10) || 1)))}>
                {busy ? <ActivityIndicator color={C.WHITE} size="small" /> : <Text style={s.muteBtnTxt}>Mute</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title: { flex: 1, textAlign: 'center', fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: SPACE.MD, height: 44, marginBottom: SPACE.SM },
  search: { flex: 1, color: C.INK, fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', marginTop: SPACE.XL },

  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, paddingVertical: SPACE.SM, borderBottomWidth: 1, borderBottomColor: C.BORDER },
  avatar: { width: 40, height: 40, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE_2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.ACCENT },
  avatarTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD },
  rowText: { flex: 1 },
  name: { color: C.INK, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD },
  handle: { color: C.MUTED, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY },
  mutedPill: { backgroundColor: C.SURFACE_2, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.SM, paddingVertical: 2 },
  mutedTxt: { color: C.MUTED, fontSize: 10, fontFamily: FONT.BODY_SEMIBOLD },
  rolePill: { backgroundColor: C.SURFACE_2, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.SM, paddingVertical: 2, borderWidth: 1, borderColor: C.ACCENT },
  ownerPill: { borderColor: C.GOLD },
  roleTxt: { color: C.INK, fontSize: 10, fontFamily: FONT.BODY_SEMIBOLD },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.SURFACE, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG, padding: SPACE.LG, gap: SPACE.XS },
  sheetName: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD, color: C.INK, marginBottom: SPACE.SM },
  action: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, paddingVertical: SPACE.MD },
  actionTxt: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK },

  muteHint: { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, marginBottom: SPACE.MD },
  presetRow: { flexDirection: 'row', gap: SPACE.SM, marginBottom: SPACE.MD },
  preset: { paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE_2 },
  presetActive: { borderColor: C.ACCENT, backgroundColor: C.ACCENT },
  presetTxt: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  presetTxtActive: { color: C.WHITE },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginBottom: SPACE.LG },
  hoursInput: { width: 90, backgroundColor: C.SURFACE_2, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, color: C.INK, fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD },
  hoursLabel: { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD },
  muteActions: { flexDirection: 'row', gap: SPACE.SM },
  cancelBtn: { flex: 1, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, alignItems: 'center' },
  cancelTxt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD },
  muteBtn: { flex: 1, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, backgroundColor: C.ACCENT, alignItems: 'center' },
  muteBtnTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD },
});
