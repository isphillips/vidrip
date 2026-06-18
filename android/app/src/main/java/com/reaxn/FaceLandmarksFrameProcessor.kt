package com.reaxn

import com.google.mediapipe.framework.image.MediaImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facedetector.FaceDetector
import com.google.mediapipe.tasks.vision.facedetector.FaceDetector.FaceDetectorOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

// Thin VisionCamera frame-processor plugin: runs MediaPipe FaceDetector (BlazeFace, short-range) per
// frame and returns the 6 normalized keypoints ({ "points": [[x,y], ...] }) or an error. BlazeFace
// is far lighter than the 478-pt FaceLandmarker mesh — it gives exactly the anchors the lenses use:
//   [0]=right eye  [1]=left eye  [2]=nose tip  [3]=mouth  [4]=right ear  [5]=left ear
// Index→anchor reduction (and orientation/mirror) lives in JS (faceTracking.ts).
// Requires `com.google.mediapipe:tasks-vision` + the model at assets/blaze_face_short_range.tflite,
// and registration in MainApplication.
class FaceLandmarksFrameProcessor(proxy: VisionCameraProxy, options: Map<String, Any>?) :
    FrameProcessorPlugin() {

  init { warmUp(proxy.context) }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val det = detector ?: return mapOf("err" to "no_model")
    val image = frame.image ?: return mapOf("err" to "no_image")
    val mp = MediaImageBuilder(image).build()
    // Orientation is handled in JS (faceTracking.ts, per frame.orientation) — keypoints are returned
    // in the raw sensor space.
    val ts = android.os.SystemClock.uptimeMillis()
    val result = try { det.detectForVideo(mp, ts) } catch (e: Throwable) { return mapOf("err" to "detect_fail") }
    val detections = result.detections()
    if (detections.isEmpty()) return mapOf("err" to "no_face")
    val kps = detections[0].keypoints()
    if (!kps.isPresent || kps.get().size < 6) return mapOf("err" to "no_kps")
    val list = kps.get()
    val pts = ArrayList<List<Double>>(list.size)
    for (k in list) { pts.add(listOf(k.x().toDouble(), k.y().toDouble())) }
    return mapOf("points" to pts)
  }

  companion object {
    // One shared detector so the launch-time warm-up and the frame processor load the model once.
    // VIDEO mode tracks the face across frames; detectForVideo just needs increasing timestamps.
    @Volatile
    var detector: FaceDetector? = null
      private set

    @JvmStatic
    fun warmUp(context: android.content.Context) {
      if (detector != null) { return }
      synchronized(this) {
        if (detector != null) { return }
        // Prefer the GPU delegate (much cheaper inference); fall back to CPU if GPU init fails.
        detector = build(context, Delegate.GPU)?.also { android.util.Log.i("FaceDetector", "delegate=GPU") }
          ?: build(context, Delegate.CPU)?.also { android.util.Log.i("FaceDetector", "delegate=CPU") }
          ?: run { android.util.Log.w("FaceDetector", "delegate=none (model failed to load)"); null }
      }
    }

    private fun build(context: android.content.Context, delegate: Delegate): FaceDetector? {
      return try {
        val base = BaseOptions.builder()
          .setModelAssetPath("blaze_face_short_range.tflite")
          .setDelegate(delegate)
          .build()
        val opts = FaceDetectorOptions.builder()
          .setBaseOptions(base)
          .setRunningMode(RunningMode.VIDEO)
          .setMinDetectionConfidence(0.5f)
          .build()
        FaceDetector.createFromOptions(context.applicationContext, opts)
      } catch (e: Throwable) { null }
    }
  }
}
