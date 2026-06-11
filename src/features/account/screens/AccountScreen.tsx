import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Switch,
  Linking,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import { useAuthStore } from '../../../store/authStore';
import { useOAuthStore } from '../../../store/oauthStore';
import {
  fetchSyncedAccounts,
  syncOAuthCode,
  setSyncedAccountEnabled,
  disconnectSyncedAccount,
  type SyncedAccount,
} from '../../../infrastructure/supabase/queries/syncedAccounts';
import { refreshConnectedFeed } from '../../../infrastructure/supabase/queries/connectedFeed';
import { buildAuthUrl, type SyncProvider, type ConnectionType } from '../../../infrastructure/oauth/config';
import { useOnboardingStore } from '../../onboarding/onboarding';
import type { AccountStackScreenProps } from '../../../app/navigation/types';
import ChannelSettingsSheet from '../../channels/components/ChannelSettingsSheet';
import { fetchMyCreatorChannel, type MyCreatorChannel } from '../../../infrastructure/supabase/queries/channels';

const PROVIDERS: { key: SyncProvider; label: string }[] = [
  { key: 'youtube', label: 'YouTube' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
];

// Personal-feed connections (powers the "For You" grid). YouTube only for now.
const FEED_PROVIDERS: { key: SyncProvider; label: string }[] = [
  { key: 'youtube', label: 'YouTube' },
];

export default function AccountScreen({ navigation }: AccountStackScreenProps<'AccountHome'>) {
  const { top } = useSafeAreaInsets();
  const { profile, user, setProfile, signOut } = useAuthStore();
  const startReplay = useOnboardingStore(s => s.startReplay);
  const [signingOut, setSigningOut] = useState(false);
  const [phone, setPhone] = useState((profile as any)?.phone ?? '');
  const [savingPhone, setSavingPhone] = useState(false);

  const phoneDirty = phone.trim() !== ((profile as any)?.phone ?? '');

  // ── Creator mode ────────────────────────────────────────────────────────────
  const isCreator = !!(profile as any)?.is_creator;
  const [savingCreator, setSavingCreator] = useState(false);
  const [creatorChannel, setCreatorChannel] = useState<MyCreatorChannel | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleToggleCreator = (next: boolean) => {
    if (!user?.id || savingCreator) { return; }
    const apply = async () => {
      setSavingCreator(true);
      const { error } = await (supabase as any).from('users').update({ is_creator: next }).eq('id', user.id);
      setSavingCreator(false);
      if (error) { Alert.alert('Error', 'Could not update creator mode.'); return; }
      if (profile) { setProfile({ ...(profile as any), is_creator: next }); }
      loadSynced();
    };
    // Turning OFF removes the public channel — confirm first; Cancel leaves it on.
    if (!next) {
      Alert.alert(
        'Turn off creator mode?',
        'Your Members Only channel will be removed from the public Channels screen. Turn creator mode back on anytime to restore it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn Off', style: 'destructive', onPress: apply },
        ],
      );
      return;
    }
    apply();
  };

  // ── Synced accounts (creator connections + personal feed connections) ────────
  const [synced, setSynced] = useState<SyncedAccount[]>([]);       // connection_type 'creator'
  const [feedAccounts, setFeedAccounts] = useState<SyncedAccount[]>([]); // 'feed'
  const [syncing, setSyncing] = useState(false);
  const [syncingType, setSyncingType] = useState<ConnectionType | null>(null);
  const { pending, clearPending } = useOAuthStore();

  const loadSynced = useCallback(async () => {
    if (!user?.id) { return; }
    try { setSynced(await fetchSyncedAccounts(user.id, 'creator')); } catch { /* ignore */ }
    try { setFeedAccounts(await fetchSyncedAccounts(user.id, 'feed')); } catch { /* ignore */ }
    try { setCreatorChannel(await fetchMyCreatorChannel(user.id)); } catch { /* ignore */ }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadSynced(); }, [loadSynced]));

  // Open the provider auth in the system browser (providers block embedded WebViews).
  const handleConnect = (provider: SyncProvider, connectionType: ConnectionType = 'creator') => {
    Linking.openURL(buildAuthUrl(provider, connectionType).url).catch(() =>
      Alert.alert('Error', 'Could not open the login page.'));
  };

  // The oauth-callback deep link lands here via the store → run the sync.
  useEffect(() => {
    if (!pending) { return; }
    const { provider, connectionType, code, error } = pending;
    clearPending();
    const label = PROVIDERS.find(p => p.key === provider)?.label ?? 'Account';
    // Provider rejected the request (e.g. unauthorized scope) — no code came back.
    if (error || !code) {
      Alert.alert(
        `Couldn't connect ${label}`,
        error ?? 'The login was cancelled or returned no authorization code.',
      );
      return;
    }
    setSyncing(true);
    setSyncingType(connectionType);
    syncOAuthCode(provider, code, connectionType)
      .then(async () => {
        // A feed connection has no content yet — kick off the first pull now.
        if (connectionType === 'feed') { await refreshConnectedFeed(provider).catch(() => {}); }
        await loadSynced();
      })
      .catch((e: any) => Alert.alert('Sync failed', e?.message ?? 'Could not connect account.'))
      .finally(() => { setSyncing(false); setSyncingType(null); });
  }, [pending, clearPending, loadSynced]);

  const handleToggleEnabled = async (acct: SyncedAccount) => {
    setSynced(prev => prev.map(a => a.id === acct.id ? { ...a, enabled: !a.enabled } : a));
    try { await setSyncedAccountEnabled(acct.id, !acct.enabled); } catch { loadSynced(); }
  };

  const handleDisconnect = (acct: SyncedAccount) => {
    const provLabel = acct.provider === 'tiktok' ? 'TikTok' : acct.provider === 'instagram' ? 'Instagram' : 'YouTube';
    Alert.alert('Disconnect', `Disconnect ${provLabel}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          try { await disconnectSyncedAccount(acct.id); await loadSynced(); }
          catch { Alert.alert('Error', 'Could not disconnect.'); }
        },
      },
    ]);
  };

  const handleSavePhone = async () => {
    if (!user?.id || !phoneDirty) { return; }
    setSavingPhone(true);
    const next = phone.trim() || null;
    const { error } = await (supabase as any)
      .from('users')
      .update({ phone: next })
      .eq('id', user.id);
    setSavingPhone(false);
    if (error) { Alert.alert('Error', 'Could not save phone number.'); return; }
    if (profile) { setProfile({ ...(profile as any), phone: next }); }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await supabase.auth.signOut();
          signOut();
        },
      },
    ]);
  };

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? '?';
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: top + SPACE.LG }]}>
      {/* Avatar — tap to edit profile */}
      <TouchableOpacity style={styles.avatarWrap} activeOpacity={0.85} onPress={() => navigation.navigate('EditProfile')}>
        {(profile as any)?.avatar_url ? (
          <Image source={{ uri: (profile as any).avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
        <Text style={styles.displayName}>{profile?.display_name ?? '—'}</Text>
        <Text style={styles.handle}>@{profile?.handle ?? '—'}</Text>
        {!!(profile as any)?.bio && (
          <Text style={styles.bio} numberOfLines={2}>{(profile as any).bio}</Text>
        )}
        {!!(profile as any)?.location && (
          <Text style={styles.location}>📍 {(profile as any).location}</Text>
        )}
        {memberSince && (
          <Text style={styles.since}>Member since {memberSince}</Text>
        )}
        <Text style={styles.editLink}>Edit profile</Text>
      </TouchableOpacity>

      {/* Phone (optional) */}
      <Text style={styles.sectionLabel}>Phone (optional)</Text>
      <View style={styles.section}>
        <View style={styles.phoneRow}>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="Add phone number"
            placeholderTextColor={C.SUBTLE}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
          {phoneDirty && (
            <TouchableOpacity style={styles.saveBtn} onPress={handleSavePhone} disabled={savingPhone}>
              {savingPhone
                ? <ActivityIndicator color={C.WHITE} size="small" />
                : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Creator mode */}
      <Text style={styles.sectionLabel}>Creator</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.syncInfo}>
            <Text style={styles.rowLabel}>Creator mode</Text>
            <Text style={styles.syncHandle} numberOfLines={2}>
              Open a public “Members Only” channel from your connected accounts.
            </Text>
          </View>
          <Switch
            value={isCreator}
            onValueChange={handleToggleCreator}
            disabled={savingCreator}
            trackColor={{ true: C.ACCENT, false: C.BORDER }}
          />
        </View>

        {isCreator && creatorChannel && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => setSettingsOpen(true)}>
              <View style={styles.syncInfo}>
                <Text style={styles.rowLabel}>Channel Settings</Text>
                <Text style={styles.syncHandle} numberOfLines={2}>
                  Public visibility, invite-only, rename and more.
                </Text>
              </View>
              <Text style={styles.settingsCog}>⚙</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Connected accounts (creator) — only when creator mode is on */}
      {isCreator && (
        <>
          <Text style={styles.sectionLabel}>Creator Accounts</Text>
          <Text style={styles.sectionHint}>
            Enable an account to open a public “Members Only” channel under your handle, so people can react to your videos.
          </Text>
          <View style={styles.section}>
            {PROVIDERS.map(({ key, label }, i) => {
              const acct = synced.find(a => a.provider === key);
              return (
                <View key={key}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={styles.syncLeft}>
                      {acct?.provider_avatar_url ? (
                        <Image source={{ uri: acct.provider_avatar_url }} style={styles.syncAvatar} />
                      ) : null}
                      <View style={styles.syncInfo}>
                        <Text style={styles.rowLabel}>{label}</Text>
                        {acct ? (
                          <Text style={styles.syncHandle} numberOfLines={1}>
                            {acct.provider_display_name
                              || (acct.provider_handle ? `@${acct.provider_handle}` : 'Connected')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {acct ? (
                      <View style={styles.syncRight}>
                        <Switch
                          value={acct.enabled}
                          onValueChange={() => handleToggleEnabled(acct)}
                          trackColor={{ true: C.ACCENT, false: C.BORDER }}
                        />
                        <TouchableOpacity onPress={() => handleDisconnect(acct)} hitSlop={8}>
                          <Text style={styles.syncDisconnect}>Disconnect</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.connectBtn}
                        onPress={() => handleConnect(key)}
                        disabled={syncing}>
                        <Text style={styles.connectBtnText}>Connect</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
            {syncing && syncingType === 'creator' && (
              <View style={styles.syncingRow}>
                <ActivityIndicator color={C.ACCENT} size="small" />
                <Text style={styles.syncingText}>Syncing…</Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* For You sources (personal feed) */}
      <Text style={styles.sectionLabel}>For You Sources</Text>
      <Text style={styles.sectionHint}>
        Connect an account to pull your feed (e.g. YouTube Liked videos) into the “For You” tab when sharing.
      </Text>
      <View style={styles.section}>
        {FEED_PROVIDERS.map(({ key, label }, i) => {
          const acct = feedAccounts.find(a => a.provider === key);
          return (
            <View key={key}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <View style={styles.syncLeft}>
                  {acct?.provider_avatar_url ? (
                    <Image source={{ uri: acct.provider_avatar_url }} style={styles.syncAvatar} />
                  ) : null}
                  <View style={styles.syncInfo}>
                    <Text style={styles.rowLabel}>{label}</Text>
                    {acct ? (
                      <Text style={styles.syncHandle} numberOfLines={1}>
                        {acct.provider_display_name
                          || (acct.provider_handle ? `@${acct.provider_handle}` : 'Connected')}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {acct ? (
                  <TouchableOpacity onPress={() => handleDisconnect(acct)} hitSlop={8}>
                    <Text style={styles.syncDisconnect}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.connectBtn}
                    onPress={() => handleConnect(key, 'feed')}
                    disabled={syncing}>
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        {syncing && syncingType === 'feed' && (
          <View style={styles.syncingRow}>
            <ActivityIndicator color={C.ACCENT} size="small" />
            <Text style={styles.syncingText}>Syncing…</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('InviteManagement')}>
          <Text style={styles.rowLabel}>Invite Codes</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('PasswordSetup')}>
          <Text style={styles.rowLabel}>Password Login</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.row} onPress={() => startReplay()}>
          <Text style={styles.rowLabel}>How it works</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.row, styles.rowDanger]}
          onPress={handleSignOut}
          disabled={signingOut}>
          <Text style={styles.rowLabelDanger}>
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </Text>
        </TouchableOpacity>
      </View>

      {creatorChannel && (
        <ChannelSettingsSheet
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          channelId={creatorChannel.id}
          title={creatorChannel.title}
          inviteOnly={creatorChannel.inviteOnly}
          isListed={creatorChannel.isListed}
          onInviteOnlyChange={v => setCreatorChannel(c => (c ? { ...c, inviteOnly: v } : c))}
          onListedChange={v => setCreatorChannel(c => (c ? { ...c, isListed: v } : c))}
          onTitleChange={t => setCreatorChannel(c => (c ? { ...c, title: t } : c))}
          onPostVideo={() => (navigation as any).navigate('Channels', { screen: 'AddChannelVideo', params: { channelId: creatorChannel.id } })}
          onReviews={() => (navigation as any).navigate('Channels', { screen: 'ChannelReviews', params: { channelId: creatorChannel.id, channelName: creatorChannel.title } })}
          onInvitePeople={() => (navigation as any).navigate('Channels', { screen: 'InviteToChannel', params: { channelId: creatorChannel.id, channelName: creatorChannel.title } })}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  content: { padding: SPACE.LG, paddingTop: SPACE.LG },
  avatarWrap: { alignItems: 'center', paddingVertical: SPACE.XXL, gap: SPACE.SM },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_LITE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.ACCENT,
    marginBottom: SPACE.SM,
  },
  avatarText: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  displayName: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  handle: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY },
  since: { fontSize: FONT.SIZES.SM, color: C.SUBTLE, fontFamily: FONT.BODY },
  bio: { fontSize: FONT.SIZES.SM, color: C.INK, fontFamily: FONT.BODY, textAlign: 'center', marginTop: SPACE.XS, marginHorizontal: SPACE.LG, lineHeight: 19 },
  location: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY },
  editLink: { fontSize: FONT.SIZES.SM, color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD, marginTop: SPACE.SM },
  section: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    marginBottom: SPACE.MD,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  divider: { height: 1, backgroundColor: C.BORDER, marginHorizontal: SPACE.LG },
  settingsCog: { fontSize: 22, color: C.MUTED },
  sectionLabel: {
    fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: SPACE.SM, marginLeft: SPACE.XS,
  },
  sectionHint: {
    fontSize: FONT.SIZES.XS, color: C.SUBTLE, fontFamily: FONT.BODY,
    marginBottom: SPACE.SM, marginLeft: SPACE.XS, marginRight: SPACE.SM, lineHeight: 16,
  },
  syncLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, flex: 1 },
  syncAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.SURFACE_2 },
  syncInfo: { gap: 2, flex: 1 },
  syncHandle: { fontSize: FONT.SIZES.XS, color: C.MUTED, fontFamily: FONT.BODY },
  syncRight: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD },
  syncDisconnect: { fontSize: FONT.SIZES.SM, color: C.DANGER, fontFamily: FONT.BODY_MEDIUM, marginLeft: SPACE.SM },
  connectBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM,
  },
  connectBtnText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD },
  syncingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, padding: SPACE.LG },
  syncingText: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY },
  phoneRow: { flexDirection: 'row', alignItems: 'center', padding: SPACE.LG, gap: SPACE.MD },
  phoneInput: { flex: 1, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.INK },
  saveBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, minWidth: 56, alignItems: 'center',
  },
  saveBtnText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACE.LG,
  },
  rowDanger: { justifyContent: 'center' },
  rowLabel: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK },
  rowLabelDanger: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.DANGER },
  rowChevron: { fontSize: FONT.SIZES.LG, color: C.MUTED },
});
