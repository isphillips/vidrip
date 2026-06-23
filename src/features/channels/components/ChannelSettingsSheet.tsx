import React, { useCallback } from 'react';
import {
  View, Text, Modal, Switch, TouchableOpacity, Alert, Linking, StyleSheet,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  setChannelInviteOnly,
  setChannelPublic,
  setChannelName,
  setChannelAdVideo,
  uploadChannelAdVideo,
} from '../../../infrastructure/supabase/queries/channels';
import { pickVideo } from '../../../infrastructure/media/imagePicker';
import { useUploadStore } from '../../../store/uploadStore';

const CREATOR_STUDIO_URL = 'https://www.vidrip.app/dashboard';

export interface ChannelSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  channelId: string;
  title: string;
  inviteOnly: boolean;
  isListed: boolean;                     // groups.is_public — public visibility / discoverable
  onInviteOnlyChange: (v: boolean) => void;
  onListedChange: (v: boolean) => void;
  onTitleChange: (t: string) => void;
  // Navigation rows — rendered only when a handler is supplied (keeps the sheet
  // navigator-agnostic so it works from both ChannelScreen and the Account tab).
  onPostVideo?: () => void;
  onReviews?: () => void;
  onInvitePeople?: () => void;
  // Channel intro/advertising video (owner/admin-set, shown on the channel).
  adVideoUrl?: string | null;
  onAdVideoChange?: () => void;
  // Manage members (owner/admins).
  onManageMembers?: () => void;
}

/**
 * The creator's channel settings drawer. Extracted from ChannelScreen so it can
 * also be opened from the Account screen when creator mode is on. Owns the
 * invite-only / public-visibility / rename mutations; the parent holds the values
 * and is notified of changes so its own UI stays in sync.
 */
