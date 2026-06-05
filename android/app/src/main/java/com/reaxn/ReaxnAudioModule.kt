package com.reaxn

import android.content.Context
import android.media.AudioManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ReaxnAudioModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    override fun getName(): String = "AudioRecorder"

    @ReactMethod
    fun configureForMixedPlayback(promise: Promise) {
        // disableFocus={true} on the Video component makes react-native-video skip
        // audio focus requests on Android, so no native focus management is needed here.
        promise.resolve(null)
    }

    @ReactMethod
    fun checkHeadphonesConnected(promise: Promise) {
        val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        val headphoneTypes = setOf(
            android.media.AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET,
            android.media.AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        )
        promise.resolve(devices.any { it.type in headphoneTypes })
    }

    @ReactMethod
    fun routeAudioToSpeaker(promise: Promise) {
        audioManager.isSpeakerphoneOn = true
        promise.resolve(null)
    }

    @ReactMethod
    fun restoreAudioRoute(promise: Promise) {
        audioManager.isSpeakerphoneOn = false
        promise.resolve(null)
    }

    // Recording is iOS-only (screen capture pipeline differs on Android)
    @ReactMethod
    fun startRecording(promise: Promise) {
        promise.reject("UNSUPPORTED", "Audio recording is not supported on Android")
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        promise.reject("UNSUPPORTED", "Audio recording is not supported on Android")
    }

    @ReactMethod
    fun cancelRecording(promise: Promise) {
        promise.resolve(null)
    }
}
