package com.reaxn

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// Preloads the shared MediaPipe FaceLandmarker off the main thread (called from JS on app
// start) so the first lens selection doesn't stutter on the model load.
class LensWarmupModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

  override fun getName(): String = "LensWarmup"

  @ReactMethod
  fun warmUp(promise: Promise) {
    Thread {
      try { FaceLandmarksFrameProcessor.warmUp(ctx.applicationContext) } catch (_: Throwable) {}
      promise.resolve(null)
    }.start()
  }
}