export default function ChannelSettingsSheet({
  visible, onClose, channelId, title,
  inviteOnly, isListed,
  onInviteOnlyChange, onListedChange, onTitleChange,
  onPostVideo, onReviews, onInvitePeople,
  adVideoUrl, onAdVideoChange, onManageMembers,
}: ChannelSettingsSheetProps) {
  const enqueue = useUploadStore(s => s.enqueue);
  const handleAdVideo = useCallback(() => {
    const choose = async () => {
      const picked = await pickVideo();
      if (!picked) { return; }
      onClose();
      // Background upload with the global progress toast.
      enqueue('Uploading channel intro…', async () => {
        await uploadChannelAdVideo(channelId, picked.uri, picked.durationSec);
        onAdVideoChange?.();
      });
    };
    if (adVideoUrl) {
      Alert.alert('Channel intro video', undefined, [
        { text: 'Replace', onPress: choose },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          try { await setChannelAdVideo(channelId, null, null); onAdVideoChange?.(); } catch { Alert.alert('Error', 'Could not remove it.'); }
        } },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else { choose(); }
  }, [channelId, adVideoUrl, onAdVideoChange, onClose, enqueue]);

  const toggleInviteOnly = useCallback(async () => {
    const next = !inviteOnly;
    onInviteOnlyChange(next); // optimistic
    try { await setChannelInviteOnly(channelId, next); }
    catch { onInviteOnlyChange(!next); Alert.alert('Error', 'Could not update the room.'); }
  }, [inviteOnly, channelId, onInviteOnlyChange]);

  const togglePublic = useCallback(async () => {
    const next = !isListed;
    onListedChange(next); // optimistic
    try { await setChannelPublic(channelId, next); }
    catch { onListedChange(!next); Alert.alert('Error', 'Could not update visibility.'); }
  }, [isListed, channelId, onListedChange]);

  const handleRename = useCallback(() => {
    Alert.prompt(
      'Rename Channel',
      'Choose a display name for your channel.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (text?: string) => {
            const name = (text ?? '').trim();
            if (!name || name === title) { return; }
            const prev = title;
            onTitleChange(name); // optimistic
            try { await setChannelName(channelId, name); }
            catch { onTitleChange(prev); Alert.alert('Error', 'Could not rename the channel.'); }
          },
        },
      ],
      'plain-text',
      title,
    );
  }, [channelId, title, onTitleChange]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Channel</Text>

          {onPostVideo && (
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
              onPress={() => { onClose(); onPostVideo(); }}>
              <Text style={styles.menuRowIcon}>＋</Text>
              <View style={styles.menuRowText}>
                <Text style={styles.menuRowLabel}>Post a Video</Text>
                <Text style={styles.menuRowSub}>Add a YouTube or TikTok video for fans to react to</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuRow} activeOpacity={0.7} onPress={handleAdVideo}>
            <Ionicons name="megaphone-outline" size={18} color={C.ACCENT_HOT} style={styles.menuRowIconV} />
            <View style={styles.menuRowText}>
              <Text style={styles.menuRowLabel}>Channel Intro Video</Text>
              <Text style={styles.menuRowSub}>
                {adVideoUrl ? 'Set — tap to replace or remove' : 'Record or upload a welcome/pitch video for your channel'}
              </Text>
            </View>
          </TouchableOpacity>

          {onManageMembers && (
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
              onPress={() => { onClose(); onManageMembers(); }}>
              <Ionicons name="people-outline" size={18} color={C.ACCENT_HOT} style={styles.menuRowIconV} />
              <View style={styles.menuRowText}>
                <Text style={styles.menuRowLabel}>Manage Members</Text>
                <Text style={styles.menuRowSub}>Search members · mute, kick, ban, promote</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuRow} activeOpacity={0.7} onPress={handleRename}>
            <Text style={styles.menuRowIcon}>✎</Text>
            <View style={styles.menuRowText}>
              <Text style={styles.menuRowLabel}>Rename Channel</Text>
              <Text style={styles.menuRowSub}>Change the channel's display name</Text>
            </View>
          </TouchableOpacity>

          {onReviews && (
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
              onPress={() => { onClose(); onReviews(); }}>
              <Text style={styles.menuRowIcon}>★</Text>
              <View style={styles.menuRowText}>
                <Text style={styles.menuRowLabel}>Reviews</Text>
                <Text style={styles.menuRowSub}>Watch reviews fans sent you · settings</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Public visibility — whether the channel is listed on the Channels screen */}
          <View style={styles.menuRow}>
            <Ionicons name="globe-outline" size={18} color={C.ACCENT_HOT} style={styles.menuRowIconV} />
            <View style={styles.menuRowText}>
              <Text style={styles.menuRowLabel}>Public Visibility</Text>
              <Text style={styles.menuRowSub}>
                {isListed ? 'Listed on the Channels screen for anyone to find' : 'Private — only reachable by invite'}
              </Text>
            </View>
            <Switch
              value={isListed}
              onValueChange={togglePublic}
              trackColor={{ true: C.ACCENT, false: C.SURFACE_2 }}
              thumbColor={C.WHITE}
            />
          </View>

          {/* Invite Only access gate */}
          <View style={styles.menuRow}>
            <Ionicons name="lock-closed" size={18} color={C.ACCENT_HOT} style={styles.menuRowIconV} />
            <View style={styles.menuRowText}>
              <Text style={styles.menuRowLabel}>Invite Only</Text>
              <Text style={styles.menuRowSub}>
                {inviteOnly ? 'Only invited people can watch & react' : 'Anyone can join and react'}
              </Text>
            </View>
            <Switch
              value={inviteOnly}
              onValueChange={toggleInviteOnly}
              trackColor={{ true: C.ACCENT, false: C.SURFACE_2 }}
              thumbColor={C.WHITE}
            />
          </View>

          {inviteOnly && onInvitePeople && (
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
              onPress={() => { onClose(); onInvitePeople(); }}>
              <Text style={styles.menuRowIcon}>＋</Text>
              <View style={styles.menuRowText}>
                <Text style={styles.menuRowLabel}>Invite People</Text>
                <Text style={styles.menuRowSub}>Send invites by @handle</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuRow} activeOpacity={0.7}
            onPress={() => {
              onClose();
              Linking.openURL(CREATOR_STUDIO_URL).catch(() =>
                Alert.alert('Could not open', 'Unable to open Creator Studio right now.'));
            }}>
            <Text style={styles.menuRowIcon}>↗</Text>
            <View style={styles.menuRowText}>
              <Text style={styles.menuRowLabel}>Creator Studio</Text>
              <Text style={styles.menuRowSub}>Open your dashboard on the web</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.SURFACE, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    padding: SPACE.LG, gap: SPACE.SM, maxHeight: '100%',
  },
  modalTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK, marginBottom: SPACE.SM },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    paddingVertical: SPACE.MD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  menuRowIcon: { fontSize: 20, color: C.ACCENT_HOT, width: 28, textAlign: 'center' },
  menuRowIconV: { width: 28, textAlign: 'center' },
  menuRowText: { flex: 1, gap: 2 },
  menuRowLabel: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  menuRowSub: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.MUTED },
  modalClose: {
    marginTop: SPACE.MD, backgroundColor: C.ACCENT, borderRadius: RADIUS.MD,
    padding: SPACE.MD, alignItems: 'center', marginBottom: SPACE.MD
  },
  modalCloseTxt: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },
});
