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

  // Serial queue — ensures startWriting() is never called twice from concurrent threads
  private let writeQueue = DispatchQueue(label: "com.reaxn.screenwriter", qos: .userInitiated)

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func startCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let recorder = RPScreenRecorder.shared()
    if recorder.isRecording {
      resolve(nil)
      return
    }

    recorder.isMicrophoneEnabled = true

    let ts = Int(Date().timeIntervalSince1970 * 1000)
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("reaction_\(ts).mp4")
    self.outputURL = url
    self.sessionStarted = false

    let scale = UIScreen.main.scale
    let sz    = UIScreen.main.bounds.size
    let w     = Int(sz.width * scale)
    let h     = Int(sz.height * scale)

    do {
      let w_writer = try AVAssetWriter(outputURL: url, fileType: .mp4)

      let vi = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey:  AVVideoCodecType.h264,
        AVVideoWidthKey:  w,
        AVVideoHeightKey: h,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000],
      ])
      vi.expectsMediaDataInRealTime = true

      let ai = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey:         kAudioFormatMPEG4AAC,
        AVSampleRateKey:       44100,
        AVNumberOfChannelsKey: 2,
        AVEncoderBitRateKey:   128_000,
      ])
      ai.expectsMediaDataInRealTime = true

      w_writer.add(vi)
      w_writer.add(ai)

      self.writer     = w_writer
      self.videoIn    = vi
      self.audioIn    = ai
    } catch let err {
      reject("SETUP_ERROR", err.localizedDescription, err)
      return
    }

    recorder.startCapture(handler: { [weak self] sb, type, err in
      // Route every buffer through the serial write queue — prevents concurrent
      // calls to startWriting() from racing each other and crashing AVAssetWriter
      self?.writeQueue.async { [weak self] in
        guard let strongSelf = self else { return }
        if let err = err {
          print("[ReaxnScreenRecorder] sample error: \(err)")
          return
        }
        guard CMSampleBufferDataIsReady(sb) else { return }

        if !strongSelf.sessionStarted {
          guard strongSelf.writer?.startWriting() == true else {
            print("[ReaxnScreenRecorder] startWriting failed: \(strongSelf.writer?.error?.localizedDescription ?? "unknown")")
            return
          }
          strongSelf.writer?.startSession(
            atSourceTime: CMSampleBufferGetPresentationTimeStamp(sb)
          )
          strongSelf.sessionStarted = true
        }

        switch type {
        case .video:
          if strongSelf.videoIn?.isReadyForMoreMediaData == true {
            strongSelf.videoIn?.append(sb)
          }
        case .audioMic:
          if strongSelf.audioIn?.isReadyForMoreMediaData == true {
            strongSelf.audioIn?.append(sb)
          }
        default:
          break
        }
      }
    }, completionHandler: { err in
      DispatchQueue.main.async {
        if let err = err {
          reject("START_ERROR", err.localizedDescription, err)
        } else {
          resolve(nil)
        }
      }
    })
  }

  @objc func stopCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    RPScreenRecorder.shared().stopCapture { [weak self] err in
      if let err = err {
        DispatchQueue.main.async { reject("STOP_ERROR", err.localizedDescription, err) }
        return
      }
      guard let strongSelf = self else {
        DispatchQueue.main.async { reject("NO_WRITER", "Recorder was deallocated", nil) }
        return
      }
      // Finish writing on the serial queue to ensure all buffered appends are done
      strongSelf.writeQueue.async {
        strongSelf.videoIn?.markAsFinished()
        strongSelf.audioIn?.markAsFinished()
        strongSelf.writer?.finishWriting {
          DispatchQueue.main.async {
            if let path = strongSelf.outputURL?.path {
              resolve(path)
            } else {
              reject("WRITE_ERROR", "No output path", nil)
            }
          }
        }
      }
    }
  }

  @objc func cancelCapture(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    RPScreenRecorder.shared().stopCapture { [weak self] _ in
      self?.writeQueue.async {
        self?.writer?.cancelWriting()
        if let url = self?.outputURL {
          try? FileManager.default.removeItem(at: url)
        }
        DispatchQueue.main.async { resolve(nil) }
      }
    }
  }
}
