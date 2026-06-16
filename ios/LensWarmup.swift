import Foundation
import React

// Preloads the shared MediaPipe FaceLandmarker off the main thread, so the first lens
// selection doesn't stutter on the model load. Called from JS on app start.
@objc(LensWarmup)
class LensWarmup: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(warmUp:rejecter:)
  func warmUp(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      FaceLandmarkerShared.shared.warmUp()
      resolve(nil)
    }
  }
}
