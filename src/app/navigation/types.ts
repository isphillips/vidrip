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
  Channel: { channelId: string; channelName: string; isPublic: boolean; isJoined: boolean; isOwner: boolean };
  ChannelPost: { postId: string; channelId: string; isJoined: boolean };
  WatchYouTubePost: { postId: string; channelId: string };
  WatchChannelClip: { postId: string };
  ChannelVideoRecord: { channelId: string };
  AddChannelVideo: { channelId: string };
};

export type ChannelsStackScreenProps<T extends keyof ChannelsStackParamList> =
  NativeStackScreenProps<ChannelsStackParamList, T>;

export type AccountStackParamList = {
  AccountHome: undefined;
  InviteManagement: undefined;
  PasswordSetup: undefined;
};

// Feed stack
export type FeedStackParamList = {
  FeedHome: undefined;
  Thread: { threadId: string };
  WatchReaction: { reactionId: string; videoId: string };
};

// Friends stack
export type FriendsStackParamList = {
  FriendsHome: undefined;
  AddFriend: undefined;
  InviteManagement: undefined;
};

// Share stack
export type ShareStackParamList = {
  ShareHome: undefined;
  VideoPreview: { videoId: string; videoTitle: string; videoThumbnail: string; channelTitle: string };
  SelectRecipients: { videoId: string; videoTitle: string; videoThumbnail: string };
};

// Record stack
export type RecordStackParamList = {
  RecordReaction: { threadId: string; videoId: string };
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
