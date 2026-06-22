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
  Modal,
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
  connectFacebook,
  resumeFacebookPages,
  importFacebookPage,
  setSyncedAccountEnabled,
  disconnectSyncedAccount,
  type SyncedAccount,
  type FacebookPage,
} from '../../../infrastructure/supabase/queries/syncedAccounts';
import { refreshConnectedFeed } from '../../../infrastructure/supabase/queries/connectedFeed';
import { buildAuthUrl, type SyncProvider, type ConnectionType } from '../../../infrastructure/oauth/config';
import { useOnboardingStore } from '../../onboarding/onboarding';
import AccountBlob from '../../../components/AccountBlob';
import type { AccountStackScreenProps } from '../../../app/navigation/types';
import ChannelSettingsSheet from '../../channels/components/ChannelSettingsSheet';
import {
  fetchMyCreatorChannel,
  fetchMySubscriptions,
  cancelChannelSubscription,
  resumeChannelSubscription,
  type MyCreatorChannel,
  type MySubscription,
} from '../../../infrastructure/supabase/queries/channels';

const PROVIDERS: { key: SyncProvider; label: string }[] = [
  { key: 'youtube', label: 'YouTube' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
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
  const [subs, setSubs] = useState<MySubscription[]>([]);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
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

  // Privacy toggles and Two-Factor now live on the Advanced screen.

  // ── Synced accounts (creator connections + personal feed connections) ────────
  const [synced, setSynced] = useState<SyncedAccount[]>([]);       // connection_type 'creator'
  const [feedAccounts, setFeedAccounts] = useState<SyncedAccount[]>([]); // 'feed'
  const [syncing, setSyncing] = useState(false);
  const [syncingType, setSyncingType] = useState<ConnectionType | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<SyncProvider | null>(null);
  const { pending, clearPending } = useOAuthStore();

  // Facebook reels live on a Page, so connecting returns the user's Pages for a
  // picker; selecting one imports that Page's reels (phase 2).
  const [fbPages, setFbPages] = useState<FacebookPage[] | null>(null);
  const [fbConnType, setFbConnType] = useState<ConnectionType>('creator');
  const [importingPageId, setImportingPageId] = useState<string | null>(null);
  const [resumingFbId, setResumingFbId] = useState<string | null>(null);

  const loadSynced = useCallback(async () => {
    if (!user?.id) { return; }
    try { setSynced(await fetchSyncedAccounts(user.id, 'creator')); } catch { /* ignore */ }
    try { setFeedAccounts(await fetchSyncedAccounts(user.id, 'feed')); } catch { /* ignore */ }
    try { setCreatorChannel(await fetchMyCreatorChannel(user.id)); } catch { /* ignore */ }
    try { setSubs(await fetchMySubscriptions(user.id)); } catch { /* ignore */ }
  }, [user?.id]);

  const handleUnsubscribe = (sub: MySubscription) => {
    Alert.alert(
      `Unsubscribe from ${sub.name}?`,
      'Your subscription will end at the close of the current billing period — you keep access until then.',
      [
        { text: 'Keep subscription', style: 'cancel' },
        {
          text: 'Unsubscribe', style: 'destructive', onPress: async () => {
            setCancelingId(sub.channelId);
            try { await cancelChannelSubscription(sub.channelId); await loadSynced(); }
            catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not cancel.'); }
            finally { setCancelingId(null); }
          },
        },
      ],
    );
  };

  const handleResume = async (sub: MySubscription) => {
    setCancelingId(sub.channelId);
    try { await resumeChannelSubscription(sub.channelId); await loadSynced(); }
    catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not resume.'); }
    finally { setCancelingId(null); }
  };

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
    setSyncingProvider(provider);
    // Facebook is two-phase: exchange the code for the user's Pages, then let them
    // pick which Page to import reels from (handled by the picker modal below).
    if (provider === 'facebook') {
      connectFacebook(code, connectionType)
        .then(async (pages) => {
          // The pending connection now exists server-side — reflect it so the row shows
          // "Choose Page" if the user dismisses the picker without selecting one.
          await loadSynced();
          if (!pages.length) {
            Alert.alert(
              'No Pages found',
              "We couldn't find any Facebook Pages you manage. Reels are imported from a Page, so you'll need one to connect.",
            );
            return;
          }
          setFbConnType(connectionType);
          setFbPages(pages);
        })
        .catch((e: any) => Alert.alert("Couldn't connect Facebook", e?.message ?? 'Could not connect account.'))
        .finally(() => { setSyncing(false); setSyncingType(null); setSyncingProvider(null); });
      return;
    }
    syncOAuthCode(provider, code, connectionType)
      .then(async () => {
        // A feed connection has no content yet — kick off the first pull now.
        if (connectionType === 'feed') { await refreshConnectedFeed(provider).catch(() => {}); }
        await loadSynced();
      })
      .catch((e: any) => Alert.alert('Sync failed', e?.message ?? 'Could not connect account.'))
      .finally(() => { setSyncing(false); setSyncingType(null); setSyncingProvider(null); });
  }, [pending, clearPending, loadSynced]);

  // Reopen the picker for a pending Facebook connection (connected but no Page chosen
  // yet) — re-lists Pages from the stashed token, no reconnect needed.
  const handleResumeFacebook = (acct: SyncedAccount) => {
    setResumingFbId(acct.id);
    resumeFacebookPages(acct.connection_type)
      .then((pages) => {
        if (!pages.length) {
          Alert.alert('No Pages found', "We couldn't find any Facebook Pages you manage.");
          return;
        }
        setFbConnType(acct.connection_type);
        setFbPages(pages);
      })
      .catch((e: any) => Alert.alert("Couldn't load Pages", e?.message ?? 'Please reconnect and try again.'))
      .finally(() => setResumingFbId(null));
  };

  // Phase 2: import the chosen Facebook Page's reels.
  const handleSelectFacebookPage = (page: FacebookPage) => {
    setImportingPageId(page.id);
    importFacebookPage(page.id, fbConnType)
      .then(async () => { setFbPages(null); await loadSynced(); })
      .catch((e: any) => Alert.alert('Import failed', e?.message ?? 'Could not import this Page.'))
      .finally(() => setImportingPageId(null));
  };

  const handleToggleEnabled = async (acct: SyncedAccount) => {
    setSynced(prev => prev.map(a => a.id === acct.id ? { ...a, enabled: !a.enabled } : a));
    try { await setSyncedAccountEnabled(acct.id, !acct.enabled); } catch { loadSynced(); }
  };

  const handleDisconnect = (acct: SyncedAccount) => {
    const provLabel = PROVIDERS.find(p => p.key === acct.provider)?.label ?? acct.provider;
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
    <View style={styles.screen}>
      <View style={[styles.navbar, { paddingTop: top + SPACE.MD }]}>
        <Text style={styles.navTitle}>Account</Text>
        <View style={styles.navActions}><AccountBlob size={34} active /></View>
      </View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {/* Liked sources (personal feed) */}
      <Text style={styles.sectionLabel}>Liked Sources</Text>
      <Text style={styles.sectionHint}>
        Connect an account to pull your feed (e.g. YouTube Liked videos) into the “Liked” tab when sharing.
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
              // A Facebook account connected but with no Page chosen yet (null handle).
              const fbPending = !!acct && acct.provider === 'facebook' && !acct.provider_handle;
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
                            {fbPending
                              ? 'Connected, choose a Page'
                              : acct.provider_display_name
                                || (acct.provider_handle ? `@${acct.provider_handle}` : 'Connected')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {fbPending && acct ? (
                      <View style={styles.syncRight}>
                        <TouchableOpacity
                          style={styles.connectBtn}
                          onPress={() => handleResumeFacebook(acct)}
                          disabled={resumingFbId === acct.id}>
                          <Text style={styles.connectBtnText}>
                            {resumingFbId === acct.id ? '…' : 'Choose Page'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDisconnect(acct)} hitSlop={8}>
                          <Text style={styles.syncDisconnect}>Disconnect</Text>
                        </TouchableOpacity>
                      </View>
                    ) : acct ? (
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
                    ) : syncing && syncingType === 'creator' && syncingProvider === key ? (
                      <View style={styles.syncRight}>
                        <ActivityIndicator color={C.ACCENT} size="small" />
                        <Text style={styles.syncingText}>Connecting…</Text>
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
          </View>
        </>
      )}

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

      {/* Subscriptions — channels this user pays to access */}
      {subs.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Subscriptions</Text>
          <View style={styles.section}>
            {subs.map((s, i) => (
              <View key={s.channelId}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={{ flex: 1, paddingRight: SPACE.MD }}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {s.name}{s.tierTitle ? <Text style={styles.syncHandle}>  ·  {s.tierTitle}</Text> : null}
                    </Text>
                    <Text style={styles.syncHandle} numberOfLines={1}>
                      {s.cancelAtPeriodEnd
                        ? `Ends ${s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : 'soon'}`
                        : s.currentPeriodEnd ? `Renews ${new Date(s.currentPeriodEnd).toLocaleDateString()}` : 'Active'}
                    </Text>
                  </View>
                  {s.cancelAtPeriodEnd ? (
                    <TouchableOpacity onPress={() => handleResume(s)} hitSlop={8} disabled={cancelingId === s.channelId}>
                      <Text style={styles.connectBtnText}>{cancelingId === s.channelId ? '…' : 'Resume'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => handleUnsubscribe(s)} hitSlop={8} disabled={cancelingId === s.channelId}>
                      <Text style={styles.syncDisconnect}>{cancelingId === s.channelId ? '…' : 'Unsubscribe'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

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
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('AccountAdvanced')}>
          <Text style={styles.rowLabel}>Advanced</Text>
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

      {/* Facebook Page picker — Reels are imported from the chosen Page. */}
      <Modal
        visible={!!fbPages}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!importingPageId) { setFbPages(null); } }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose a Facebook Page</Text>
            <Text style={styles.modalHint}>
              Reels are imported from a Page you manage. Pick which Page to connect.
            </Text>
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {(fbPages ?? []).map((page) => {
                const importing = importingPageId === page.id;
                // Two distinct "can't import" reasons, each with its own hint:
                //   no manage token → access problem; manageable but no reels → empty.
                const noReels = page.importable && page.hasReels === false;
                const greyed = !page.importable || noReels;
                const hint = !page.importable ? 'Needs manage access' : noReels ? 'No reels to import' : null;
                const selectable = page.importable && !noReels;
                return (
                  <TouchableOpacity
                    key={page.id}
                    style={[styles.pageRow, greyed && styles.pageRowDisabled]}
                    activeOpacity={0.7}
                    disabled={!selectable || !!importingPageId}
                    onPress={() => handleSelectFacebookPage(page)}>
                    {page.avatar ? (
                      <Image source={{ uri: page.avatar }} style={styles.pageAvatar} />
                    ) : (
                      <View style={styles.pageAvatar} />
                    )}
                    <View style={styles.pageInfo}>
                      <Text style={styles.pageName} numberOfLines={1}>{page.name || 'Untitled Page'}</Text>
                      {hint && (
                        <Text style={styles.pageHint} numberOfLines={1}>{hint}</Text>
                      )}
                    </View>
                    {importing
                      ? <ActivityIndicator color={C.ACCENT} size="small" />
                      : selectable
                        ? <Text style={styles.rowChevron}>›</Text>
                        : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancel}
              disabled={!!importingPageId}
              onPress={() => setFbPages(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.LG, paddingBottom: SPACE.SM },
  navTitle: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, letterSpacing: -1, textTransform: 'uppercase', marginTop: 5 },
  navActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, marginTop: 5 },
  container: { flex: 1, backgroundColor: 'transparent' },
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
  editLink: { fontSize: FONT.SIZES.SM, color: C.DANGER, fontFamily: FONT.BODY_SEMIBOLD, marginTop: SPACE.SM },
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
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', padding: SPACE.LG,
  },
  modalCard: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD,
    padding: SPACE.LG, borderWidth: 1, borderColor: C.BORDER, maxHeight: '70%',
  },
  modalTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  modalHint: {
    fontSize: FONT.SIZES.XS, color: C.SUBTLE, fontFamily: FONT.BODY,
    marginTop: SPACE.XS, marginBottom: SPACE.MD, lineHeight: 16,
  },
  // flexShrink lets the list scroll within the card's maxHeight instead of growing to
  // its full content height (which clips the last rows and pushes Cancel off-screen).
  modalList: { flexShrink: 1 },
  pageRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    paddingVertical: SPACE.MD, borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  pageRowDisabled: { opacity: 0.45 },
  pageAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.SURFACE_2 },
  pageInfo: { flex: 1, gap: 2 },
  pageName: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK },
  pageHint: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.MUTED },
  modalCancel: { alignItems: 'center', paddingTop: SPACE.LG },
  modalCancelText: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD },
});
