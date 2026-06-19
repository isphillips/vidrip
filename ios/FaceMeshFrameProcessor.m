#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>

// Exposes the Swift FaceMeshFrameProcessor (478-pt MediaPipe Face Landmarker). See the BlazeFace
// sibling (FaceLandmarksFrameProcessor.m) for the Swift→ObjC header naming notes.
#import "Vidrip-Swift.h"

// Registers the Swift frame-processor plugin under the JS name "faceMesh".
VISION_EXPORT_SWIFT_FRAME_PROCESSOR(FaceMeshFrameProcessor, faceMesh)
