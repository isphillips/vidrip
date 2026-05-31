import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Auth stack
export type AuthStackParamList = {
  Welcome: undefined;
  EnterInviteCode: undefined;
  CreateProfile: { inviteCode: string };
};

// Main tabs
export type MainTabParamList = {
  Feed: undefined;
  Friends: undefined;
  Share: undefined;
  Notifications: undefined;
};

// Feed stack
export type FeedStackParamList = {
  FeedHome: undefined;
  Thread: { threadId: string };
  WatchReaction: { reactionId: string };
};

// Friends stack
export type FriendsStackParamList = {
  FriendsHome: undefined;
  AddFriend: undefined;
  Groups: undefined;
  CreateGroup: undefined;
  GroupDetail: { groupId: string };
  InviteManagement: undefined;
};

// Share stack
export type ShareStackParamList = {
  ShareHome: undefined;
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

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, T>;
