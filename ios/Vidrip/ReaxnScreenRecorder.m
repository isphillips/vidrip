#import <React/RCTBridgeModule.h>
#import <ReplayKit/ReplayKit.h>
#import <AVFoundation/AVFoundation.h>

// Pure ObjC implementation so that @try/@catch around appendSampleBuffer is
// reliable. NSExceptions thrown inside Swift closures escape @try/@catch
// because Swift stack frames lack ObjC exception landing pads.

@interface ReaxnScreenRecorder : NSObject <RCTBridgeModule>
@end

@implementation ReaxnScreenRecorder {
  AVAssetWriter        *_writer;
  AVAssetWriterInput   *_videoIn;
  AVAssetWriterInput   *_audioIn;
  NSURL                *_outputURL;
  dispatch_queue_t      _writerQueue;
  BOOL                  _sessionStarted;
  volatile BOOL         _writingStarted;
  volatile BOOL         _cancelled;
  BOOL                  _isStarting;
}

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup { return NO; }

// ---------------------------------------------------------------------------
#pragma mark - startCapture
// ---------------------------------------------------------------------------

RCT_EXPORT_METHOD(startCapture:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  RPScreenRecorder *recorder = [RPScreenRecorder sharedRecorder];
  if (recorder.isRecording || _isStarting) { resolve(nil); return; }

  _isStarting            = YES;
  recorder.microphoneEnabled = YES;

  NSString *name  = [NSString stringWithFormat:@"reaction_%@.mp4", [NSUUID UUID].UUIDString];
  NSURL    *url   = [[NSFileManager defaultManager].temporaryDirectory
                      URLByAppendingPathComponent:name];
  _outputURL      = url;
  _sessionStarted = NO;
  _writingStarted = NO;
  _cancelled      = NO;
  _writerQueue    = dispatch_queue_create("com.reaxn.assetwriter", DISPATCH_QUEUE_SERIAL);

  CGFloat scale = [UIScreen mainScreen].scale;
  CGSize  sz    = [UIScreen mainScreen].bounds.size;

  NSError *setupErr = nil;
  _writer = [AVAssetWriter assetWriterWithURL:url fileType:AVFileTypeMPEG4 error:&setupErr];
  if (setupErr) {
    _isStarting = NO;
    reject(@"SETUP_ERROR", setupErr.localizedDescription, setupErr);
    return;
  }

  _videoIn = [AVAssetWriterInput
    assetWriterInputWithMediaType:AVMediaTypeVideo
    outputSettings:@{
      AVVideoCodecKey:  AVVideoCodecTypeH264,
      AVVideoWidthKey:  @((NSInteger)(sz.width  * scale)),
      AVVideoHeightKey: @((NSInteger)(sz.height * scale)),
      AVVideoCompressionPropertiesKey: @{ AVVideoAverageBitRateKey: @4000000 },
    }];
  _videoIn.expectsMediaDataInRealTime = YES;

  _audioIn = [AVAssetWriterInput
    assetWriterInputWithMediaType:AVMediaTypeAudio
    outputSettings:@{
      AVFormatIDKey:         @(kAudioFormatMPEG4AAC),
      AVSampleRateKey:       @44100,
      AVNumberOfChannelsKey: @2,
      AVEncoderBitRateKey:   @128000,
    }];
  _audioIn.expectsMediaDataInRealTime = YES;

  [_writer addInput:_videoIn];
  [_writer addInput:_audioIn];

  __weak ReaxnScreenRecorder *weak = self;

  [recorder startCaptureWithHandler:^(CMSampleBufferRef sb,
                                       RPSampleBufferType type,
                                       NSError *captureErr) {
    ReaxnScreenRecorder *s = weak;
    if (!s || captureErr || !CMSampleBufferDataIsReady(sb)) return;
    if (!s->_writingStarted || s->_cancelled) return;

    // Drop early on the RP thread to avoid buffering frames in the serial queue.
    if (type == RPSampleBufferTypeVideo    && !s->_videoIn.isReadyForMoreMediaData) return;
    if (type == RPSampleBufferTypeAudioMic && !s->_audioIn.isReadyForMoreMediaData) return;
    if (type != RPSampleBufferTypeVideo && type != RPSampleBufferTypeAudioMic) return;

    // ReplayKit only guarantees the buffer is valid within the handler block,
    // so retain it before the async hop and release it after use.
    CFRetain(sb);

    dispatch_async(s->_writerQueue, ^{
      ReaxnScreenRecorder *ss = weak;
      if (!ss || ss->_cancelled) { CFRelease(sb); return; }
      if (ss->_writer.status != AVAssetWriterStatusWriting) { CFRelease(sb); return; }

      // Wrap startSession AND appendSampleBuffer — either can throw NSException.
      @try {
        if (!ss->_sessionStarted) {
          CMTime pts       = CMSampleBufferGetPresentationTimeStamp(sb);
          CMTime safeStart = CMTIME_IS_VALID(pts)
            ? CMTimeSubtract(pts, CMTimeMake(1, 10))
            : kCMTimeZero;
          [ss->_writer startSessionAtSourceTime:safeStart];
          ss->_sessionStarted = YES;
        }

        if (type == RPSampleBufferTypeVideo) {
          if (ss->_videoIn.isReadyForMoreMediaData) {
            [ss->_videoIn appendSampleBuffer:sb];
          }
        } else {
          if (ss->_audioIn.isReadyForMoreMediaData) {
            [ss->_audioIn appendSampleBuffer:sb];
          }
        }
      } @catch (NSException *) {
        ss->_cancelled = YES;
      }

      CFRelease(sb);
    });

  } completionHandler:^(NSError *startErr) {
    ReaxnScreenRecorder *s = weak;
    if (!s) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"DEALLOCATED", @"Recorder deallocated", nil);
      });
      return;
    }
    s->_isStarting = NO;
    if (startErr) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"START_ERROR", startErr.localizedDescription, startErr);
      });
      return;
    }
    if (![s->_writer startWriting]) {
      NSError *we = s->_writer.error;
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"WRITE_ERROR", we.localizedDescription ?: @"startWriting failed", we);
      });
      return;
    }
    s->_writingStarted = YES;
    dispatch_async(dispatch_get_main_queue(), ^{ resolve(nil); });
  }];
}

