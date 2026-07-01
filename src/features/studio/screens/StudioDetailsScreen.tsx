import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Animated, Modal, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Video from 'react-native-video';
import RNFS from 'react-native-fs';
import { createThumbnail } from 'react-native-create-thumbnail';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  createCreatorVideo, uploadCreatorVideo, fetchPostableChannels, uploadCreatorThumbnail, fetchCanCreate,
  type PostableChannel, type Visibility, type UploadHandle,
} from '../../../infrastructure/creatorStudio/api';
import { publishStudioClipToFriends } from '../../../infrastructure/creatorStudio/studioShare';
import {
  fetchMyCollections, createCollection, addVideoToCollection, type ExclusiveCollection,
} from '../../../infrastructure/exclusive/api';
import { findObjectionable, OBJECTIONABLE_MESSAGE } from '../../../infrastructure/moderation/textFilter';
import { MONETIZATION_ENABLED } from '../../../infrastructure/config/monetization';
import { fetchFriends, type Friend } from '../../../infrastructure/supabase/queries/friends';
import GradientButton from '../components/GradientButton';
import SaveForLaterButton from '../components/SaveForLaterButton';
import EffectPlayer from '../components/EffectPlayer';
import ShareBaker, { type ShareBakerHandle } from '../components/ShareBaker';
import WatermarkStamper, { type WatermarkStamperHandle } from '../components/WatermarkStamper';
import { shareVideoFile } from '../../../infrastructure/share/shareVideoFile';
import { isEmptyRecipe } from '../effectRecipe';
import { useStudioAutosave } from '../useStudioAutosave';
import { deleteDraft } from '../../../infrastructure/storage/studioDraftStorage';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

