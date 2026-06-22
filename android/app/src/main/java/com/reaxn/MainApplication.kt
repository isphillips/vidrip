package com.reaxn

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import com.hotupdater.HotUpdater
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(ReaxnAudioPackage())
              add(StudioExporterPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        // Load the OTA-downloaded JS bundle when one is present (falls back to the
        // packaged bundle on a fresh install / when no update has been applied).
        override fun getJSBundleFile(): String? = HotUpdater.getJSBundleFile(applicationContext)

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    // Register the MediaPipe face frame-processor plugins (used by the lens feature). `faceLandmarks`
    // = lightweight BlazeFace (6 keypoints); `faceMesh` = full 478-pt Face Landmarker (+ blendshapes
    // + transform matrix). JS picks between them via the USE_FACE_MESH flag in faceTracking.ts.
    FrameProcessorPluginRegistry.addFrameProcessorPlugin("faceLandmarks") { proxy, options ->
      FaceLandmarksFrameProcessor(proxy, options)
    }
    FrameProcessorPluginRegistry.addFrameProcessorPlugin("faceMesh") { proxy, options ->
      FaceMeshFrameProcessor(proxy, options)
    }
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
  }
}
