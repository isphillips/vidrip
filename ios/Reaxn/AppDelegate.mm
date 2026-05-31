#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <AVFoundation/AVFoundation.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"Reaxn";
  self.initialProps = @{};

  // Allow react-native-video and WKWebView (YouTube) to play simultaneously.
  // Without this, iOS gives each source exclusive audio session ownership,
  // causing one player to pause the other when both try to play at once.
  [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback
                                   withOptions:AVAudioSessionCategoryOptionMixWithOthers
                                         error:nil];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// Pass deep links (reaxn://) through to React Native Linking
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
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
