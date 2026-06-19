#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreImage/CoreImage.h>
#import <UIKit/UIKit.h>

// Studio export module. Bakes a non-destructive "recipe" into a single MP4.
// Slice 1: trim of clips[0] only (filter/overlays land in later slices via
// AVVideoComposition). Pure ObjC to match the repo's other native modules.

@interface StudioExporter : NSObject <RCTBridgeModule>
@end

@implementation StudioExporter

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup { return NO; }

// Accept both "file:///…" and bare "/…" paths coming from JS.
static NSURL *URLFromUri(NSString *uri) {
  if (uri.length == 0) { return nil; }
  if ([uri hasPrefix:@"file://"]) { return [NSURL URLWithString:uri]; }
  return [NSURL fileURLWithPath:uri];
}

// The look applied identically in preview (Skia <ColorMatrix>) and bake: mirror, then
// a 4×5 RGBA color matrix via CIColorMatrix (same 20 numbers the Skia preview uses).
// `m` is a 20-element NSArray<NSNumber> (row-major RGBA + bias); nil = no color change.
static CIImage *ApplyLook(CIImage *img, NSArray *m, BOOL mirror, CGRect extent) {
  if (mirror) {
    img = [img imageByApplyingTransform:CGAffineTransformMake(-1, 0, 0, 1, extent.size.width, 0)];
  }
  if ([m isKindOfClass:[NSArray class]] && m.count == 20) {
    double v[20];
    for (NSInteger i = 0; i < 20; i++) { v[i] = [m[i] doubleValue]; }
    CIFilter *cm = [CIFilter filterWithName:@"CIColorMatrix"];
    [cm setValue:img forKey:kCIInputImageKey];
    [cm setValue:[CIVector vectorWithX:v[0]  Y:v[1]  Z:v[2]  W:v[3]]  forKey:@"inputRVector"];
    [cm setValue:[CIVector vectorWithX:v[5]  Y:v[6]  Z:v[7]  W:v[8]]  forKey:@"inputGVector"];
    [cm setValue:[CIVector vectorWithX:v[10] Y:v[11] Z:v[12] W:v[13]] forKey:@"inputBVector"];
    [cm setValue:[CIVector vectorWithX:v[15] Y:v[16] Z:v[17] W:v[18]] forKey:@"inputAVector"];
    [cm setValue:[CIVector vectorWithX:v[4]  Y:v[9]  Z:v[14] W:v[19]] forKey:@"inputBiasVector"];
    img = cm.outputImage ?: img;
  }
  return [img imageByCroppingToRect:extent];
}

// Render a pitch-shifted ("deep") copy of an audio file offline via AVAudioUnitTimePitch. Pitch is in
// cents (negative = lower). timePitch preserves duration, so the result stays in sync with the video.
// Writes float PCM to a temp .caf (re-encoded to AAC by the final video export). nil on failure.
static NSURL *PitchShiftFile(NSURL *inURL, float pitchCents) {
  NSError *err = nil;
  AVAudioFile *inFile = [[AVAudioFile alloc] initForReading:inURL error:&err];
  AVAudioFormat *fmt = inFile.processingFormat;

  AVAudioEngine *engine = [[AVAudioEngine alloc] init];
  AVAudioPlayerNode *player = [[AVAudioPlayerNode alloc] init];
  AVAudioUnitTimePitch *pitch = [[AVAudioUnitTimePitch alloc] init];
  pitch.pitch = pitchCents;
  [engine attachNode:player];
  [engine attachNode:pitch];
  [engine connect:player to:pitch format:fmt];
  [engine connect:pitch to:engine.mainMixerNode format:fmt];

  if (![engine enableManualRenderingMode:AVAudioEngineManualRenderingModeOffline
                                  format:fmt
                       maximumFrameCount:4096
                                   error:&err]) { return nil; }
  [player scheduleFile:inFile atTime:nil completionHandler:nil];
  if (![engine startAndReturnError:&err]) { return nil; }
  [player play];

  NSURL *outURL = [[NSFileManager defaultManager].temporaryDirectory
                    URLByAppendingPathComponent:[NSString stringWithFormat:@"voice_%@.caf", [NSUUID UUID].UUIDString]];
  AVAudioFile *outFile = [[AVAudioFile alloc] initForWriting:outURL
                                                    settings:engine.manualRenderingFormat.settings
                                                commonFormat:AVAudioPCMFormatFloat32
                                                 interleaved:NO
                                                       error:&err];

  AVAudioPCMBuffer *buf = [[AVAudioPCMBuffer alloc] initWithPCMFormat:engine.manualRenderingFormat
                                                       frameCapacity:engine.manualRenderingMaximumFrameCount];
  AVAudioFramePosition total = inFile.length;
  BOOL ok = YES;
  while (engine.manualRenderingSampleTime < total) {
    AVAudioFrameCount frames = (AVAudioFrameCount)MIN((AVAudioFramePosition)buf.frameCapacity, total - engine.manualRenderingSampleTime);
    AVAudioEngineManualRenderingStatus status = [engine renderOffline:frames toBuffer:buf error:&err];
    if (status == AVAudioEngineManualRenderingStatusSuccess) {
      if (![outFile writeFromBuffer:buf error:&err]) { ok = NO; break; }
    } else if (status == AVAudioEngineManualRenderingStatusInsufficientDataFromInputNode) {
      break; // input exhausted — done
    } else {
      ok = NO; break;
    }
  }
  [player stop];
  [engine stop];
  return ok ? outURL : nil;
}

