package com.autoris.asrbenchmark.audio

import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.util.Log

data class HardwareAudioEffectsSupport(
    val hasNoiseSuppressor: Boolean,
    val hasAcousticEchoCanceler: Boolean,
    val hasAutomaticGainControl: Boolean
)

class HardwareAudioEffectsController(private val audioSessionId: Int) {

    companion object {
        private const val TAG = "HardwareAudioEffects"

        fun detectSupport(): HardwareAudioEffectsSupport {
            val ns = try { NoiseSuppressor.isAvailable() } catch (_: Throwable) { false }
            val aec = try { AcousticEchoCanceler.isAvailable() } catch (_: Throwable) { false }
            val agc = try { AutomaticGainControl.isAvailable() } catch (_: Throwable) { false }
            return HardwareAudioEffectsSupport(
                hasNoiseSuppressor = ns,
                hasAcousticEchoCanceler = aec,
                hasAutomaticGainControl = agc
            )
        }
    }

    private var noiseSuppressor: NoiseSuppressor? = null
    private var automaticGainControl: AutomaticGainControl? = null
    private var acousticEchoCanceler: AcousticEchoCanceler? = null

    fun enableNoiseSuppressor(enable: Boolean): Boolean {
        if (!NoiseSuppressor.isAvailable()) {
            Log.d(TAG, "Hardware NoiseSuppressor is not available on this device")
            return false
        }
        return try {
            if (enable) {
                if (noiseSuppressor == null && audioSessionId != 0) {
                    noiseSuppressor = NoiseSuppressor.create(audioSessionId)
                }
                noiseSuppressor?.enabled = true
                val state = noiseSuppressor?.enabled == true
                Log.d(TAG, "Hardware NoiseSuppressor enabled=$state for session $audioSessionId")
                state
            } else {
                noiseSuppressor?.enabled = false
                noiseSuppressor?.release()
                noiseSuppressor = null
                true
            }
        } catch (e: Throwable) {
            Log.w(TAG, "Failed to toggle hardware NoiseSuppressor: ${e.message}")
            false
        }
    }

    fun enableAutomaticGainControl(enable: Boolean): Boolean {
        if (!AutomaticGainControl.isAvailable()) {
            Log.d(TAG, "Hardware AutomaticGainControl is not available on this device")
            return false
        }
        return try {
            if (enable) {
                if (automaticGainControl == null && audioSessionId != 0) {
                    automaticGainControl = AutomaticGainControl.create(audioSessionId)
                }
                automaticGainControl?.enabled = true
                val state = automaticGainControl?.enabled == true
                Log.d(TAG, "Hardware AutomaticGainControl enabled=$state for session $audioSessionId")
                state
            } else {
                automaticGainControl?.enabled = false
                automaticGainControl?.release()
                automaticGainControl = null
                true
            }
        } catch (e: Throwable) {
            Log.w(TAG, "Failed to toggle hardware AutomaticGainControl: ${e.message}")
            false
        }
    }

    fun release() {
        try {
            noiseSuppressor?.enabled = false
            noiseSuppressor?.release()
            noiseSuppressor = null
        } catch (e: Throwable) {
            Log.w(TAG, "Error releasing NoiseSuppressor: ${e.message}")
        }

        try {
            automaticGainControl?.enabled = false
            automaticGainControl?.release()
            automaticGainControl = null
        } catch (e: Throwable) {
            Log.w(TAG, "Error releasing AutomaticGainControl: ${e.message}")
        }

        try {
            acousticEchoCanceler?.enabled = false
            acousticEchoCanceler?.release()
            acousticEchoCanceler = null
        } catch (e: Throwable) {
            Log.w(TAG, "Error releasing AcousticEchoCanceler: ${e.message}")
        }
    }
}
