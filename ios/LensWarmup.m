#import <React/RCTBridgeModule.h>

// Bridges the Swift LensWarmupModule (preloads the MediaPipe face model at app start).
@interface RCT_EXTERN_MODULE(LensWarmup, NSObject)
RCT_EXTERN_METHOD(warmUp:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
