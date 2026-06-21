import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Auth stack
export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  EnterInviteCode: { code?: string } | undefined;
  CreateProfile: { inviteCode: string };
};

// Main tabs
export type MainTabParamList = {
  Feed: undefined;
  Channels: undefined;
  Share: undefined;
  Friends: undefined;
  Account: undefined;
};

// Channels stack
export type ChannelsStackParamList = {
  ChannelsHome: undefined;
  Channel: { channelId: string; channelName: string; isPublic: boolean; isJoined: boolean; isOwner: boolean; isMembersOnly?: boolean; inviteOnly?: boolean; ownerHandle?: string; justSubscribed?: boolean; isGroupChat?: boolean };
  InviteToChannel: { channelId: string; channelName: string };
  ChannelPost: { postId: string; channelId: string; isJoined: boolean };
  WatchYouTubePost: { postId: string; channelId: string };
  WatchChannelClip: { postId: string };
  WatchCreatorVideo: { postId: string; title?: string };
  RecordReview: { postId: string; channelId: string };
  WatchReview: { reviewId: string };
  ChannelReviews: { channelId: string; channelName: string };
  ChannelVideoRecord: { channelId: string };
  AddChannelVideo: { channelId: string };
  AddChannelMembers: { channelId: string };
  ManageChannelMembers: { channelId: string; channelName: string };
};

export type ChannelsStackScreenProps<T extends keyof ChannelsStackParamList> =
  NativeStackScreenProps<ChannelsStackParamList, T>;

export type AccountStackParamList = {
  AccountHome: undefined;
  EditProfile: undefined;
  InviteManagement: undefined;
  PasswordSetup: undefined;
  TwoFactor: undefined;
  AccountAdvanced: undefined;
};

// Feed stack
export type FeedStackParamList = {
  FeedHome: undefined;
  // Messenger-style merged timeline with one friend (video shares + reactions + DM).
  FriendConversation: {
    friendUserId: string;
    displayName?: string;
    handle?: string;
    avatarUrl?: string | null;
    dmChannelId?: string | null;
    threadIds?: string[];
  };
  Thread: { threadId: string };
  WatchReaction: { reactionId: string };
  WatchReview: { reviewId: string };
  // Reused channel screens, registered in the Feed stack so composing/playing a DM
  // clip, or opening/creating a group chat, stays in-stack.
  ChannelVideoRecord: { channelId: string };
  WatchChannelClip: { postId: string };
  CreateGroupChat: undefined;
  Channel: { channelId: string; channelName: string; isPublic: boolean; isJoined: boolean; isOwner: boolean; isMembersOnly?: boolean; inviteOnly?: boolean; ownerHandle?: string; justSubscribed?: boolean; isGroupChat?: boolean };
  GiftReveal: { awardId: string };
  ExclusiveCollection: { collectionId: string };
  ExclusiveWatch: { postId: string; channelId: string; title?: string; thumbnail?: string | null };
};

// Friends stack
export type FriendsStackParamList = {
  FriendsHome: undefined;
  AddFriend: undefined;
  InviteManagement: undefined;
  InviteContacts: undefined;
  Profile: { userId: string };
};

// Share stack
export type ShareStackParamList = {
  ShareHome: undefined;
};

// Record stack
export type RecordStackParamList = {
  RecordReaction: {
    threadId: string;
    videoId?: string;                    // absent for a Studio-clip reaction (no source video)
    sourceType?: 'youtube' | 'tiktok' | 'instagram' | 'studio';
    // For a Studio-clip reaction the creator's clip plays as the source from this URL.
    sourceUri?: string;
    // When the share carries a sender intro, play it before the source video.
    introUrl?: string;
    introDuration?: number;
  };
};

// Root-level modals
// Creator Studio stack (presented modally over the tabs)
export type StudioStackParamList = {
  StudioHome: undefined;
  StudioCapture: undefined;
  // draftId threads through the flow so each screen autosaves to the same draft; the extra
  // optional fields hydrate a screen's own editable state when resuming a draft.
  StudioTrim: { fileUri: string; durationSec?: number; draftId?: string; trimStartMs?: number; trimEndMs?: number };
  StudioFilter: { fileUri: string; durationSec?: number; trimStartMs: number; trimEndMs: number; draftId?: string; filterKey?: string; adjust?: Record<string, number>; mirror?: boolean };
  StudioOverlay: { fileUri: string; durationSec?: number; trimStartMs: number; trimEndMs: number; colorMatrix?: number[] | null; mirror?: boolean; draftId?: string; recipe?: import('../../features/studio/effectRecipe').OverlayRecipe | null };
  StudioDetails: { fileUri: string; durationSec?: number; recipe?: import('../../features/studio/effectRecipe').OverlayRecipe | null; draftId?: string; title?: string; channelId?: string | null; visibility?: 'public' | 'subscribers' };
  StudioCalendar: undefined;
  StudioCollections: undefined;
  StudioCollectionEdit: { collectionId?: string };
};

export type StudioStackScreenProps<T extends keyof StudioStackParamList> =
  NativeStackScreenProps<StudioStackParamList, T>;

export type RootStackParamList = {
  Main: undefined;
  Studio: undefined;
  RecordReaction: RecordStackParamList['RecordReaction'];
  RecordComment: {
    rootSourceId: string;
    sourceType: 'youtube' | 'tiktok' | 'instagram';
    parentCommentId?: string;
    videoTitle?: string;
  };
  // Record a personal intro to attach to a share (returned via pendingIntroStore).
  RecordIntro: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type FeedStackScreenProps<T extends keyof FeedStackParamList> =
  NativeStackScreenProps<FeedStackParamList, T>;

export type FriendsStackScreenProps<T extends keyof FriendsStackParamList> =
  NativeStackScreenProps<FriendsStackParamList, T>;

export type ShareStackScreenProps<T extends keyof ShareStackParamList> =
  NativeStackScreenProps<ShareStackParamList, T>;

export type RecordStackScreenProps<T extends keyof RecordStackParamList> =
  NativeStackScreenProps<RecordStackParamList, T>;

export type AccountStackScreenProps<T extends keyof AccountStackParamList> =
  NativeStackScreenProps<AccountStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, T>;
