#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <HotUpdater/HotUpdater.h>
#import <AVFoundation/AVFoundation.h>
#import <UserNotifications/UserNotifications.h>
#import <RNCPushNotificationIOS.h>

@interface AppDelegate () <UNUserNotificationCenterDelegate>
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"Vidrip";
  self.initialProps = @{};

  // PlayAndRecord + MixWithOthers + DefaultToSpeaker:
  // PlayAndRecord is required so ReplayKit can access the microphone without
  // fighting the audio session on first launch (pure Playback blocks mic init).
  // MixWithOthers lets YouTube/react-native-video play alongside recording.
  // DefaultToSpeaker keeps audio on the speaker rather than the earpiece.
  [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayAndRecord
                                   withOptions:AVAudioSessionCategoryOptionMixWithOthers |
                                               AVAudioSessionCategoryOptionDefaultToSpeaker
                                         error:nil];

  // Set up notification center delegate so foreground notifications display
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  center.delegate = self;

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// ── Push notification delegates ──────────────────────────────────────────────

- (void)application:(UIApplication *)application
  didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  [RNCPushNotificationIOS didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

- (void)application:(UIApplication *)application
  didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  [RNCPushNotificationIOS didFailToRegisterForRemoteNotificationsWithError:error];
}

- (void)application:(UIApplication *)application
  didReceiveRemoteNotification:(NSDictionary *)userInfo
  fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  [RNCPushNotificationIOS didReceiveRemoteNotification:userInfo
                                fetchCompletionHandler:completionHandler];
}

// Show notification banner even when app is in foreground
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler
{
  completionHandler(UNNotificationPresentationOptionSound |
                    UNNotificationPresentationOptionAlert |
                    UNNotificationPresentationOptionBadge);
}

// User tapped a notification
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
  didReceiveNotificationResponse:(UNNotificationResponse *)response
           withCompletionHandler:(void (^)(void))completionHandler
{
  [RNCPushNotificationIOS didReceiveNotificationResponse:response];
  completionHandler();
}

// ── Deep links & bundle URL ──────────────────────────────────────────────────

- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
  return [RCTLinkingManager application:application openURL:url options:options];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
  
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  // OTA: serve the latest downloaded bundle (falls back to the embedded main.jsbundle).
  return [HotUpdater bundleURL];
#endif
}

@end
