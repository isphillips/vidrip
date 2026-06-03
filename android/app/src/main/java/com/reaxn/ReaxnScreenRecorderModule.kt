package com.reaxn

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ReaxnScreenRecorderModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ReaxnScreenRecorder"
        private const val REQUEST_CODE = 7001
        private var instance: ReaxnScreenRecorderModule? = null

        fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode == REQUEST_CODE) instance?.handleProjectionResult(resultCode, data)
        }
    }

    init { instance = this }

    override fun getName() = NAME

    private var pendingPromise: Promise? = null

    @ReactMethod
    fun startCapture(promise: Promise) {
        val activity = currentActivity ?: run { promise.reject("NO_ACTIVITY", "No foreground activity"); return }
        pendingPromise = promise
        val mgr = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        activity.startActivityForResult(mgr.createScreenCaptureIntent(), REQUEST_CODE)
    }

    fun handleProjectionResult(resultCode: Int, data: Intent?) {
        val promise = pendingPromise.also { pendingPromise = null }
        if (resultCode != Activity.RESULT_OK || data == null) {
            promise?.reject("PERMISSION_DENIED", "Screen capture permission denied")
            return
        }
        val activity = currentActivity ?: run { promise?.reject("NO_ACTIVITY", "Activity gone"); return }
        try {
            val metrics = getDisplayMetrics(activity)
            val ts = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val path = File(reactContext.cacheDir, "reaction_$ts.mp4").absolutePath
            val rc = resultCode; val d = data

            ScreenRecordService.onForegroundStarted = callback@{
                val svc = ScreenRecordService.instance ?: run {
                    Handler(Looper.getMainLooper()).post { promise?.reject("SVC_ERROR", "Service not ready") }
                    return@callback
                }
                try {
                    svc.startRecording(rc, d, path, metrics.widthPixels, metrics.heightPixels, metrics.densityDpi)
                    Handler(Looper.getMainLooper()).post { promise?.resolve(null) }
                } catch (e: Exception) {
                    Handler(Looper.getMainLooper()).post { promise?.reject("RECORD_ERROR", e.message ?: "Failed", e) }
                }
            }

            val svcIntent = Intent(reactContext, ScreenRecordService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(svcIntent)
            else reactContext.startService(svcIntent)
        } catch (e: Exception) {
            promise?.reject("SETUP_ERROR", e.message ?: "Setup failed", e)
        }
    }

    @ReactMethod
    fun stopCapture(promise: Promise) {
        try { promise.resolve(ScreenRecordService.instance?.stopRecording()) }
        catch (e: Exception) { promise.reject("STOP_ERROR", e.message ?: "Stop failed", e) }
    }

    @ReactMethod
    fun cancelCapture(promise: Promise) {
        try { ScreenRecordService.instance?.cancelRecording(); promise.resolve(null) }
        catch (e: Exception) { promise.reject("CANCEL_ERROR", e.message ?: "Cancel failed", e) }
    }

    @Suppress("DEPRECATION")
    private fun getDisplayMetrics(activity: Activity): DisplayMetrics {
        val m = DisplayMetrics()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val b = activity.windowManager.currentWindowMetrics.bounds
            m.widthPixels = b.width(); m.heightPixels = b.height()
            m.densityDpi = activity.resources.displayMetrics.densityDpi
        } else {
            (activity.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.getMetrics(m)
        }
        return m
    }
}
