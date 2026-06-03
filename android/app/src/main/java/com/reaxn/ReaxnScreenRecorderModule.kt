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

    private val main = Handler(Looper.getMainLooper())
    private var pendingPromise: Promise? = null

    // ── startCapture ──────────────────────────────────────────────────────────
    // If a projection is already initialised (screen session started), begin
    // recording immediately with no permission dialog.
    // Otherwise request permission — the dialog appears, then recording starts.

    @ReactMethod
    fun startCapture(promise: Promise) {
        val svc = ScreenRecordService.instance
        if (svc?.let { hasProjection(it) } == true) {
            // Projection already live — start a new recording without re-asking.
            startRecording(svc, promise)
            return
        }

        val activity = currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
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

        val activity = currentActivity ?: run {
            promise?.reject("NO_ACTIVITY", "Activity gone")
            return
        }

        val metrics = getDisplayMetrics(activity)
        val rc = resultCode
        val d = data

        // Start the foreground service, then initialise the projection and begin recording.
        ScreenRecordService.onForegroundStarted = callback@{
            val svc = ScreenRecordService.instance ?: run {
                main.post { promise?.reject("SVC_ERROR", "Service not ready") }
                return@callback
            }
            try {
                svc.initProjection(rc, d)
            } catch (e: Exception) {
                main.post { promise?.reject("PROJ_ERROR", e.message ?: "Projection init failed", e) }
                return@callback
            }
            startRecording(svc, promise, metrics)
        }

        val svcIntent = Intent(reactContext, ScreenRecordService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(svcIntent)
        else reactContext.startService(svcIntent)
    }

    // ── stopCapture ───────────────────────────────────────────────────────────
    // Stops the current recording. Projection stays alive for the next recording.

    @ReactMethod
    fun stopCapture(promise: Promise) {
        val svc = ScreenRecordService.instance ?: run {
            promise.reject("NOT_RECORDING", "No active recording")
            return
        }
        svc.stopRecording { path, err ->
            main.post {
                if (err != null) promise.reject("STOP_ERROR", err.message ?: "Stop failed", err)
                else promise.resolve(path)
            }
        }
    }

    // ── cancelCapture ─────────────────────────────────────────────────────────
    // Cancels the current recording. Projection stays alive.

    @ReactMethod
    fun cancelCapture(promise: Promise) {
        val svc = ScreenRecordService.instance ?: run { promise.resolve(null); return }
        svc.cancelRecording { err ->
            main.post {
                if (err != null) promise.reject("CANCEL_ERROR", err.message ?: "Cancel failed", err)
                else promise.resolve(null)
            }
        }
    }

    // ── releaseCapture ────────────────────────────────────────────────────────
    // Full teardown — releases the MediaProjection and stops the service.
    // Call this when leaving the RecordReaction screen on Android.

    @ReactMethod
    fun releaseCapture(promise: Promise) {
        try {
            ScreenRecordService.instance?.release()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("RELEASE_ERROR", e.message ?: "Release failed", e)
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private fun hasProjection(svc: ScreenRecordService): Boolean = svc.isProjectionActive

    private fun startRecording(
        svc: ScreenRecordService,
        promise: Promise?,
        metrics: DisplayMetrics? = null,
    ) {
        val activity = currentActivity
        val m = metrics ?: (activity?.let { getDisplayMetrics(it) } ?: run {
            promise?.reject("NO_ACTIVITY", "Activity gone")
            return
        })

        val ts = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val path = File(reactContext.cacheDir, "reaction_$ts.mp4").absolutePath

        svc.startRecording(path, m.widthPixels, m.heightPixels, m.densityDpi) { err ->
            main.post {
                if (err != null) promise?.reject("RECORD_ERROR", err.message ?: "Failed to start", err)
                else promise?.resolve(null)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun getDisplayMetrics(activity: Activity): DisplayMetrics {
        val m = DisplayMetrics()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val b = activity.windowManager.currentWindowMetrics.bounds
            m.widthPixels = b.width()
            m.heightPixels = b.height()
            m.densityDpi = activity.resources.displayMetrics.densityDpi
        } else {
            (activity.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
                .defaultDisplay.getMetrics(m)
        }
        return m
    }
}
