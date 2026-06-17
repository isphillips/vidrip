import VisionCamera
import MediaPipeTasksVision
import Foundation
import QuartzCore

// Thin VisionCamera frame-processor plugin: runs MediaPipe FaceDetector (BlazeFace, short-range) on
// each frame and returns the 6 normalized keypoints ({ "points": [[x,y], ...] }) or nil. BlazeFace
// is far lighter than the 478-pt FaceLandmarker mesh and gives exactly the anchors the lenses use:
//   [0]=right eye  [1]=left eye  [2]=nose tip  [3]=mouth  [4]=right ear  [5]=left ear
// Index→anchor reduction (and orientation/mirror) lives in JS (faceTracking.ts).
//
// Requires the `blaze_face_short_range.tflite` model bundled in the app target (Build Phases → Copy
// Bundle Resources), and the `MediaPipeTasksVision` pod. One shared FaceDetector (VIDEO mode) so the
// launch-time warm-up and the frame processor load the model once. VIDEO mode needs monotonically
// increasing timestamps per detector; we use CACurrentMediaTime (process uptime), which always
// increases — even across a JS reload — so the persisted singleton never sees time go backwards.
@objc public final class FaceLandmarkerShared: NSObject {
  @objc public static let shared = FaceLandmarkerShared()
  private let lock = NSLock()
  public private(set) var detector: FaceDetector?

  @objc public func warmUp() {
    lock.lock(); defer { lock.unlock() }
    if detector != nil { return }
    guard let path = Bundle.main.path(forResource: "blaze_face_short_range", ofType: "tflite") else {
      NSLog("[FaceDetector] model not found in bundle")
      return
    }
    // Prefer the GPU (Metal) delegate; fall back to CPU if GPU init fails.
    if let gpu = Self.build(path: path, delegate: .GPU) {
      detector = gpu
      NSLog("[FaceDetector] delegate=GPU")
    } else {
      detector = Self.build(path: path, delegate: .CPU)
      NSLog("[FaceDetector] delegate=\(detector != nil ? "CPU" : "none")")
    }
  }

  private static func build(path: String, delegate: Delegate) -> FaceDetector? {
    let opts = FaceDetectorOptions()
    opts.baseOptions.modelAssetPath = path
    opts.baseOptions.delegate = delegate
    opts.runningMode = .video
    opts.minDetectionConfidence = 0.5
    return try? FaceDetector(options: opts)
  }
}

@objc(FaceLandmarksFrameProcessor)
public class FaceLandmarksFrameProcessor: FrameProcessorPlugin {

  // The orientation we feed MediaPipe, captured (and pinned) from the first frame. The app is
  // portrait-locked, so the first frame is portrait; pinning it means physically rotating the
  // phone no longer flips frame.orientation mid-session.
  private var lockedOrientation: UIImage.Orientation?

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    super.init(proxy: proxy, options: options)
    FaceLandmarkerShared.shared.warmUp()
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    guard let detector = FaceLandmarkerShared.shared.detector else { return ["err": "no_model"] }
    if lockedOrientation == nil { lockedOrientation = frame.orientation }
    let orientation = lockedOrientation ?? frame.orientation
    let image: MPImage
    do { image = try MPImage(sampleBuffer: frame.buffer, orientation: orientation) }
    catch { return ["err": "no_image"] }
    // VIDEO mode: feed a monotonically-increasing timestamp (process uptime in ms).
    let ts = Int(CACurrentMediaTime() * 1000)
    guard let result = try? detector.detect(videoFrame: image, timestampInMilliseconds: ts) else { return ["err": "detect_fail"] }
    guard let det = result.detections.first, let kps = det.keypoints, kps.count >= 6 else { return ["err": "no_face"] }
    var pts: [[Double]] = []
    pts.reserveCapacity(kps.count)
    for k in kps { pts.append([Double(k.location.x), Double(k.location.y)]) }
    return ["points": pts]
  }
}
