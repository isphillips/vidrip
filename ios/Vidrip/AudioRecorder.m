#import "AudioRecorder.h"
#import <AVFoundation/AVFoundation.h>

@implementation AudioRecorder {
  AVAudioRecorder *_recorder;
  NSURL            *_outputURL;
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

@end
