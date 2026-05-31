import Foundation
import ReplayKit
import AVFoundation

@objc(ReaxnScreenRecorder)
class ReaxnScreenRecorder: NSObject {

  private var writer: AVAssetWriter?
  private var videoIn: AVAssetWriterInput?
  private var audioIn: AVAssetWriterInput?
  private var outputURL: URL?
  private var sessionStarted = false

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func startCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let recorder = RPScreenRecorder.shared()
    if recorder.isRecording { resolve(nil); return }

    recorder.isMicrophoneEnabled = true

    let ts = Int(Date().timeIntervalSince1970 * 1000)
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("reaction_\(ts).mp4")
    outputURL = url
    sessionStarted = false

    let scale = UIScreen.main.scale
    let sz    = UIScreen.main.bounds.size

    do {
      let w = try AVAssetWriter(outputURL: url, fileType: .mp4)

      let vi = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey:  Int(sz.width  * scale),
        AVVideoHeightKey: Int(sz.height * scale),
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000],
      ])
      vi.expectsMediaDataInRealTime = true
      w.add(vi)

      let ai = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey:            kAudioFormatMPEG4AAC,
        AVSampleRateKey:          44100,
        AVNumberOfChannelsKey:    2,
        AVEncoderBitRateKey:      128_000,
      ])
      ai.expectsMediaDataInRealTime = true
      w.add(ai)

      writer  = w
      videoIn = vi
      audioIn = ai
    } catch {
      reject("SETUP_ERROR", error.localizedDescription, error)
      return
    }

    recorder.startCapture(handler: { [weak self] sb, type, err in
      guard let self, err == nil, CMSampleBufferDataIsReady(sb) else { return }

      if !self.sessionStarted {
        self.writer?.startWriting()
        self.writer?.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sb))
        self.sessionStarted = true
      }

      switch type {
      case .video:
        if self.videoIn?.isReadyForMoreMediaData == true { self.videoIn?.append(sb) }
      case .audioMic:
        // Mic captures reactor's voice + YouTube audio from device speaker
        if self.audioIn?.isReadyForMoreMediaData == true { self.audioIn?.append(sb) }
      default: break
      }
    }, completionHandler: { err in
      if let err { reject("START_ERROR", err.localizedDescription, err) }
      else        { resolve(nil) }
    })
  }

  @objc func stopCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    RPScreenRecorder.shared().stopCapture { [weak self] err in
      if let err { reject("STOP_ERROR", err.localizedDescription, err); return }
      self?.videoIn?.markAsFinished()
      self?.audioIn?.markAsFinished()
      self?.writer?.finishWriting {
        if let path = self?.outputURL?.path { resolve(path) }
        else { reject("WRITE_ERROR", "No output path", nil) }
      }
    }
  }

  @objc func cancelCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    RPScreenRecorder.shared().stopCapture { [weak self] _ in
      self?.writer?.cancelWriting()
      if let url = self?.outputURL { try? FileManager.default.removeItem(at: url) }
      resolve(nil)
    }
  }
}
