import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Auth stack
export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  EnterInviteCode: undefined;
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
  Channel: { channelId: string; channelName: string; isPublic: boolean; isJoined: boolean; isOwner: boolean; isMembersOnly?: boolean; inviteOnly?: boolean; ownerHandle?: string; justSubscribed?: boolean };
  InviteToChannel: { channelId: string; channelName: string };
  ChannelPost: { postId: string; channelId: string; isJoined: boolean };
  WatchYouTubePost: { postId: string; channelId: string };
  WatchChannelClip: { postId: string };
  RecordReview: { postId: string; channelId: string };
  WatchReview: { reviewId: string };
  ChannelReviews: { channelId: string; channelName: string };
  ChannelVideoRecord: { channelId: string };
  AddChannelVideo: { channelId: string };
  AddChannelMembers: { channelId: string };
};

export type ChannelsStackScreenProps<T extends keyof ChannelsStackParamList> =
  NativeStackScreenProps<ChannelsStackParamList, T>;

export type AccountStackParamList = {
  AccountHome: undefined;
  EditProfile: undefined;
  InviteManagement: undefined;
  PasswordSetup: undefined;
  TwoFactor: undefined;
};

// Feed stack
export type FeedStackParamList = {
  FeedHome: undefined;
  Thread: { threadId: string };
  WatchReaction: { reactionId: string };
  WatchReview: { reviewId: string };
};

// Friends stack
export type FriendsStackParamList = {
  FriendsHome: undefined;
  AddFriend: undefined;
  InviteManagement: undefined;
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
    videoId: string;
    sourceType?: 'youtube' | 'tiktok' | 'instagram';
    // When the share carries a sender intro, play it before the source video.
    introUrl?: string;
    introDuration?: number;
  };
};

// Root-level modals
export type RootStackParamList = {
  Main: undefined;
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
