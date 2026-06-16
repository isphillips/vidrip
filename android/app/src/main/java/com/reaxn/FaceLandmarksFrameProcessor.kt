package com.reaxn

import com.google.mediapipe.framework.image.MediaImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker.FaceLandmarkerOptions
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy

// Thin VisionCamera frame-processor plugin: runs MediaPipe FaceLandmarker per frame and returns
// the raw normalized mesh ({ "points": [[x,y], ...] }) or null. Index→anchor reduction is in JS.
// Requires `com.google.mediapipe:tasks-vision` + the model at assets/face_landmarker.task,
// and registration in MainApplication.
class FaceLandmarksFrameProcessor(proxy: VisionCameraProxy, options: Map<String, Any>?) :
    FrameProcessorPlugin() {

  init { warmUp(proxy.context) }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val lm = landmarker ?: return mapOf("err" to "no_model")
    val image = frame.image ?: return mapOf("err" to "no_image")
    val mp = MediaImageBuilder(image).build()
    // VIDEO mode: feed a monotonically-increasing timestamp (uptime ms) so MediaPipe tracks across
    // frames (far fewer drops → no flashing). uptimeMillis only ever increases for this process.
    val ts = android.os.SystemClock.uptimeMillis()
    val result = try { lm.detectForVideo(mp, ts) } catch (e: Throwable) { return mapOf("err" to "detect_fail") }
    val faces = result.faceLandmarks()
    if (faces.isEmpty()) return mapOf("err" to "no_face")
    val pts = ArrayList<List<Double>>(faces[0].size)
    for (p in faces[0]) { pts.add(listOf(p.x().toDouble(), p.y().toDouble())) }
    return mapOf("points" to pts)
  }

  companion object {
    // One shared landmarker so the launch-time warm-up and the frame processor load the model
    // once. VIDEO mode tracks the face across frames (smooth, far fewer drops than stateless
    // IMAGE mode); detectForVideo just needs monotonically-increasing timestamps (uptime ms).
    @Volatile
    var landmarker: FaceLandmarker? = null
      private set

    @JvmStatic
    fun warmUp(context: android.content.Context) {
      if (landmarker != null) { return }
      synchronized(this) {
        if (landmarker != null) { return }
        landmarker = try {
          val base = BaseOptions.builder().setModelAssetPath("face_landmarker.task").build()
          val opts = FaceLandmarkerOptions.builder()
            .setBaseOptions(base)
            .setRunningMode(RunningMode.VIDEO)
            .setNumFaces(1)
            // Lower thresholds → acquires readily; tracking confidence keeps the lock smooth.
            .setMinFaceDetectionConfidence(0.3f)
            .setMinFacePresenceConfidence(0.3f)
            .setMinTrackingConfidence(0.3f)
            .build()
          FaceLandmarker.createFromOptions(context.applicationContext, opts)
        } catch (e: Throwable) { null }
      }
    }
  }
}
