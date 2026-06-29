package com.reaxn

import com.google.mediapipe.framework.image.MediaImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker.FaceLandmarkerOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

// VisionCamera frame-processor plugin: runs MediaPipe Face Landmarker (478-pt mesh) per frame and
// reduces it — natively, to keep the JS bridge cheap — to the SAME 6-anchor contract the lighter
// BlazeFace plugin returns, so the JS orientation/reduce path is shared and unchanged:
//   { points: [[x,y]×6] }  →  [0]=right eye [1]=left eye [2]=nose [3]=mouth [4]=right cheek [5]=left cheek
// Plus, on request (mesh lenses), the full 478-pt mesh: { mesh: [[x,y]×478] }. Blendshapes are NOT
// emitted — they ran on a CPU model; JS now derives the few expression signals it uses from the mesh.
// Registered under the JS name "faceMesh" (MainApplication). Needs assets/face_landmarker.task.
// Orientation is handled in JS (faceTracking.ts) — keypoints are returned in the raw sensor space.
class FaceMeshFrameProcessor(proxy: VisionCameraProxy, options: Map<String, Any>?) :
    FrameProcessorPlugin() {

  init { warmUp(proxy.context) }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val landmarker = detector ?: return mapOf("err" to "no_model")
    val image = frame.image ?: return mapOf("err" to "no_image")
    val mp = MediaImageBuilder(image).build()
    // IMAGE mode: per-frame detect (no timestamp). VIDEO mode: tracked detect with a monotonic ts.
    val result = try {
      if (USE_IMAGE_MODE) landmarker.detect(mp)
      else landmarker.detectForVideo(mp, android.os.SystemClock.uptimeMillis())
    } catch (e: Throwable) { return mapOf("err" to "detect_fail") }
    val faces = result.faceLandmarks()
    if (faces.isEmpty() || faces[0].size < 468) return mapOf("err" to "no_face")
    val f = faces[0]

    // Canonical MediaPipe FaceMesh indices → 6 BlazeFace-equivalent anchors (subject-anatomical, image
    // coords). Eye/mouth anchors average two contour corners for a stable center.
    fun pt(i: Int) = listOf(f[i].x().toDouble(), f[i].y().toDouble())
    fun mid(a: Int, b: Int) = listOf(((f[a].x() + f[b].x()) / 2f).toDouble(), ((f[a].y() + f[b].y()) / 2f).toDouble())
    val points = listOf(
      mid(33, 133),   // right eye
      mid(263, 362),  // left eye
      pt(1),          // nose tip
      mid(13, 14),    // mouth
      pt(234),        // right cheek
      pt(454),        // left cheek
    )
    val out = HashMap<String, Any>()
    out["points"] = points

    // Full 478-pt mesh, only when JS asks (mesh lenses) — keeps the bridge cheap by default. FLAT
    // [x0,y0,x1,y1,…]: one numeric array marshals far cheaper than 478 nested arrays. reduce() de-interleaves.
    if (arguments?.get("mesh") == true) {
      val mesh = ArrayList<Double>(f.size * 2)
      for (p in f) { mesh.add(p.x().toDouble()); mesh.add(p.y().toDouble()) }
      out["mesh"] = mesh
    }

    return out
  }

  companion object {
    // DETECTOR MODE. VIDEO mode tracks the face across frames (a per-frame detection shortcut) — far
    // lighter, which matters on Android GPUs/CPUs. IMAGE mode runs a FULL detection every frame: heavier,
    // and on slower Android devices it falls badly behind (the mesh lags the face). We default to VIDEO
    // now that the JS back-pressure gate handles the runOnJS backlog that IMAGE was briefly used to probe;
    // VIDEO's mild temporal smoothing is also steadier when idle. Set true only to A/B. Rebuild to apply.
    const val USE_IMAGE_MODE = false

    // One shared landmarker so the launch-time warm-up and the frame processor load the model once.
    @Volatile
    var detector: FaceLandmarker? = null
      private set

    @JvmStatic
    fun warmUp(context: android.content.Context) {
      if (detector != null) { return }
      synchronized(this) {
        if (detector != null) { return }
        detector = build(context, Delegate.GPU)?.also { android.util.Log.i("FaceMesh", "delegate=GPU") }
          ?: build(context, Delegate.CPU)?.also { android.util.Log.i("FaceMesh", "delegate=CPU") }
          ?: run { android.util.Log.w("FaceMesh", "delegate=none (model failed to load)"); null }
      }
    }

    private fun build(context: android.content.Context, delegate: Delegate): FaceLandmarker? {
      return try {
        val base = BaseOptions.builder()
          .setModelAssetPath("face_landmarker.task")
          .setDelegate(delegate)
          .build()
        val opts = FaceLandmarkerOptions.builder()
          .setBaseOptions(base)
          .setRunningMode(if (USE_IMAGE_MODE) RunningMode.IMAGE else RunningMode.VIDEO)
          .setNumFaces(1)
          .setMinFaceDetectionConfidence(0.5f)
          .setMinFacePresenceConfidence(0.5f)
          .setMinTrackingConfidence(0.5f)
          // Blendshapes OFF: MediaPipe runs them on a CPU (XNNPACK) model every frame regardless of
          // delegate, and we only used a few signals — now derived from the GPU mesh geometry in
          // faceFrame (smile/brow) or the anchor proxy (mouthOpen). Trims per-frame inference everywhere.
          .setOutputFaceBlendshapes(false)
          // The 4×4 facial-transform matrix (a per-frame PnP solve) is not consumed in JS — skip it to
          // save inference time. Re-enable if a lens ever needs head pose.
          .setOutputFacialTransformationMatrixes(false)
          .build()
        FaceLandmarker.createFromOptions(context.applicationContext, opts)
      } catch (e: Throwable) { null }
    }
  }
}