// ---------------------------------------------------------------------------
#pragma mark - stopCapture
// ---------------------------------------------------------------------------

RCT_EXPORT_METHOD(stopCapture:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  _cancelled = YES;

  if (![RPScreenRecorder sharedRecorder].isRecording) {
    resolve(@"");
    return;
  }

  __weak ReaxnScreenRecorder *weak = self;
  [[RPScreenRecorder sharedRecorder] stopCaptureWithHandler:^(NSError *err) {
    if (err) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"STOP_ERROR", err.localizedDescription, err);
      });
      return;
    }
    ReaxnScreenRecorder *s = weak;
    if (!s) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"NO_WRITER", @"Recorder deallocated", nil);
      });
      return;
    }
    // Drain writerQueue before finishing — ensures no append races markAsFinished.
    dispatch_async(s->_writerQueue, ^{
      [s->_videoIn markAsFinished];
      [s->_audioIn markAsFinished];
      [s->_writer finishWritingWithCompletionHandler:^{
        dispatch_async(dispatch_get_main_queue(), ^{
          NSString *path = s->_outputURL.path;
          if (path) { resolve(path); }
          else { reject(@"WRITE_ERROR", @"No output path", nil); }
        });
      }];
    });
  }];
}

// ---------------------------------------------------------------------------
#pragma mark - cancelCapture
// ---------------------------------------------------------------------------

RCT_EXPORT_METHOD(cancelCapture:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  _isStarting = NO;
  _cancelled  = YES;

  if (![RPScreenRecorder sharedRecorder].isRecording) {
    resolve(nil);
    return;
  }

  __weak ReaxnScreenRecorder *weak = self;
  [[RPScreenRecorder sharedRecorder] stopCaptureWithHandler:^(NSError *_) {
    ReaxnScreenRecorder *s = weak;
    dispatch_queue_t q = s ? s->_writerQueue : dispatch_get_main_queue();
    dispatch_async(q, ^{
      [s->_writer cancelWriting];
      if (s->_outputURL) {
        [[NSFileManager defaultManager] removeItemAtURL:s->_outputURL error:nil];
      }
      dispatch_async(dispatch_get_main_queue(), ^{ resolve(nil); });
    });
  }];
}

@end