RCT_EXPORT_METHOD(export:(NSDictionary *)recipe
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSArray *clips = recipe[@"clips"];
  if (![clips isKindOfClass:[NSArray class]] || clips.count == 0) {
    reject(@"BAD_RECIPE", @"Recipe has no clips", nil);
    return;
  }
  NSDictionary *clip = clips[0];
  NSURL *srcURL = URLFromUri(clip[@"uri"]);
  if (!srcURL) {
    reject(@"BAD_RECIPE", @"Clip is missing a source uri", nil);
    return;
  }

  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:srcURL options:nil];
  AVAssetTrack *srcVideo = [asset tracksWithMediaType:AVMediaTypeVideo].firstObject;
  if (!srcVideo) {
    reject(@"NO_VIDEO", @"Source has no video track", nil);
    return;
  }
  AVAssetTrack *srcAudio = [asset tracksWithMediaType:AVMediaTypeAudio].firstObject;

  // Resolve the trim window [start, end] clamped to the source duration.
  CMTime duration = asset.duration;
  double startMs = [clip[@"trimStartMs"] doubleValue];
  CMTime start = CMTimeMakeWithSeconds(MAX(0.0, startMs / 1000.0), 600);
  CMTime end = clip[@"trimEndMs"]
    ? CMTimeMakeWithSeconds([clip[@"trimEndMs"] doubleValue] / 1000.0, 600)
    : duration;
  if (CMTIME_COMPARE_INLINE(end, >, duration)) { end = duration; }
  if (CMTIME_COMPARE_INLINE(start, >=, end)) {
    reject(@"BAD_TRIM", @"Empty trim window", nil);
    return;
  }
  CMTimeRange range = CMTimeRangeFromTimeToTime(start, end);

  // Build the composition: trimmed video (+ audio if present).
  AVMutableComposition *comp = [AVMutableComposition composition];
  AVMutableCompositionTrack *vTrack =
    [comp addMutableTrackWithMediaType:AVMediaTypeVideo
                      preferredTrackID:kCMPersistentTrackID_Invalid];
  NSError *insertErr = nil;
  if (![vTrack insertTimeRange:range ofTrack:srcVideo atTime:kCMTimeZero error:&insertErr]) {
    reject(@"COMPOSE_ERROR", insertErr.localizedDescription ?: @"video insert failed", insertErr);
    return;
  }
  // Preserve orientation — without this, portrait clips export rotated.
  vTrack.preferredTransform = srcVideo.preferredTransform;

  if (srcAudio) {
    AVMutableCompositionTrack *aTrack =
      [comp addMutableTrackWithMediaType:AVMediaTypeAudio
                        preferredTrackID:kCMPersistentTrackID_Invalid];
    // "React Anonymously": pitch the voice down. Render a deep copy of the trimmed audio offline and
    // mux that instead of the original; fall back to the original if the render fails.
    BOOL deepVoice = [recipe[@"voiceMod"] isKindOfClass:[NSString class]] && [recipe[@"voiceMod"] isEqualToString:@"deep"];
    NSURL *pitchedURL = deepVoice ? [self renderDeepVoiceFromAsset:asset range:range] : nil;
    AVURLAsset *pitched = pitchedURL ? [AVURLAsset URLAssetWithURL:pitchedURL options:nil] : nil;
    AVAssetTrack *pTrack = pitched ? [pitched tracksWithMediaType:AVMediaTypeAudio].firstObject : nil;
    if (pTrack) {
      [aTrack insertTimeRange:CMTimeRangeMake(kCMTimeZero, pitched.duration) ofTrack:pTrack atTime:kCMTimeZero error:nil];
    } else {
      [aTrack insertTimeRange:range ofTrack:srcAudio atTime:kCMTimeZero error:nil];
    }
  }

  // Optional look baked per-frame via AVVideoComposition: mirror → color adjust →
  // preset filter, in that order. applyingCIFiltersWithHandler delivers frames already
  // in display orientation, so a horizontal flip about the extent width is a true mirror.
  NSArray *colorMatrix = [recipe[@"colorMatrix"] isKindOfClass:[NSArray class]] ? recipe[@"colorMatrix"] : nil;
  BOOL mirror = [recipe[@"mirror"] boolValue];

  // Pre-rendered overlay layer (transparent PNG) composited over every frame, scaled to
  // fill. Loaded once. NOT mirrored (it sits on top as UI), so text stays readable.
  NSDictionary *overlayDict = [recipe[@"overlay"] isKindOfClass:[NSDictionary class]] ? recipe[@"overlay"] : nil;
  NSURL *overlayURL = overlayDict ? URLFromUri(overlayDict[@"uri"]) : nil;
  CIImage *overlayCI = overlayURL ? [CIImage imageWithContentsOfURL:overlayURL] : nil;

  // Animated overlay: a real-time-sampled frame loop. We composite the time-matched frame
  // onto each output frame and crossfade the last `overlap` frames back into the first so
  // the repeat has no visible seam. Takes precedence over the static overlay.
  NSDictionary *framesDict = [recipe[@"overlayFrames"] isKindOfClass:[NSDictionary class]] ? recipe[@"overlayFrames"] : nil;
  NSArray *frameUris = [framesDict[@"uris"] isKindOfClass:[NSArray class]] ? framesDict[@"uris"] : nil;
  double framesFps = [framesDict[@"fps"] doubleValue];
  NSInteger overlap = [framesDict[@"overlap"] integerValue];
  NSMutableArray<CIImage *> *frames = nil;
  if (frameUris.count > 1 && framesFps > 0) {
    frames = [NSMutableArray arrayWithCapacity:frameUris.count];
    for (NSString *u in frameUris) {
      NSURL *fu = URLFromUri(u);
      CIImage *ci = fu ? [CIImage imageWithContentsOfURL:fu] : nil;
      if (ci) { [frames addObject:ci]; }
    }
    if (frames.count < 2) { frames = nil; }
  }
  // Clamp overlap to a sane range; `loopLen` is the seamless cycle length in frames.
  if (overlap < 0) { overlap = 0; }
  if (frames && overlap > frames.count / 2) { overlap = frames.count / 2; }
  NSInteger loopLen = frames ? (NSInteger)frames.count - overlap : 0;

  AVVideoComposition *videoComp = nil;
  if (colorMatrix || mirror || overlayCI || frames) {
    videoComp = [AVVideoComposition videoCompositionWithAsset:comp
      applyingCIFiltersWithHandler:^(AVAsynchronousCIImageFilteringRequest *request) {
        CGRect extent = request.sourceImage.extent;
        CIImage *out = ApplyLook(request.sourceImage, colorMatrix, mirror, extent);

        // Pick the overlay image for this instant: animated frame (crossfaded loop) or static PNG.
        CIImage *ovTop = nil;
        CGRect oe = CGRectZero; // the overlay's own (finite) extent, for fill scaling
        if (frames && loopLen > 0) {
          oe = ((CIImage *)frames[0]).extent; // every frame shares the capture size
          double t = CMTimeGetSeconds(request.compositionTime);
          double loopDur = (double)loopLen / framesFps;
          double tt = fmod(t, loopDur); if (tt < 0) { tt += loopDur; }
          NSInteger i = (NSInteger)floor(tt * framesFps);
          if (i < 0) { i = 0; }
          if (i >= loopLen) { i = loopLen - 1; }
          if (overlap > 0 && i < overlap) {
            // Blend the tail frame (loopLen+i) out as the head frame (i) comes in.
            CIImage *head = frames[i];
            CIImage *tail = frames[loopLen + i];
            double a = ((double)i + 0.5) / (double)overlap; // 0 → tail, 1 → head
            CIFilter *diss = [CIFilter filterWithName:@"CIDissolveTransition"];
            [diss setValue:tail forKey:kCIInputImageKey];
            [diss setValue:head forKey:kCIInputTargetImageKey];
            [diss setValue:@(a) forKey:kCIInputTimeKey];
            // Dissolve can report an infinite extent — clamp it back to the frame size.
            ovTop = diss.outputImage ? [diss.outputImage imageByCroppingToRect:oe] : head;
          } else {
            ovTop = frames[i];
          }
        } else if (overlayCI) {
          ovTop = overlayCI;
          oe = overlayCI.extent;
        }

        if (ovTop) {
          // PNG and CVPixelBuffer-backed frames share the same top-left raster order in CIImage
          // space — no coordinate flip needed; just scale the overlay to fill the frame.
          CIImage *ov = [ovTop imageByApplyingTransform:CGAffineTransformMakeScale(extent.size.width / oe.size.width,
                                                                                   extent.size.height / oe.size.height)];
          CIFilter *over = [CIFilter filterWithName:@"CISourceOverCompositing"];
          [over setValue:[ov imageByCroppingToRect:extent] forKey:kCIInputImageKey];
          [over setValue:out forKey:kCIInputBackgroundImageKey];
          out = over.outputImage ?: out;
        }
        [request finishWithImage:[out imageByCroppingToRect:extent] context:nil];
      }];
  }

  // Export to a fresh temp MP4.
  NSString *name = [NSString stringWithFormat:@"studio_%@.mp4", [NSUUID UUID].UUIDString];
  NSURL *outURL = [[NSFileManager defaultManager].temporaryDirectory
                    URLByAppendingPathComponent:name];

  // Force H.264 (not HEVC). HighestQuality emits HEVC on modern iPhones, and Bunny's
  // transcode of HEVC inputs bakes a green first frame; the resolution presets are H.264.
  AVAssetExportSession *session =
    [[AVAssetExportSession alloc] initWithAsset:comp
                                     presetName:AVAssetExportPreset1920x1080];
  if (!session) {
    reject(@"NO_SESSION", @"Could not create export session", nil);
    return;
  }
  session.outputURL = outURL;
  session.outputFileType = AVFileTypeMPEG4;
  session.shouldOptimizeForNetworkUse = YES;
  if (videoComp) { session.videoComposition = videoComp; }

  [session exportAsynchronouslyWithCompletionHandler:^{
    switch (session.status) {
      case AVAssetExportSessionStatusCompleted:
        resolve(outURL.path);
        break;
      case AVAssetExportSessionStatusCancelled:
        reject(@"CANCELLED", @"Export cancelled", session.error);
        break;
      default:
        reject(@"EXPORT_ERROR",
               session.error.localizedDescription ?: @"Export failed",
               session.error);
        break;
    }
  }];
}

