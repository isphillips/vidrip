import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Auth stack
export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  EnterInviteCode: { code?: string } | undefined;
  CreateProfile: { inviteCode: string };
};

// Main tabs. Friends + Account remain registered tabs (reached from the shared top header),
// but the custom MainTabBar only renders buttons for Feed/Channels/Studio/Messages/Browse.
export type MainTabParamList = {
  Feed: undefined;
  Channels: undefined;
  Studio: undefined;
  Share: undefined;
  Messages: undefined;
  Friends: undefined;
  Account: undefined;
};

// Channels stack
export type ChannelsStackParamList = {
  ChannelsHome: undefined;
  Channel: { channelId: string; channelName: string; isPublic?: boolean; isJoined?: boolean; isOwner?: boolean; isMembersOnly?: boolean; inviteOnly?: boolean; ownerHandle?: string; justSubscribed?: boolean; isGroupChat?: boolean };
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
  Channel: { channelId: string; channelName: string; isPublic?: boolean; isJoined?: boolean; isOwner?: boolean; isMembersOnly?: boolean; inviteOnly?: boolean; ownerHandle?: string; justSubscribed?: boolean; isGroupChat?: boolean };
  GiftReveal: { awardId: string };
  ExclusiveCollection: { collectionId: string };
  ExclusiveWatch: { postId: string; channelId: string; title?: string; thumbnail?: string | null; posterId?: string | null };
};

// Messages stack — the conversation/group-chat experience (moved out of Feed). Mirrors the
// conversation screens; opens into FriendConversation / Channel (group) / Thread / reactions.
export type MessagesStackParamList = {
  MessagesHome: undefined;
  AddFriend: undefined;
  InviteContacts: undefined;
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
  ChannelVideoRecord: { channelId: string };
  WatchChannelClip: { postId: string };
  CreateGroupChat: undefined;
  Channel: { channelId: string; channelName: string; isPublic?: boolean; isJoined?: boolean; isOwner?: boolean; isMembersOnly?: boolean; inviteOnly?: boolean; ownerHandle?: string; justSubscribed?: boolean; isGroupChat?: boolean };
  GiftReveal: { awardId: string };
  ExclusiveCollection: { collectionId: string };
  ExclusiveWatch: { postId: string; channelId: string; title?: string; thumbnail?: string | null; posterId?: string | null };
};

export type MessagesStackScreenProps<T extends keyof MessagesStackParamList> =
  NativeStackScreenProps<MessagesStackParamList, T>;

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
    // 'thread' (default) = a friend/group share; 'channel' = a followed-channel post reacted
    // to inline so the doom-react queue can chain channels and threads through one screen.
    kind?: 'thread' | 'channel';
    threadId?: string;                   // required for thread targets; absent for channel targets
    videoId?: string;                    // absent for a Studio-clip reaction (no source video)
    sourceType?: 'youtube' | 'tiktok' | 'instagram' | 'studio';
    // For a Studio-clip reaction the creator's clip plays as the source from this URL.
    sourceUri?: string;
    // Channel-post target — the source video + bunny embed/recipe are resolved lazily on mount.
    postId?: string;
    channelId?: string;
    // Channel doom-react: resolve the channel's FIRST pending post lazily on mount, so tapping a
    // channel transitions to the recorder instantly (it shows its loading state) instead of blocking
    // on a fetch first.
    resolveChannel?: boolean;
    // When the share carries a sender intro, play it before the source video.
    introUrl?: string;
    introDuration?: number;
    // Part of a "doom-react" queue — after saving, advance to the next pending video (reactQueueStore).
    queued?: boolean;
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
  StudioAudio: { fileUri: string; durationSec?: number; trimStartMs: number; trimEndMs: number; colorMatrix?: number[] | null; mirror?: boolean; draftId?: string };
  StudioOverlay: { fileUri: string; durationSec?: number; trimStartMs: number; trimEndMs: number; colorMatrix?: number[] | null; mirror?: boolean; draftId?: string; recipe?: import('../../features/studio/effectRecipe').OverlayRecipe | null };
  StudioDetails: { fileUri: string; durationSec?: number; recipe?: import('../../features/studio/effectRecipe').OverlayRecipe | null; draftId?: string; title?: string; channelId?: string | null; visibility?: 'public' | 'subscribers' };
  StudioCalendar: undefined;
  StudioCollections: undefined;
  StudioCollectionEdit: { collectionId?: string };
  StudioVideoEdit: { postId: string };
};

export type StudioStackScreenProps<T extends keyof StudioStackParamList> =
  NativeStackScreenProps<StudioStackParamList, T>;

export type RootStackParamList = {
  Onboarding: undefined;
  // Closed-launch creator pitch shown to signed-out visitors (gated by CREATOR_INTRO).
  CreatorIntro: undefined;
  Auth: undefined;
  Main: undefined;
  // Friends experience — all root modals (close button, no back), opened from the FriendsMenu in
  // every tab header. Distinct names from the per-tab routes so navigate() bubbles cleanly to root.
  FriendRequests: undefined;
  FriendList: undefined;       // the A–Z friend list (a small modal stack: list → profile)
  FindFriend: undefined;       // search/add a friend
  ImportContacts: undefined;   // invite from device contacts
  InviteCodes: undefined;      // manage invite codes
  CreateGroupChat: undefined;  // start a new group chat
  RecordReaction: RecordStackParamList['RecordReaction'];
  RecordComment: {
    rootSourceId: string;
    sourceType: 'youtube' | 'tiktok' | 'instagram' | 'facebook';
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
