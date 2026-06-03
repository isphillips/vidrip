package com.reaxn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.io.File
import java.util.concurrent.Executors

class ScreenRecordService : Service() {

    companion object {
        private const val CHANNEL_ID = "reaxn_screen_record"
        private const val NOTIF_ID = 9001

        var instance: ScreenRecordService? = null
        var onForegroundStarted: (() -> Unit)? = null
    }

    // Projection is held for the lifetime of the screen session — survives stop/cancel.
    var mediaProjection: MediaProjection? = null
        private set

    val isProjectionActive: Boolean get() = mediaProjection != null
    private var virtualDisplay: VirtualDisplay? = null
    private var mediaRecorder: MediaRecorder? = null

    @Volatile private var isRecording = false
    @Volatile private var hasWrittenData = false

    // Single-thread executor keeps all recorder ops off the main thread.
    private val ioExecutor = Executors.newSingleThreadExecutor()

    var outputFile: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notif = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
        onForegroundStarted?.invoke()
        onForegroundStarted = null
        return START_NOT_STICKY
    }

    // Called once after permission is granted — initialises the MediaProjection.
    fun initProjection(resultCode: Int, data: Intent) {
        val pm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = pm.getMediaProjection(resultCode, data)
    }

    // Starts a new recording using the existing projection.
    fun startRecording(
        output: String,
        width: Int,
        height: Int,
        dpi: Int,
        onDone: (Exception?) -> Unit,
    ) {
        ioExecutor.execute {
            try {
                outputFile = output
                hasWrittenData = false

                val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this)
                               else @Suppress("DEPRECATION") MediaRecorder()
                mediaRecorder = recorder

                recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
                recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE)
                recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
                recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                recorder.setVideoSize(width, height)
                recorder.setVideoFrameRate(30)
                recorder.setVideoEncodingBitRate(4_000_000)
                recorder.setAudioEncodingBitRate(128_000)
                recorder.setAudioSamplingRate(44_100)
                recorder.setOutputFile(output)
                recorder.prepare()

                virtualDisplay = mediaProjection?.createVirtualDisplay(
                    "ReaxnRecorder", width, height, dpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    recorder.surface, null, null,
                )

                recorder.start()
                isRecording = true

                // Mark as having data after a short delay — MediaRecorder needs
                // at least one frame before stop() is safe.
                Thread.sleep(300)
                hasWrittenData = true

                onDone(null)
            } catch (e: Exception) {
                isRecording = false
                onDone(e)
            }
        }
    }

    // Stops the current recording but keeps the MediaProjection alive for reuse.
    fun stopRecording(onDone: (String?, Exception?) -> Unit) {
        ioExecutor.execute {
            val path = outputFile
            try {
                if (isRecording && hasWrittenData) {
                    mediaRecorder?.stop()
                }
            } catch (_: Exception) {}
            cleanupRecorder()
            onDone(path, null)
        }
    }

    // Cancels and deletes the output file, keeps projection alive.
    fun cancelRecording(onDone: (Exception?) -> Unit) {
        ioExecutor.execute {
            try {
                if (isRecording && hasWrittenData) {
                    mediaRecorder?.stop()
                }
            } catch (_: Exception) {}
            cleanupRecorder()
            outputFile?.let { File(it).delete() }
            outputFile = null
            onDone(null)
        }
    }

    // Full teardown — releases projection and stops the service.
    fun release() {
        ioExecutor.execute {
            try {
                if (isRecording && hasWrittenData) {
                    mediaRecorder?.stop()
                }
            } catch (_: Exception) {}
            cleanupRecorder()
            mediaProjection?.stop()
            mediaProjection = null
        }
        stopSelf()
    }

    private fun cleanupRecorder() {
        isRecording = false
        hasWrittenData = false
        try { mediaRecorder?.release() } catch (_: Exception) {}
        mediaRecorder = null
        virtualDisplay?.release()
        virtualDisplay = null
    }

    override fun onDestroy() {
        super.onDestroy()
        ioExecutor.shutdown()
        instance = null
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "Screen Recording", NotificationManager.IMPORTANCE_LOW)
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Recording reaction…")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
}
