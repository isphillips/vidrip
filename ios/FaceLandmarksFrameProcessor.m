#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>

// The generated Swift→ObjC header exposes the Swift FaceLandmarksFrameProcessor class. The
// name is "<ProductModuleName>-Swift.h" — usually the target name. If the build can't find
// this file, check Build Settings → "Product Module Name" and match it here.
#import "Vidrip-Swift.h"

// Registers the Swift frame-processor plugin under the JS name "faceLandmarks".
VISION_EXPORT_SWIFT_FRAME_PROCESSOR(FaceLandmarksFrameProcessor, faceLandmarks)
