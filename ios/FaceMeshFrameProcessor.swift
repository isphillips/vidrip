import VisionCamera
import MediaPipeTasksVision
import Foundation
import QuartzCore

// VisionCamera frame-processor plugin: runs MediaPipe **Face Landmarker** (478-pt mesh) per frame and
// reduces it — on the native side, to keep the JS bridge cheap — to the SAME 6-anchor contract the
// lighter BlazeFace plugin returns, so the JS orientation/reduce path is shared and unchanged:
//   { points: [[x,y]×6] }  →  [0]=right eye [1]=left eye [2]=nose [3]=mouth [4]=right cheek [5]=left cheek
// Plus, on request (mesh lenses), the full 478-pt mesh: { mesh: [[x,y]×478] }. Blendshapes are NOT
// emitted — they ran on a CPU model; JS now derives the few expression signals it uses from the mesh.
// Registered under the JS name "faceMesh" (see FaceMeshFrameProcessor.m). Needs `face_landmarker.task`
// bundled (Build Phases → Copy Bundle Resources). VIDEO mode tracks across frames with a monotonic ts.
@objc public final class FaceMeshShared: NSObject {
  @objc public static let shared = FaceMeshShared()
  private let lock = NSLock()
  public private(set) var landmarker: FaceLandmarker?

  // SNAPPINESS TOGGLE. IMAGE mode detects each frame independently — instant 1:1 tracking, no temporal
  // smoothing (the mesh never trails / "slides" to catch up on a fast move), at the cost of a little
  // more idle jitter and heavier per-frame compute (full detection every frame, no tracking shortcut).
  // VIDEO mode tracks + stabilizes across frames: rock-steady when idle, but lags fast motion. Flip to
  // false to restore VIDEO. Must rebuild the app to take effect.
  @objc public static let useImageMode = true

  @objc public func warmUp() {
    lock.lock(); defer { lock.unlock() }
    if landmarker != nil { return }
    guard let path = Bundle.main.path(forResource: "face_landmarker", ofType: "task") else {
      NSLog("[FaceMesh] model not found in bundle")
      return
    }
    if let gpu = Self.build(path: path, delegate: .GPU) {
      landmarker = gpu
      NSLog("[FaceMesh] delegate=GPU")
    } else {
      landmarker = Self.build(path: path, delegate: .CPU)
      NSLog("[FaceMesh] delegate=\(landmarker != nil ? "CPU" : "none")")
    }
  }

  private static func build(path: String, delegate: Delegate) -> FaceLandmarker? {
    let opts = FaceLandmarkerOptions()
    opts.baseOptions.modelAssetPath = path
    opts.baseOptions.delegate = delegate
    opts.runningMode = useImageMode ? .image : .video
    opts.numFaces = 1
    opts.minFaceDetectionConfidence = 0.5
    opts.minFacePresenceConfidence = 0.5
    opts.minTrackingConfidence = 0.5
    // Blendshapes OFF: MediaPipe runs them on a CPU (XNNPACK) model every frame regardless of delegate,
    // and we only used a few signals — now derived from the GPU mesh geometry in faceFrame (smile/brow)
    // or the anchor proxy (mouthOpen). Dropping the CPU model trims per-frame inference on every device.
    opts.outputFaceBlendshapes = false
    // The 4×4 facial-transform matrix (a per-frame PnP solve) is not consumed in JS — skip it to save
    // inference time. Re-enable if a lens ever needs head pose.
    opts.outputFacialTransformationMatrixes = false
    return try? FaceLandmarker(options: opts)
  }
}

@objc(FaceMeshFrameProcessor)
public class FaceMeshFrameProcessor: FrameProcessorPlugin {

  // Pinned like the BlazeFace plugin: the app is portrait-locked, so the first frame's orientation is
  // the one we feed MediaPipe for the whole session (physically rotating the phone won't flip it).
  private var lockedOrientation: UIImage.Orientation?

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    super.init(proxy: proxy, options: options)
    FaceMeshShared.shared.warmUp()
  }

  // CALIBRATION: let JS override the orientation we feed MediaPipe (arg "ori") so we can dial in the
  // value that makes the mesh detect upright WITHOUT a native rebuild per attempt. Returns nil for an
  // unknown/absent string → falls back to the pinned frame orientation.
  private func uiOrientation(_ s: String?) -> UIImage.Orientation? {
    switch s {
    case "up": return .up
    case "down": return .down
    case "left": return .left
    case "right": return .right
    case "upMirrored": return .upMirrored
    case "downMirrored": return .downMirrored
    case "leftMirrored": return .leftMirrored
    case "rightMirrored": return .rightMirrored
    default: return nil
    }
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    guard let landmarker = FaceMeshShared.shared.landmarker else { return ["err": "no_model"] }
    if lockedOrientation == nil { lockedOrientation = frame.orientation }
    let orientation = uiOrientation(arguments?["ori"] as? String) ?? lockedOrientation ?? frame.orientation
    let image: MPImage
    do { image = try MPImage(sampleBuffer: frame.buffer, orientation: orientation) }
    catch { return ["err": "no_image"] }
    // IMAGE mode: per-frame detect (no timestamp). VIDEO mode: tracked detect with a monotonic ts.
    let detected: FaceLandmarkerResult?
    if FaceMeshShared.useImageMode {
      detected = try? landmarker.detect(image: image)
    } else {
      detected = try? landmarker.detect(videoFrame: image, timestampInMilliseconds: Int(CACurrentMediaTime() * 1000))
    }
    guard let result = detected else { return ["err": "detect_fail"] }
    guard let face = result.faceLandmarks.first, face.count >= 468 else { return ["err": "no_face"] }

    // Canonical MediaPipe FaceMesh indices → 6 BlazeFace-equivalent anchors (subject-anatomical, image
    // coords). Eye/mouth anchors average two contour corners for a stable center.
    func mid(_ a: Int, _ b: Int) -> [Double] { [Double(face[a].x + face[b].x) / 2.0, Double(face[a].y + face[b].y) / 2.0] }
    func pt(_ i: Int) -> [Double] { [Double(face[i].x), Double(face[i].y)] }
    let points: [[Double]] = [
      mid(33, 133),   // right eye  (outer 33 + inner 133)
      mid(263, 362),  // left eye   (outer 263 + inner 362)
      pt(1),          // nose tip
      mid(13, 14),    // mouth      (upper-inner 13 + lower-inner 14)
      pt(234),        // right cheek
      pt(454),        // left cheek
    ]
    var out: [String: Any] = ["points": points]

    // Full 478-pt mesh, only when JS asks (Debug lens) — keeps the bridge cheap by default.
    if let wantMesh = arguments?["mesh"] as? Bool, wantMesh {
      var mesh: [[Double]] = []; mesh.reserveCapacity(face.count)
      for p in face { mesh.append([Double(p.x), Double(p.y)]) }
      out["mesh"] = mesh
    }

    return out
  }
}