// "Tue, Jun 17 · 3:30 PM" in the device's locale/timezone.
const fmtSchedule = (d: Date) =>
  d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function StudioDetailsScreen({ route, navigation }: StudioStackScreenProps<'StudioDetails'>) {
  const { fileUri, recipe, durationSec, draftId, title: initTitle, channelId: initChannelId, visibility: initVisibility } = route.params;
  const { top } = useSafeAreaInsets();
  const { user, profile } = useAuthStore();

  // Publish-destination fork, baked into the UI as a segmented toggle (Path A friends / Path B channel).
  // The toggle only shows for `is_creator` users; common users only have Path A. `creator_studio`
  // (canCreate) gates whether the Channel segment is selectable.
  const isCreator = !!(profile as any)?.is_creator;
  const [canCreate, setCanCreate]   = useState(false);
  // Creator Studio = is_creator AND the server-side creator_studio entitlement (canCreate). Only
  // these users get the Channel destination and its exclusive (members-only) + scheduling options;
  // everyone else can only send to friends or save a draft — no mention of channels/exclusive/schedule.
  const isCreatorStudio = isCreator && canCreate;
  const [path, setPath]             = useState<'friends' | 'channel'>('friends');
  const [friends, setFriends]       = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  const [title, setTitle]           = useState(initTitle ?? '');
  const [channels, setChannels]     = useState<PostableChannel[]>([]);
  const [channelId, setChannelId]   = useState<string | null>(initChannelId ?? null);
  const [visibility, setVisibility] = useState<Visibility>(initVisibility ?? 'public');
  // Channel sub-destination: post to the public feed, or stage the video into an exclusive collection
  // (the video is marked exclusive so it stays out of the feed; delivery to subs is a separate step).
  const [postKind, setPostKind]     = useState<'feed' | 'exclusive'>('feed');
  const [collections, setCollections] = useState<ExclusiveCollection[]>([]);
  const [collectionTarget, setCollectionTarget] = useState<string | null>(null); // collection id, or '__new__'
  const [newCollectionName, setNewCollectionName] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [uploaded, setUploaded]       = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);
  const [sharing, setSharing]         = useState(false);
  // Publish timing: post immediately, or schedule for a future release_date.
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [releaseAt, setReleaseAt]     = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000)); // default +1h
  const [iosPicker, setIosPicker]     = useState(false);
  const bakerRef = useRef<ShareBakerHandle>(null);
  const stamperRef = useRef<WatermarkStamperHandle>(null);
  const progress  = useRef(new Animated.Value(0)).current;
  const uploadRef = useRef<UploadHandle | null>(null);

  useEffect(() => {
    if (!user?.id) { return; }
    fetchPostableChannels(user.id)
      .then(cs => {
        setChannels(cs);
        // When resuming a draft we keep its saved channel; otherwise default to the first.
        if (!initChannelId) {
          const first = cs[0] ?? null;
          setChannelId(first?.id ?? null);
          if (MONETIZATION_ENABLED && first?.isMembersOnly) { setVisibility('subscribers'); }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingChannels(false));
  }, [user?.id, initChannelId]);

  // Autosave the publish details to the draft.
  useStudioAutosave(draftId, 'details', { title, channelId, visibility });

  useEffect(() => () => uploadRef.current?.abort(), []);

  // Resolve the creator_studio flag so the fork can lock/unlock Path B (channel).
  useEffect(() => {
    if (user?.id && isCreator) { fetchCanCreate(user.id).then(setCanCreate).catch(() => {}); }
  }, [user?.id, isCreator]);

  // Lazy-load friends the first time the user lands on Path A (share with friends).
  useEffect(() => {
    if (path !== 'friends' || !user?.id || friends.length > 0) { return; }
    setLoadingFriends(true);
    fetchFriends(user.id).then(setFriends).catch(() => {}).finally(() => setLoadingFriends(false));
  }, [path, user?.id, friends.length]);

  // Load the selected channel's collections for the "Exclusive" sub-destination; reset the picked
  // target whenever the channel changes (its collection list differs).
  useEffect(() => {
    if (path !== 'channel' || !channelId) { return; }
    setCollectionTarget(null);
    fetchMyCollections(channelId).then(setCollections).catch(() => setCollections([]));
  }, [path, channelId]);

  const toggleFriend = (id: string) => {
    if (uploading) { return; }
    setSelectedFriends(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const selectChannel = (ch: PostableChannel) => {
    if (uploading) { return; }
    setChannelId(ch.id);
    if (MONETIZATION_ENABLED && ch.isMembersOnly) { setVisibility('subscribers'); }
  };

  const selectedChannel = channels.find(c => c.id === channelId) ?? null;
  const subscribersOnly = selectedChannel?.isMembersOnly ?? false;

  // Open the OS date+time picker. iOS shows an inline picker in a modal; Android chains its native
  // date dialog then time dialog.
  const pickSchedule = () => {
    if (Platform.OS === 'ios') { setIosPicker(true); return; }
    DateTimePickerAndroid.open({
      value: releaseAt, mode: 'date', minimumDate: new Date(),
      onChange: (_e, d) => {
        if (!d) { return; }
        DateTimePickerAndroid.open({
          value: d, mode: 'time', is24Hour: false,
          onChange: (_e2, t) => {
            if (!t) { return; }
            const combined = new Date(d);
            combined.setHours(t.getHours(), t.getMinutes(), 0, 0);
            setReleaseAt(combined);
          },
        });
      },
    });
  };

  // Block objectionable captions before publishing (App Store 1.2 text filtering).
  const captionOk = () => {
    if (findObjectionable(title)) { Alert.alert('Edit your caption', OBJECTIONABLE_MESSAGE); return false; }
    return true;
  };

  const post = async () => {
    if (!channelId || uploading) { return; }
    if (!captionOk()) { return; }
    const exclusive = postKind === 'exclusive';
    if (exclusive) {
      if (!user?.id) { return; }
      if (!collectionTarget) { Alert.alert('Pick a collection', 'Choose an existing collection or create a new one.'); return; }
      if (collectionTarget === '__new__' && !newCollectionName.trim()) { Alert.alert('Name the collection'); return; }
    }
    // Post-level scheduling applies only to public-feed posts; an exclusive video's delivery timing is a
    // property of its collection (managed in Collections), so it always posts (staged) immediately.
    const scheduling = !exclusive && publishMode === 'schedule';
    if (scheduling && releaseAt.getTime() <= Date.now()) {
      Alert.alert('Pick a future time', 'The scheduled time must be in the future.');
      return;
    }
    const releaseDate = scheduling ? releaseAt.toISOString() : null;
    // Exclusive videos are always members-gated (access is by award); never public.
    const effVisibility: Visibility = exclusive ? 'subscribers' : visibility;
    setUploading(true);
    progress.setValue(0);
    try {
      // Thumbnail is best-effort AND time-boxed — a hung thumbnail upload must never stall the
      // post (the progress bar sits at 0% during this pre-upload phase).
      let thumbUrl: string | undefined;
      try {
        thumbUrl = await Promise.race([
          (async () => {
            const { path } = await createThumbnail({ url: fileUri, timeStamp: 1000, format: 'jpeg' });
            return await uploadCreatorThumbnail(path);
          })(),
          new Promise<undefined>((_, rej) => setTimeout(() => rej(new Error('thumb timeout')), 8000)),
        ]);
      } catch { /* best-effort — proceed without a custom thumbnail */ }
      const create = await createCreatorVideo(channelId, title.trim() || 'Untitled', effVisibility, thumbUrl, recipe ?? null, releaseDate);
      const { promise, handle } = uploadCreatorVideo({
        create, fileUri, title: title.trim() || 'Untitled',
        onProgress: (f) => Animated.timing(progress, { toValue: f, duration: 120, useNativeDriver: false }).start(),
      });
      uploadRef.current = handle;
      await promise;
      // Exclusive: attach the new video to its collection (creating one if needed). addVideoToCollection
      // marks the post exclusive, so it stays out of the public feed. Delivery to subs happens separately.
      if (exclusive) {
        let cid = collectionTarget!;
        if (cid === '__new__') {
          const created = await createCollection({ channelId, creatorId: user!.id, name: newCollectionName.trim(), coverUrl: thumbUrl ?? null });
          cid = created.id;
        }
        await addVideoToCollection(cid, create.postId);
      }
      // Bytes are up → the draft is safely published; delete its local backups (raw + snapshot).
      if (draftId) { await deleteDraft(draftId).catch(() => {}); }
      // Bunny encodes server-side (the webhook flips it to 'ready' for the channel), but the local
      // baked file is identical and plays instantly — so show a success card with the video playing
      // right away instead of a bare alert.
      setUploaded(true);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Something went wrong. Try again.');
      setUploading(false);
    }
  };

  // Path A — share the clip to chosen friends (Supabase storage + p2p download). The overlay must be
  // BAKED into the file here (recipients play a plain MP4 in the reaction viewer, no live recipe replay).
  const sendToFriends = async () => {
    if (selectedFriends.size === 0 || uploading || !user?.id) { return; }
    if (!captionOk()) { return; }
    setUploading(true);
    try {
      const baked = isEmptyRecipe(recipe)
        ? fileUri
        : await bakerRef.current!.bake({ sourceUri: fileUri, recipe, durationSec: durationSec ?? 0 });
      // Best-effort, time-boxed thumbnail (public bucket) — same treatment as the channel path.
      let thumbUrl: string | undefined;
      try {
        thumbUrl = await Promise.race([
          (async () => {
            const { path: tp } = await createThumbnail({ url: baked, timeStamp: 1000, format: 'jpeg' });
            return await uploadCreatorThumbnail(tp);
          })(),
          new Promise<undefined>((_, rej) => setTimeout(() => rej(new Error('thumb timeout')), 8000)),
        ]);
      } catch { /* best-effort */ }
      await publishStudioClipToFriends({
        userId: user.id,
        fileUri: baked,
        recipientIds: [...selectedFriends],
        title: title.trim() || 'Untitled',
        durationSec: durationSec ?? 0,
        thumbnailUrl: thumbUrl ?? null,
      });
      if (draftId) { await deleteDraft(draftId).catch(() => {}); }
      setUploaded(true);
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Something went wrong. Try again.');
      setUploading(false);
    }
  };

  // Share OUT to other apps (TikTok / IG / Stories / Messages…). Every outbound clip is stamped with a
  // branded watermark baked into the pixels, so it self-attributes off-platform, then the OS share sheet
  // opens with a caption. (In-app friend/channel posts stay clean — the watermark is share-out only.)
  const shareWithEffects = async () => {
    if (sharing || uploading) { return; }
    setSharing(true);
    let wmUri: string | null = null;
    try {
      // Probe the baked source's display aspect so the watermark renders at the right shape (no stretch).
      let aspect = 9 / 16;
      try {
        const t = await createThumbnail({ url: fileUri, timeStamp: 100, format: 'jpeg' });
        if (t.width > 0 && t.height > 0) { aspect = t.width / t.height; }
      } catch { /* fall back to 9:16 portrait */ }
      const wm = await stamperRef.current!.stamp({ aspect });
      wmUri = wm.uri;
      // Always bake (even an empty recipe) so the watermark is stamped onto the pixels.
      const out = await bakerRef.current!.bake({ sourceUri: fileUri, recipe, durationSec: durationSec ?? 0, watermark: wm });
      await shareVideoFile(out, { title: title.trim() || undefined });
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Could not prepare the video.');
    } finally {
      if (wmUri) { RNFS.unlink(wmUri.replace(/^file:\/\//, '')).catch(() => {}); }
      setSharing(false);
    }
  };

  const widthPct   = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const noChannels = !loadingChannels && channels.length === 0;

  // The footer CTA is destination-driven: undecided creators open the fork; Path A sends to friends;
  // Path B posts/schedules to a channel.
  const nSel = selectedFriends.size;
  const cta =
    path === 'friends'
      ? {
          label: uploading ? 'Sending…' : nSel > 0 ? `Send to ${nSel} friend${nSel === 1 ? '' : 's'}` : 'Send to friends',
          icon: 'paper-plane-outline' as string | undefined,
          onPress: sendToFriends,
          disabled: uploading || nSel === 0,
        }
      : {
          label: uploading ? 'Uploading…'
            : postKind === 'exclusive' ? 'Add to collection'
            : publishMode === 'schedule' ? 'Schedule post' : 'Post video',
          icon: (postKind === 'exclusive' ? 'diamond-outline' : publishMode === 'schedule' ? 'calendar-outline' : undefined) as string | undefined,
          onPress: post,
          disabled: uploading || noChannels || !channelId || (postKind === 'exclusive' && !collectionTarget),
        };

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => !uploading && navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={uploading ? C.SUBTLE : C.INK} />
        </TouchableOpacity>
        <Text style={styles.title}>New video</Text>
        {draftId && !uploading && !uploaded ? <SaveForLaterButton onPress={() => navigation.popToTop()} /> : <View style={{ width: 26 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.previewBox}>
          {/* The look (trim/colour/mirror) is baked into fileUri; the animated overlay layer
              is replayed live on top from the recipe — exact match to the editor, 60fps. */}
          <EffectPlayer
            uri={fileUri}
            recipe={recipe}
            // Pause the preview (video decode + live effect-recipe replay) while a bake runs
            // (publish/share/upload). Otherwise it competes with the encoder for the GPU and the
            // overlay/watermark bake crawls.
            paused={fullscreen || uploaded || uploading || sharing}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity style={styles.fullscreenBtn} onPress={() => setFullscreen(true)} hitSlop={8}>
            <View style={styles.fullscreenBg}>
              <Ionicons name="expand-outline" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={shareWithEffects} disabled={sharing} hitSlop={8}>
            <View style={styles.fullscreenBg}>
              {sharing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="share-outline" size={18} color="#fff" />}
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input} value={title} onChangeText={setTitle}
          placeholder="Give it a title…" placeholderTextColor={C.SUBTLE} maxLength={120} editable={!uploading}
        />

        {/* Destination fork — Creator Studio only. Non-creator-studio users never see it, so the flow
            stays friends-only with no mention of channels, exclusive content, or scheduling. */}
        {isCreatorStudio && (
          <>
            <Text style={styles.label}>Post to</Text>
            <View style={styles.toggle}>
              <TouchableOpacity
                style={[styles.toggleBtn, path === 'friends' && styles.toggleBtnActive, uploading && styles.toggleBtnDisabled]}
                onPress={() => { if (!uploading) { setPath('friends'); } }}
                activeOpacity={uploading ? 1 : 0.8}>
                <Ionicons name="people" size={16} color={path === 'friends' ? C.WHITE : C.MUTED} />
                <Text style={[styles.toggleText, path === 'friends' && styles.toggleTextActive]}>Friends</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, path === 'channel' && styles.toggleBtnActive, (!canCreate || uploading) && styles.toggleBtnDisabled]}
                onPress={() => { if (canCreate && !uploading) { setPath('channel'); } }}
                activeOpacity={canCreate && !uploading ? 0.8 : 1}>
                <Ionicons name={canCreate ? 'tv' : 'lock-closed'} size={16}
                  color={path === 'channel' ? C.WHITE : canCreate ? C.MUTED : C.SUBTLE} />
                <Text style={[styles.toggleText, path === 'channel' && styles.toggleTextActive, !canCreate && styles.toggleTextDisabled]}>Channel</Text>
              </TouchableOpacity>
            </View>
            {!canCreate && <Text style={styles.hint}>Channels are available to select creators.</Text>}
          </>
        )}

        {path === 'friends' && (
          <>
            <Text style={styles.label}>Send to</Text>
            {loadingFriends
              ? <ActivityIndicator color={C.ACCENT} style={{ alignSelf: 'flex-start' }} />
              : friends.length === 0
                ? <Text style={styles.hint}>Add some friends first to share with them.</Text>
                : friends.map(f => {
                    const sel = selectedFriends.has(f.userId);
                    return (
                      <TouchableOpacity key={f.userId} style={[styles.choice, sel && styles.choiceActive]}
                        onPress={() => toggleFriend(f.userId)} activeOpacity={0.8}>
                        <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={20}
                          color={sel ? C.ACCENT_HOT : C.SUBTLE} />
                        <Text style={[styles.choiceText, sel && styles.choiceTextActive]} numberOfLines={1}>{f.displayName}</Text>
                        <Text style={styles.friendHandle} numberOfLines={1}>@{f.handle}</Text>
                      </TouchableOpacity>
                    );
                  })
            }
          </>
        )}

        {path === 'channel' && (
        <>
        <Text style={styles.label}>Channel</Text>
        {loadingChannels
          ? <ActivityIndicator color={C.ACCENT} style={{ alignSelf: 'flex-start' }} />
          : noChannels
            ? <Text style={styles.hint}>You don't own a channel yet. Create one first to publish.</Text>
            : channels.map(ch => {
                const active = ch.id === channelId;
                return (
                  <TouchableOpacity key={ch.id} style={[styles.choice, active && styles.choiceActive]}
                    onPress={() => selectChannel(ch)} activeOpacity={0.8}>
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18}
                      color={active ? C.ACCENT_HOT : C.SUBTLE} />
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]} numberOfLines={1}>{ch.name}</Text>
                    {ch.isMembersOnly && MONETIZATION_ENABLED && (
                      <View style={styles.membersBadge}>
                        <Ionicons name="lock-closed" size={11} color={C.ACCENT_HOT} />
                        <Text style={styles.membersBadgeTxt}>Subs only</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
        }

        {/* Channel sub-destination — public feed vs staged into an exclusive collection.
            Exclusive (members-only) publishing is hidden while monetization is off (App Store 3.1.1);
            postKind stays 'feed', so every post goes to the public feed. */}
        {MONETIZATION_ENABLED && (
        <>
        <Text style={styles.label}>Content type</Text>
        <View style={styles.toggle}>
          {([['feed', 'Public feed', 'globe-outline'], ['exclusive', 'Exclusive', 'diamond-outline']] as const).map(([k, lbl, icon]) => {
            const active = postKind === k;
            return (
              <TouchableOpacity key={k}
                style={[styles.toggleBtn, active && styles.toggleBtnActive, uploading && styles.toggleBtnDisabled]}
                onPress={() => { if (!uploading) { setPostKind(k); } }}
                activeOpacity={uploading ? 1 : 0.8}>
                <Ionicons name={icon} size={16} color={active ? C.WHITE : C.MUTED} />
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        </>
        )}

        {postKind === 'exclusive' ? (
          <>
            <Text style={styles.label}>Collection</Text>
            <Text style={styles.hint}>This video becomes exclusive — it won’t show in the public feed. Send the collection to subscribers from Collections.</Text>
            {collections.map(c => {
              const on = collectionTarget === c.id;
              return (
                <TouchableOpacity key={c.id} style={[styles.choice, on && styles.choiceActive]}
                  onPress={() => { if (!uploading) { setCollectionTarget(c.id); } }} activeOpacity={0.8}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? C.ACCENT_HOT : C.SUBTLE} />
                  <Text style={[styles.choiceText, on && styles.choiceTextActive]} numberOfLines={1}>{c.name}</Text>
                  {c.status !== 'published' && (
                    <View style={styles.membersBadge}>
                      <Text style={styles.membersBadgeTxt}>{c.status === 'scheduled' ? 'Scheduled' : 'Draft'}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.choice, collectionTarget === '__new__' && styles.choiceActive]}
              onPress={() => { if (!uploading) { setCollectionTarget('__new__'); } }} activeOpacity={0.8}>
              <Ionicons name={collectionTarget === '__new__' ? 'radio-button-on' : 'radio-button-off'} size={18} color={collectionTarget === '__new__' ? C.ACCENT_HOT : C.SUBTLE} />
              <Text style={[styles.choiceText, collectionTarget === '__new__' && styles.choiceTextActive]}>New collection…</Text>
            </TouchableOpacity>
            {collectionTarget === '__new__' && (
              <TextInput style={styles.input} value={newCollectionName} onChangeText={setNewCollectionName}
                placeholder="Collection name" placeholderTextColor={C.SUBTLE} maxLength={80} editable={!uploading} />
            )}
          </>
        ) : (
        <>
        {/* Members-only visibility is a paid surface — hidden while monetization is off (App Store 3.1.1).
            Visibility stays 'public'. */}
        {MONETIZATION_ENABLED && (
        <>
        <Text style={styles.label}>Who can watch</Text>
        {subscribersOnly && (
          <Text style={styles.hint}>This channel is members-only. All posts are locked.</Text>
        )}
        <View style={styles.toggle}>
          {(['public', 'subscribers'] as Visibility[]).map(v => {
            const active   = visibility === v;
            const disabled = uploading || (v === 'public' && subscribersOnly);
            return (
              <TouchableOpacity key={v}
                style={[styles.toggleBtn, active && styles.toggleBtnActive, disabled && styles.toggleBtnDisabled]}
                onPress={() => { if (!disabled) { setVisibility(v); } }}
                activeOpacity={disabled ? 1 : 0.8}>
                <Ionicons name={v === 'public' ? 'globe-outline' : 'lock-closed'} size={16}
                  color={active ? C.WHITE : disabled ? C.SUBTLE : C.MUTED} />
                <Text style={[styles.toggleText, active && styles.toggleTextActive, disabled && styles.toggleTextDisabled]}>
                  {v === 'public' ? 'Public' : 'Members'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        </>
        )}

        <Text style={styles.label}>When to publish</Text>
        <View style={styles.toggle}>
          {([['now', 'Post now', 'flash-outline'], ['schedule', 'Schedule', 'calendar-outline']] as const).map(([m, lbl, icon]) => {
            const active = publishMode === m;
            return (
              <TouchableOpacity key={m}
                style={[styles.toggleBtn, active && styles.toggleBtnActive, uploading && styles.toggleBtnDisabled]}
                onPress={() => { if (!uploading) { setPublishMode(m); } }}
                activeOpacity={uploading ? 1 : 0.8}>
                <Ionicons name={icon} size={16} color={active ? C.WHITE : C.MUTED} />
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {publishMode === 'schedule' && (
          <TouchableOpacity style={styles.scheduleField} onPress={pickSchedule} disabled={uploading} activeOpacity={0.8}>
            <Ionicons name="time-outline" size={18} color={C.ACCENT_HOT} />
            <Text style={styles.scheduleText}>{fmtSchedule(releaseAt)}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.SUBTLE} />
          </TouchableOpacity>
        )}
        </>
        )}
        </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {uploading && path === 'channel' && (
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: widthPct }]} />
          </View>
        )}
        <GradientButton
          label={cta.label}
          icon={cta.icon}
          onPress={cta.onPress}
          disabled={cta.disabled}
        />
      </View>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
        <View style={styles.fsContainer}>
          <Video
            source={{ uri: fileUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            controls
            repeat
            paused={false}
            ignoreSilentSwitch="ignore"
          />
          <TouchableOpacity style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={12}>
            <View style={styles.fsCloseBg}>
              <Ionicons name="close" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Upload-complete confirmation with an instant, looping preview of the finished
          video (local baked file — plays immediately while Bunny finishes encoding). */}
      <Modal visible={uploaded} animationType="fade" transparent
        supportedOrientations={['portrait']}
        onRequestClose={() => { setUploaded(false); navigation.popToTop(); }}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Ionicons
              name={path === 'friends' ? 'paper-plane' : postKind === 'exclusive' ? 'diamond' : publishMode === 'schedule' ? 'calendar' : 'checkmark-circle'}
              size={46} color={C.ACCENT_HOT} />
            <Text style={styles.successTitle}>
              {path === 'friends' ? 'Sent 🎉' : postKind === 'exclusive' ? 'Added 💎' : publishMode === 'schedule' ? 'Scheduled 🗓️' : 'Uploaded 🎬'}
            </Text>
            <Text style={styles.successSub}>
              {path === 'friends'
                ? `Shared with ${nSel} friend${nSel === 1 ? '' : 's'} — they'll get it now.`
                : postKind === 'exclusive'
                  ? 'Added to your collection. Send it to subscribers from Collections.'
                  : publishMode === 'schedule'
                    ? `Goes live ${fmtSchedule(releaseAt)}${selectedChannel ? ` in ${selectedChannel.name}` : ''}.`
                    : selectedChannel
                      ? `Processing now — going live in ${selectedChannel.name} shortly.`
                      : 'Processing now — going live shortly.'}
            </Text>
            <View style={styles.successPreview}>
              {uploaded && (
                <EffectPlayer uri={fileUri} recipe={recipe} paused={false} style={StyleSheet.absoluteFill} />
              )}
            </View>
            <View style={styles.successActions}>
              <TouchableOpacity style={styles.successShare} onPress={shareWithEffects} disabled={sharing} activeOpacity={0.85}>
                {sharing
                  ? <ActivityIndicator size="small" color={C.INK} />
                  : <><Ionicons name="share-outline" size={18} color={C.INK} /><Text style={styles.successShareTxt}>Share</Text></>}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <GradientButton label="Done" onPress={() => { setUploaded(false); navigation.popToTop(); }} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* iOS date+time picker sheet (Android uses the native dialogs from pickSchedule). */}
      {Platform.OS === 'ios' && (
        <Modal visible={iosPicker} animationType="slide" transparent onRequestClose={() => setIosPicker(false)}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Schedule for</Text>
                <TouchableOpacity onPress={() => setIosPicker(false)} hitSlop={10}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={releaseAt}
                mode="datetime"
                display="spinner"
                minimumDate={new Date()}
                themeVariant="dark"
                onChange={(_e, d) => { if (d) { setReleaseAt(d); } }}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Off-screen; only renders while baking the overlay / branded watermark into a shareable MP4. */}
      <ShareBaker ref={bakerRef} />
      <WatermarkStamper ref={stamperRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title:     { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  body:      { paddingBottom: SPACE.XXXL },

  previewBox: {
    height: 300,
    aspectRatio: 9 / 16,
    alignSelf: 'center',
    borderRadius: RADIUS.MD,
    backgroundColor: '#000',
    overflow: 'hidden',
    marginBottom: SPACE.LG,
  },
  fullscreenBtn: { position: 'absolute', bottom: 10, right: 10 },
  shareBtn:      { position: 'absolute', top: 10, right: 10 },
  fullscreenBg:  { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 6 },

  label: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED, marginTop: SPACE.MD, marginBottom: SPACE.SM },
  input: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.LG, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY,
  },
  hint: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, marginBottom: SPACE.SM },

  friendHandle:     { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, maxWidth: 120 },

  choice: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG, marginBottom: SPACE.SM,
  },
  choiceActive:    { borderColor: C.ACCENT },
  choiceText:      { flex: 1, fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY_MEDIUM },
  choiceTextActive:{ color: C.INK },
  membersBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.SURFACE_2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.FULL },
  membersBadgeTxt: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD, fontSize: 10 },

  toggle:             { flexDirection: 'row', gap: SPACE.SM },
  toggleBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE },
  toggleBtnActive:    { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  toggleBtnDisabled:  { opacity: 0.35 },
  toggleText:         { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTextActive:   { color: C.WHITE },
  toggleTextDisabled: { color: C.SUBTLE },

  scheduleField: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginTop: SPACE.SM,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.ACCENT_LITE,
    paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG,
  },
  scheduleText: { flex: 1, color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  // Opaque sheet — C.BG is 'transparent' (a screen gradient shows through), which made the spinner
  // text unreadable. Use a solid surface so the picker is legible.
  pickerSheet:   { backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG, paddingBottom: SPACE.XL, borderTopWidth: 1, borderColor: C.BORDER },
  pickerHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.LG },
  pickerTitle:   { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  pickerDone:    { color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },

  footer:        { paddingBottom: SPACE.LG },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.SURFACE_2, overflow: 'hidden', marginBottom: SPACE.SM },
  progressFill:  { height: 6, borderRadius: 3, backgroundColor: C.ACCENT_HOT },

  fsContainer: { flex: 1, backgroundColor: '#000' },
  fsClose:     { position: 'absolute', top: 52, right: 20 },
  fsCloseBg:   { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: 8 },

  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: SPACE.LG },
  successCard:    { width: '100%', maxWidth: 360, backgroundColor: C.SURFACE_2, borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center', borderWidth: 1, borderColor: C.BORDER },
  successTitle:   { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, marginTop: SPACE.SM },
  successSub:     { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, textAlign: 'center', marginTop: SPACE.SM, marginBottom: SPACE.MD },
  successPreview: { height: 300, aspectRatio: 9 / 16, borderRadius: RADIUS.MD, backgroundColor: '#000', overflow: 'hidden' },
  successActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginTop: SPACE.LG, width: '100%' },
  successShare:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE },
  successShareTxt:{ color: C.INK,  paddingVertical: SPACE.MD, fontFamily: FONT.BODY_SEMIBOLD },
});
