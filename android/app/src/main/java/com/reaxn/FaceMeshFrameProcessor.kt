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
// Plus two things BlazeFace can't give:
//   bs: { jawOpen, smile, blinkL, blinkR, browUp }   — 52 ARKit-style blendshapes, curated to 5
//   m:  [16]                                          — 4×4 facial transformation matrix (row-major)
// Registered under the JS name "faceMesh" (MainApplication). Needs assets/face_landmarker.task.
// Orientation is handled in JS (faceTracking.ts) — keypoints are returned in the raw sensor space.
class FaceMeshFrameProcessor(proxy: VisionCameraProxy, options: Map<String, Any>?) :
    FrameProcessorPlugin() {

  init { warmUp(proxy.context) }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val cb0 = android.os.SystemClock.elapsedRealtimeNanos()
    val landmarker = detector ?: return mapOf("err" to "no_model")
    val image = frame.image ?: return mapOf("err" to "no_image")
    val mp = MediaImageBuilder(image).build()
    val ts = android.os.SystemClock.uptimeMillis()
    val tInf = android.os.SystemClock.elapsedRealtimeNanos()
    val result = try { landmarker.detectForVideo(mp, ts) } catch (e: Throwable) { return mapOf("err" to "detect_fail", "delegate" to delegateName) }
    val infMs = (android.os.SystemClock.elapsedRealtimeNanos() - tInf) / 1e6
    val faces = result.faceLandmarks()
    if (faces.isEmpty() || faces[0].size < 468) return mapOf("err" to "no_face", "delegate" to delegateName)
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
    out["delegate"] = delegateName
    out["msInfer"] = infMs

    // Full 478-pt mesh, only when JS asks (Debug lens) — keeps the bridge cheap by default.
    if (arguments?.get("mesh") == true) {
      out["mesh"] = f.map { listOf(it.x().toDouble(), it.y().toDouble()) }
    }

    val bsOpt = result.faceBlendshapes()
    if (bsOpt.isPresent && bsOpt.get().isNotEmpty()) {
      val m = HashMap<String, Double>()
      for (c in bsOpt.get()[0]) { m[c.categoryName()] = c.score().toDouble() }
      out["bs"] = mapOf(
        "jawOpen" to (m["jawOpen"] ?: 0.0),
        "smile" to (((m["mouthSmileLeft"] ?: 0.0) + (m["mouthSmileRight"] ?: 0.0)) / 2.0),
        "blinkL" to (m["eyeBlinkLeft"] ?: 0.0),
        "blinkR" to (m["eyeBlinkRight"] ?: 0.0),
        "browUp" to maxOf(m["browInnerUp"] ?: 0.0, ((m["browOuterUpLeft"] ?: 0.0) + (m["browOuterUpRight"] ?: 0.0)) / 2.0),
      )
    }

    // Full native callback time incl. the per-frame list-building/serialization (msTotal − msInfer
    // ≈ the cost of marshaling the 478-pt mesh). Surfaced to the on-screen badge for profiling.
    out["msTotal"] = (android.os.SystemClock.elapsedRealtimeNanos() - cb0) / 1e6
    return out
  }

  companion object {
    // One shared landmarker so the launch-time warm-up and the frame processor load the model once.
    @Volatile
    var detector: FaceLandmarker? = null
      private set

    // Which MediaPipe delegate actually loaded (GPU/CPU/none). Surfaced to JS in every result so the
    // app can show it on-screen — OnePlus/ColorOS suppresses logcat for release apps, so this is the
    // only reliable way to confirm whether the heavy 478-pt mesh is on GPU or the (slow) CPU.
    @Volatile
    var delegateName: String = "none"
      private set

    @JvmStatic
    fun warmUp(context: android.content.Context) {
      if (detector != null) { return }
      synchronized(this) {
        if (detector != null) { return }
        val gpu = build(context, Delegate.GPU)
        if (gpu != null) { detector = gpu; delegateName = "GPU"; android.util.Log.i("FaceMesh", "delegate=GPU"); return }
        val cpu = build(context, Delegate.CPU)
        if (cpu != null) { detector = cpu; delegateName = "CPU"; android.util.Log.i("FaceMesh", "delegate=CPU"); return }
        delegateName = "none"
        android.util.Log.w("FaceMesh", "delegate=none (model failed to load)")
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
          .setRunningMode(RunningMode.VIDEO)
          .setNumFaces(1)
          .setMinFaceDetectionConfidence(0.5f)
          .setMinFacePresenceConfidence(0.5f)
          .setMinTrackingConfidence(0.5f)
          // Blendshapes (jaw/blink/smile/brow) cost ~10-20ms — kept ON only for the mesh path, which
          // is already throttled; anchor lenses route to BlazeFace (no blendshapes) for the fast path.
          .setOutputFaceBlendshapes(true)
          // Facial transformation matrix is NOT consumed in JS — computing it added inference time
          // for nothing, so it's off. Re-enable here (and read `m` in faceTracking) if a lens needs it.
          .build()
        FaceLandmarker.createFromOptions(context.applicationContext, opts)
      } catch (e: Throwable) { null }
    }
  }
}
