#import "AudioRecorder.h"
#import <AVFoundation/AVFoundation.h>

@implementation AudioRecorder {
  AVAudioRecorder *_recorder;
  NSURL            *_outputURL;
  BOOL             _mixingEnabled;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    [[NSNotificationCenter defaultCenter]
      addObserver:self
         selector:@selector(handleAudioInterruption:)
             name:AVAudioSessionInterruptionNotification
           object:[AVAudioSession sharedInstance]];
  }
  return self;
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)handleAudioInterruption:(NSNotification *)notification {
  if (!_mixingEnabled) { return; }
  NSNumber *type = notification.userInfo[AVAudioSessionInterruptionTypeKey];
  if (type.unsignedIntegerValue == AVAudioSessionInterruptionTypeBegan) {
    // Re-assert mixing mode after brief delay to let the interruptor settle
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      NSError *err = nil;
      AVAudioSession *session = [AVAudioSession sharedInstance];
      [session setCategory:AVAudioSessionCategoryPlayback
               withOptions:AVAudioSessionCategoryOptionMixWithOthers
                     error:&err];
      [session setActive:YES error:&err];
      NSLog(@"[AudioRecorder] re-asserted MixWithOthers after interruption, err=%@", err);
    });
  }
}

RCT_EXPORT_MODULE()
+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(startRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  // Configure audio session for recording, mixing with existing audio
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSError *sessionErr = nil;
  [session setCategory:AVAudioSessionCategoryPlayAndRecord
           withOptions:AVAudioSessionCategoryOptionMixWithOthers |
                       AVAudioSessionCategoryOptionDefaultToSpeaker
                 error:&sessionErr];
  _mixingEnabled = NO;
  [session setActive:YES error:&sessionErr];
  if (sessionErr) {
    reject(@"SESSION_ERROR", sessionErr.localizedDescription, sessionErr);
    return;
  }

  NSString *name = [NSString stringWithFormat:@"audio_%@.m4a", [NSUUID UUID].UUIDString];
  _outputURL = [[NSFileManager defaultManager].temporaryDirectory
                 URLByAppendingPathComponent:name];

  NSDictionary *settings = @{
    AVFormatIDKey:         @(kAudioFormatMPEG4AAC),
    AVSampleRateKey:       @44100,
    AVNumberOfChannelsKey: @1,
    AVEncoderBitRateKey:   @64000,
  };

  NSError *err = nil;
  _recorder = [[AVAudioRecorder alloc] initWithURL:_outputURL settings:settings error:&err];
  if (err) {
    reject(@"SETUP_ERROR", err.localizedDescription, err);
    return;
  }

  [_recorder prepareToRecord];
  BOOL started = [_recorder record];
  if (!started) {
    reject(@"RECORD_ERROR", @"AVAudioRecorder failed to start — check microphone permission", nil);
    _recorder = nil;
    return;
  }
  resolve(nil);
}

RCT_EXPORT_METHOD(stopRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (!_recorder) { reject(@"NO_RECORDER", @"Not recording", nil); return; }
  NSTimeInterval duration = _recorder.currentTime;
  [_recorder stop];
  NSString *path = _outputURL.path;
  _recorder = nil;
  resolve(@{ @"path": path, @"duration": @(duration) });
}

RCT_EXPORT_METHOD(cancelRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (_recorder) { [_recorder stop]; [_recorder deleteRecording]; _recorder = nil; }
  resolve(nil);
}

// Re-asserts the audio session for mic recording (PlayAndRecord) and clears the
// mixing flag, so handleAudioInterruption won't fight VisionCamera's session setup.
// Call this before VisionCamera startRecording when NOT in music (pre-mode) flow.
RCT_EXPORT_METHOD(configureForVideoRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  _mixingEnabled = NO;
  NSError *err = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryPlayAndRecord
              withOptions:AVAudioSessionCategoryOptionMixWithOthers |
                          AVAudioSessionCategoryOptionDefaultToSpeaker |
                          AVAudioSessionCategoryOptionAllowBluetooth |
                          AVAudioSessionCategoryOptionAllowBluetoothA2DP |
                          AVAudioSessionCategoryOptionAllowAirPlay
                    mode:AVAudioSessionModeVideoRecording
                   error:&err];
  [session setActive:YES error:nil];
  NSLog(@"[AudioRecorder] configureForVideoRecording err=%@", err);
  resolve(nil);
}

// Forces AVAudioSession into mixing mode so react-native-video and a
// YouTube WebView can play simultaneously without either interrupting the other.
RCT_EXPORT_METHOD(configureForMixedPlayback:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSLog(@"[AudioRecorder] configureForMixedPlayback called");
  NSError *err = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  BOOL ok = [session setCategory:AVAudioSessionCategoryPlayback
                     withOptions:AVAudioSessionCategoryOptionMixWithOthers
                           error:&err];
  NSLog(@"[AudioRecorder] setCategory ok=%d err=%@", ok, err);
  [session setActive:YES error:&err];
  NSLog(@"[AudioRecorder] setActive err=%@", err);
  if (err) { reject(@"AUDIO_ERROR", err.localizedDescription, err); return; }
  _mixingEnabled = YES;
  resolve(nil);
}

RCT_EXPORT_METHOD(checkHeadphonesConnected:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  AVAudioSession *session = [AVAudioSession sharedInstance];
  NSArray<NSString *> *headphonePorts = @[
    AVAudioSessionPortHeadphones,
    AVAudioSessionPortBluetoothA2DP,
    AVAudioSessionPortBluetoothLE,
    AVAudioSessionPortBluetoothHFP,
  ];
  for (AVAudioSessionPortDescription *output in session.currentRoute.outputs) {
    if ([headphonePorts containsObject:output.portType]) {
      resolve(@YES);
      return;
    }
  }
  resolve(@NO);
}

RCT_EXPORT_METHOD(routeAudioToSpeaker:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *err = nil;
  [[AVAudioSession sharedInstance] overrideOutputAudioPort:AVAudioSessionPortOverrideSpeaker error:&err];
  if (err) { reject(@"ROUTE_ERROR", err.localizedDescription, err); return; }
  resolve(nil);
}

RCT_EXPORT_METHOD(restoreAudioRoute:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *err = nil;
  [[AVAudioSession sharedInstance] overrideOutputAudioPort:AVAudioSessionPortOverrideNone error:&err];
  if (err) { reject(@"ROUTE_ERROR", err.localizedDescription, err); return; }
  resolve(nil);
}

@end
