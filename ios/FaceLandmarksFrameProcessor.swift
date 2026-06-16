import VisionCamera
import MediaPipeTasksVision
import Foundation
import QuartzCore

// Thin VisionCamera frame-processor plugin: runs MediaPipe FaceLandmarker on each frame and
// returns the raw normalized mesh ({ "points": [[x,y], ...] }) or nil. All index→anchor
// reduction lives in JS (faceTracking.ts), so tuning needs no rebuild.
//
// Requires the `face_landmarker.task` model bundled in the app target (Build Phases → Copy
// Bundle Resources), and the `MediaPipeTasksVision` pod. Add this file + the .m to the target.
// One shared FaceLandmarker (VIDEO mode) so the launch-time warm-up and the frame processor load
// the model once. VIDEO mode tracks the face across frames — far fewer dropped detections than
// stateless IMAGE mode, so the overlay stops flashing and moves smoothly. It needs monotonically
// increasing timestamps per detector; we use CACurrentMediaTime (process uptime), which always
// increases — even across a JS reload — so the persisted singleton never sees time go backwards.
@objc public final class FaceLandmarkerShared: NSObject {
  @objc public static let shared = FaceLandmarkerShared()
  private let lock = NSLock()
  public private(set) var landmarker: FaceLandmarker?

  @objc public func warmUp() {
    lock.lock(); defer { lock.unlock() }
    if landmarker != nil { return }
    guard let path = Bundle.main.path(forResource: "face_landmarker", ofType: "task") else { return }
    let opts = FaceLandmarkerOptions()
    opts.baseOptions.modelAssetPath = path
    opts.runningMode = .video
    opts.numFaces = 1
    // Lower thresholds → acquires the face more readily; tracking confidence keeps the lock smooth.
    opts.minFaceDetectionConfidence = 0.3
    opts.minFacePresenceConfidence = 0.3
    opts.minTrackingConfidence = 0.3
    landmarker = try? FaceLandmarker(options: opts)
  }
}

@objc(FaceLandmarksFrameProcessor)
public class FaceLandmarksFrameProcessor: FrameProcessorPlugin {

  // The orientation we feed MediaPipe, captured (and pinned) from the first frame. The app is
  // portrait-locked, so the first frame is portrait; pinning it means physically rotating the
  // phone no longer flips frame.orientation mid-session (which re-oriented the landmarks and made
  // the lens spin). The face simply rotates within the fixed portrait frame, and the landmarks
  // (and lens) follow it — no orientation jump.
  private var lockedOrientation: UIImage.Orientation?

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    super.init(proxy: proxy, options: options)
    FaceLandmarkerShared.shared.warmUp()
  }

  // The front-camera buffer reaches MediaPipe vertically flipped (it detects the face upside-down:
  // nose above eyes), which JS coordinate math can't undo without breaking absolute position. Add
  // a vertical mirror on top of the frame orientation so MediaPipe sees a truly upright face.
  private func vFlip(_ o: UIImage.Orientation) -> UIImage.Orientation {
    switch o {
    case .up: return .downMirrored
    case .down: return .upMirrored
    case .left: return .rightMirrored
    case .right: return .leftMirrored
    case .upMirrored: return .down
    case .downMirrored: return .up
    case .leftMirrored: return .right
    case .rightMirrored: return .left
    @unknown default: return o
    }
  }

  // Rotate the displayed image an extra 90° clockwise. The flipped frame still reaches MediaPipe
  // rotated 90° (eyes detected stacked vertically), so it detects a sideways face and is fragile to
  // tilt; this extra turn makes MediaPipe see a truly upright face → robust to head/phone tilt.
  private func rot90CW(_ o: UIImage.Orientation) -> UIImage.Orientation {
    switch o {
    case .up: return .right
    case .right: return .down
    case .down: return .left
    case .left: return .up
    case .upMirrored: return .leftMirrored
    case .leftMirrored: return .downMirrored
    case .downMirrored: return .rightMirrored
    case .rightMirrored: return .upMirrored
    @unknown default: return o
    }
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    guard let landmarker = FaceLandmarkerShared.shared.landmarker else { return ["err": "no_model"] }
    // Baseline: hand MediaPipe the frame's natural orientation (best detection). Pin it so device
    // rotation can't change it mid-session. All coordinate rotation/mirror is done in JS.
    if lockedOrientation == nil { lockedOrientation = frame.orientation }
    let orientation = lockedOrientation ?? frame.orientation
    let image: MPImage
    do { image = try MPImage(sampleBuffer: frame.buffer, orientation: orientation) }
    catch { return ["err": "no_image"] }
    // VIDEO mode: feed a monotonically-increasing timestamp (process uptime in ms).
    let ts = Int(CACurrentMediaTime() * 1000)
    guard let result = try? landmarker.detect(videoFrame: image, timestampInMilliseconds: ts) else { return ["err": "detect_fail"] }
    guard let face = result.faceLandmarks.first else { return ["err": "no_face"] }
    var pts: [[Double]] = []
    pts.reserveCapacity(face.count)
    for lm in face { pts.append([Double(lm.x), Double(lm.y)]) }
    return ["points": pts]
  }
}