// Produce a pitch-shifted ("deep") audio file for the trimmed range. Exports just the trimmed audio
// to a temp m4a (so AVAudioFile can read it), then renders it through AVAudioUnitTimePitch offline.
// Runs synchronously (the export module method is already off the main thread). nil on failure.
- (NSURL *)renderDeepVoiceFromAsset:(AVAsset *)asset range:(CMTimeRange)range
{
  AVAssetExportSession *aexp =
    [[AVAssetExportSession alloc] initWithAsset:asset presetName:AVAssetExportPresetAppleM4A];
  if (!aexp) { return nil; }
  NSURL *trimmedURL = [[NSFileManager defaultManager].temporaryDirectory
                        URLByAppendingPathComponent:[NSString stringWithFormat:@"voicesrc_%@.m4a", [NSUUID UUID].UUIDString]];
  aexp.outputURL = trimmedURL;
  aexp.outputFileType = AVFileTypeAppleM4A;
  aexp.timeRange = range;

  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  [aexp exportAsynchronouslyWithCompletionHandler:^{ dispatch_semaphore_signal(sem); }];
  dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(60 * NSEC_PER_SEC)));
  if (aexp.status != AVAssetExportSessionStatusCompleted) { return nil; }

  return PitchShiftFile(trimmedURL, -500.0f); // ≈ down 5 semitones, matches Android's 0.72 pitch
}

@end
