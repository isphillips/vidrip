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

  // Dark base everywhere native, BEFORE the RN root mounts, so native-stack push/pop
  // transitions never flash. Three layers cause the flash the JS theme can't reach:
  // (1) the iOS window behind the screens, (2) UINavigationBar's default background, and
  // (3) the bar's default tint, which colors the back chevron + label for one frame
  // before react-native-screens applies headerTintColor — that's the "back button
  // flashes white then settles." We lock all three with the app's own colors.
  UIColor *rootBG = [UIColor colorWithRed:0x17 / 255.0 green:0x07 / 255.0 blue:0x28 / 255.0 alpha:1.0]; // gradient top
  UIColor *headerTint = [UIColor colorWithRed:0xF5 / 255.0 green:0xF0 / 255.0 blue:0xEE / 255.0 alpha:1.0]; // C.INK

  UINavigationBarAppearance *navAppearance = [UINavigationBarAppearance new];
  [navAppearance configureWithOpaqueBackground];
  navAppearance.backgroundColor = rootBG;
  navAppearance.shadowColor = [UIColor clearColor];

  // Back/bar button LABEL color (the chevron glyph color comes from tintColor below).
  // Locking the button appearances means the "Friends" back label never renders with
  // the system default for a frame during the transition.
  UIBarButtonItemAppearance *buttonAppearance = [[UIBarButtonItemAppearance alloc] initWithStyle:UIBarButtonItemStylePlain];
  buttonAppearance.normal.titleTextAttributes = @{ NSForegroundColorAttributeName: headerTint };
  buttonAppearance.highlighted.titleTextAttributes = @{ NSForegroundColorAttributeName: headerTint };
  navAppearance.buttonAppearance = buttonAppearance;
  navAppearance.backButtonAppearance = buttonAppearance;

  UINavigationBar.appearance.tintColor = headerTint;  // back chevron + bar button glyphs
  UINavigationBar.appearance.standardAppearance = navAppearance;
  UINavigationBar.appearance.compactAppearance = navAppearance;
  UINavigationBar.appearance.scrollEdgeAppearance = navAppearance;

  BOOL didFinish = [super application:application didFinishLaunchingWithOptions:launchOptions];

  // The window + root controller view exist once super has built the RN root.
  self.window.backgroundColor = rootBG;
  self.window.rootViewController.view.backgroundColor = rootBG;

  return didFinish;
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
