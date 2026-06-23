package com.reaxn

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.OverlaySettings
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.MatrixTransformation
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.StaticOverlaySettings
import androidx.media3.effect.RgbMatrix
import androidx.media3.effect.TextureOverlay
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.util.UUID

// Android Studio exporter — bakes a non-destructive "recipe" into one MP4 via Media3
// Transformer, mirroring iOS's AVFoundation StudioExporter. Trim + colour matrix + mirror
// are the post path; overlay / overlayFrames are used by the share-bake.
@UnstableApi
class StudioExporterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "StudioExporter"

  private fun uriOf(s: String?): Uri? {
    if (s.isNullOrEmpty()) return null
    return if (s.startsWith("file://") || s.startsWith("content://")) Uri.parse(s) else Uri.fromFile(File(s))
  }

  @ReactMethod
  fun export(recipe: ReadableMap, promise: Promise) {
    // Transformer must be built + started on a thread with a Looper.
    Handler(Looper.getMainLooper()).post {
      try {
        runExport(recipe, promise)
      } catch (e: Throwable) {
        promise.reject("EXPORT_ERROR", e.message ?: "Export failed", e)
      }
    }
  }

  private fun runExport(recipe: ReadableMap, promise: Promise) {
    val clips: ReadableArray = recipe.getArray("clips") ?: run {
      promise.reject("BAD_RECIPE", "Recipe has no clips"); return
    }
    if (clips.size() == 0) { promise.reject("BAD_RECIPE", "Recipe has no clips"); return }
    val clip = clips.getMap(0)
    val srcUri = uriOf(clip?.getString("uri")) ?: run {
      promise.reject("BAD_RECIPE", "Clip is missing a source uri"); return
    }

    // Trim window [start, end] in ms.
    val startMs = if (clip!!.hasKey("trimStartMs")) clip.getDouble("trimStartMs").toLong() else 0L
    val endMs = if (clip.hasKey("trimEndMs")) clip.getDouble("trimEndMs").toLong() else Long.MIN_VALUE
    val clipBuilder = MediaItem.ClippingConfiguration.Builder().setStartPositionMs(maxOf(0L, startMs))
    if (endMs != Long.MIN_VALUE && endMs > startMs) { clipBuilder.setEndPositionMs(endMs) }
    val mediaItem = MediaItem.Builder().setUri(srcUri).setClippingConfiguration(clipBuilder.build()).build()

    // Video effects, applied in order: colour matrix → mirror → overlay.
    val videoEffects = ArrayList<Effect>()

    recipe.getArray("colorMatrix")?.let { cm ->
      if (cm.size() == 20) { videoEffects.add(ColorMatrixRgb(rgbaMatrixFrom(cm))) }
    }

    if (recipe.hasKey("mirror") && recipe.getBoolean("mirror")) {
      // Horizontal flip about the frame centre (matches the iOS mirror).
      videoEffects.add(MatrixTransformation { _ -> Matrix().apply { setScale(-1f, 1f) } })
    }

    // Output size = source display size (so overlays composite 1:1).
    val (vw, vh) = videoDisplaySize(srcUri)

    buildOverlayEffect(recipe, vw, vh)?.let { videoEffects.add(it) }

    // Audio mix config (mirrors iOS): keep/drop the recorded audio, its volume, and any music tracks.
    // Music is mixed via parallel EditedMediaItemSequences (one per track, looped to cover the video).
    val keepOriginal = if (recipe.hasKey("keepOriginalAudio")) recipe.getBoolean("keepOriginalAudio") else true
    val originalVol = if (recipe.hasKey("originalVolume")) recipe.getDouble("originalVolume").toFloat() else 1.0f
    val musicTracks = if (recipe.hasKey("audioTracks")) recipe.getArray("audioTracks") else null

    // Audio effects on the recorded track. "React Anonymously" pitch-shifts the voice down. Sonic
    // preserves tempo/duration (it time-stretches to compensate for the resample), so audio stays in
    // sync with the video. A ChannelMixingAudioProcessor scales the recorded volume when reduced.
    val audioProcessors = ArrayList<AudioProcessor>()
    val voiceMod = if (recipe.hasKey("voiceMod")) recipe.getString("voiceMod") else null
    if (voiceMod == "deep") {
      val sonic = SonicAudioProcessor()
      sonic.setPitch(0.72f) // <1 = deeper; ~-5 semitones
      audioProcessors.add(sonic)
    }
    if (keepOriginal && originalVol < 0.999f) { audioProcessors.add(volumeProcessor(originalVol)) }

    val editedBuilder = EditedMediaItem.Builder(mediaItem)
      .setEffects(Effects(audioProcessors, videoEffects))
    if (!keepOriginal) { editedBuilder.setRemoveAudio(true) } // music-only / pre-mode: drop the mic track
    val edited = editedBuilder.build()

    val outFile = File(reactContext.cacheDir, "studio_${UUID.randomUUID()}.mp4")

    val transformer = Transformer.Builder(reactContext)
      .setVideoMimeType(MimeTypes.VIDEO_H264) // force H.264 (Bunny green-frames HEVC)
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, result: ExportResult) {
          promise.resolve(outFile.absolutePath)
        }
        override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
          promise.reject("EXPORT_ERROR", exception.message ?: "Export failed", exception)
        }
      })
      .build()

    // No music → single item (unchanged path). With music → a Composition whose first sequence is the
    // video (+ optional recorded audio) and each further sequence is a looping music track; Media3 mixes
    // the parallel sequences' audio. Modeled as N sequences so multi-track mixing is just more entries.
    if (musicTracks == null || musicTracks.size() == 0) {
      transformer.start(edited, outFile.absolutePath)
    } else {
      val sequences = ArrayList<EditedMediaItemSequence>()
      sequences.add(EditedMediaItemSequence.Builder(edited).build())
      for (i in 0 until musicTracks.size()) {
        val mt = musicTracks.getMap(i) ?: continue
        val mUri = uriOf(mt.getString("uri")) ?: continue
        val vol = if (mt.hasKey("volume")) mt.getDouble("volume").toFloat() else 1.0f
        val mItem = EditedMediaItem.Builder(MediaItem.fromUri(mUri))
          .setRemoveVideo(true)
          .setEffects(Effects(arrayListOf<AudioProcessor>(volumeProcessor(vol)), emptyList<Effect>()))
          .build()
        sequences.add(EditedMediaItemSequence.Builder(mItem).setIsLooping(true).build())
      }
      transformer.start(Composition.Builder(sequences).build(), outFile.absolutePath)
    }
  }

  // A volume control implemented as a channel-mixing matrix scaled by `volume` (0..1). Registers both
  // mono and stereo identities so it applies regardless of the source's channel count.
  private fun volumeProcessor(volume: Float): ChannelMixingAudioProcessor {
    val p = ChannelMixingAudioProcessor()
    p.putChannelMixingMatrix(ChannelMixingMatrix.create(1, 1).scaleBy(volume))
    p.putChannelMixingMatrix(ChannelMixingMatrix.create(2, 2).scaleBy(volume))
    return p
  }

  // ── Colour matrix ────────────────────────────────────────────────────────────
  // The recipe's 4×5 RGBA matrix (row-major + bias) → a 4×4 RgbMatrix. Video frames are
  // opaque (a=1), so the bias folds into the alpha column; the alpha row stays (0,0,0,1).
  private fun rgbaMatrixFrom(cm: ReadableArray): FloatArray {
    val m = FloatArray(20) { cm.getDouble(it).toFloat() }
    // m rows: R=0..4, G=5..9, B=10..14, A=15..19 (last entry of each row = bias)
    // Column-major 4×4 for Media3 (out = M * rgba, rgba.a = 1).
    return floatArrayOf(
      m[0], m[5], m[10], 0f,             // col 0 (·r)
      m[1], m[6], m[11], 0f,             // col 1 (·g)
      m[2], m[7], m[12], 0f,             // col 2 (·b)
      m[3] + m[4], m[8] + m[9], m[13] + m[14], 1f, // col 3 (·a=1): coeff + bias
    )
  }

  @UnstableApi
  private class ColorMatrixRgb(private val matrix: FloatArray) : RgbMatrix {
    override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray = matrix
  }

  // ── Overlay (static PNG or captured frame loop) ───────────────────────────────
  private fun buildOverlayEffect(recipe: ReadableMap, vw: Int, vh: Int): OverlayEffect? {
    val framesDict = if (recipe.hasKey("overlayFrames")) recipe.getMap("overlayFrames") else null
    val overlayDict = if (recipe.hasKey("overlay")) recipe.getMap("overlay") else null

    val overlay: TextureOverlay? = when {
      framesDict != null -> {
        val uris = framesDict.getArray("uris")
        val fps = framesDict.getDouble("fps")
        val overlap = if (framesDict.hasKey("overlap")) framesDict.getInt("overlap") else 0
        if (uris == null || uris.size() < 2 || fps <= 0) null
        else {
          val frames = ArrayList<Bitmap>(uris.size())
          for (i in 0 until uris.size()) {
            loadBitmap(uris.getString(i), vw, vh)?.let { frames.add(it) }
          }
          if (frames.size < 2) null else FrameLoopOverlay(frames, fps, overlap.coerceAtMost(frames.size / 2))
        }
      }
      overlayDict != null -> loadBitmap(overlayDict.getString("uri"), vw, vh)?.let { BitmapOverlay.createStaticBitmapOverlay(it) }
      else -> null
    }
    return overlay?.let { OverlayEffect(com.google.common.collect.ImmutableList.of(it)) }
  }

  // Loads a PNG and scales it to the video display size so it composites 1:1 (fills the frame).
  private fun loadBitmap(uriStr: String?, vw: Int, vh: Int): Bitmap? {
    val u = uriOf(uriStr) ?: return null
    return try {
      reactContext.contentResolver.openInputStream(u).use { input ->
        val bmp = BitmapFactory.decodeStream(input) ?: return null
        if (vw > 0 && vh > 0 && (bmp.width != vw || bmp.height != vh)) {
          Bitmap.createScaledBitmap(bmp, vw, vh, true)
        } else bmp
      }
    } catch (e: Throwable) { null }
  }

  // Time-matched frame loop. Overlap > 0 crossfades the tail back into the head (seamless
  // repeat) by blending two frames; overlap = 0 (the share-bake) just plays through once.
  @UnstableApi
  private class FrameLoopOverlay(
    private val frames: List<Bitmap>,
    private val fps: Double,
    private val overlap: Int,
  ) : BitmapOverlay() {
    private val loopLen = frames.size - overlap
    private val settings = StaticOverlaySettings.Builder().build()

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
      val t = presentationTimeUs / 1_000_000.0
      val loopDur = loopLen / fps
      var tt = t % loopDur
      if (tt < 0) tt += loopDur
      var i = Math.floor(tt * fps).toInt()
      if (i < 0) i = 0
      if (i >= loopLen) i = loopLen - 1
      if (overlap > 0 && i < overlap) {
        val a = (i + 0.5) / overlap // 0 → tail, 1 → head
        return blend(frames[loopLen + i], frames[i], a.toFloat())
      }
      return frames[i]
    }

    override fun getOverlaySettings(presentationTimeUs: Long): OverlaySettings = settings

    private var blended: Bitmap? = null
    private fun blend(tail: Bitmap, head: Bitmap, a: Float): Bitmap {
      val out = blended?.takeIf { it.width == head.width && it.height == head.height }
        ?: Bitmap.createBitmap(head.width, head.height, Bitmap.Config.ARGB_8888).also { blended = it }
      val c = android.graphics.Canvas(out)
      c.drawColor(0, android.graphics.PorterDuff.Mode.CLEAR)
      val p = android.graphics.Paint()
      p.alpha = ((1f - a) * 255).toInt(); c.drawBitmap(tail, 0f, 0f, p)
      p.alpha = (a * 255).toInt(); c.drawBitmap(head, 0f, 0f, p)
      return out
    }
  }

  // Source display size (rotation-corrected), used to size overlays to fill the frame.
  private fun videoDisplaySize(uri: Uri): Pair<Int, Int> {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(reactContext, uri)
      val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      if (rot == 90 || rot == 270) Pair(h, w) else Pair(w, h)
    } catch (e: Throwable) {
      Pair(0, 0)
    } finally {
      try { r.release() } catch (_: Throwable) {}
    }
  }
}
