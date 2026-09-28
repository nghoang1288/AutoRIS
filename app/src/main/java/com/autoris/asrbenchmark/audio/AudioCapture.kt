package com.autoris.asrbenchmark.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

interface AudioCaptureListener {
    fun onAudioChunk(shortSamples: ShortArray, floatSamples: FloatArray, count: Int)
    fun onError(message: String)
}

class AudioCapture(
    private val sampleRate: Int = 16000,
    private val chunkSamples: Int = 1600, // 100ms
    private val profile: PreprocessingProfile = PreprocessingProfile.RAW
) {
    companion object {
        private const val TAG = "AudioCapture"
        const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    }

    private var audioRecord: AudioRecord? = null
    private var effectsController: HardwareAudioEffectsController? = null
    private var captureJob: Job? = null
    @Volatile private var isRecording: Boolean = false

    @SuppressLint("MissingPermission")
    fun start(scope: CoroutineScope, listener: AudioCaptureListener): Boolean {
        if (isRecording) {
            Log.w(TAG, "AudioCapture already running")
            return true
        }

        val minBufSize = AudioRecord.getMinBufferSize(sampleRate, CHANNEL_CONFIG, AUDIO_FORMAT)
        if (minBufSize <= 0) {
            listener.onError("AudioRecord.getMinBufferSize invalid: $minBufSize")
            return false
        }
        val bufferSize = maxOf(minBufSize * 2, chunkSamples * 2 * 2)

        // Try VOICE_RECOGNITION audio source, fallback to MIC
        var record: AudioRecord? = null
        try {
            record = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                sampleRate,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            )
        } catch (_: Exception) {
            // Ignore and fallback below
        }

        if (record == null || record.state != AudioRecord.STATE_INITIALIZED) {
            try {
                record?.release()
                record = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    sampleRate,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    bufferSize
                )
            } catch (e: Exception) {
                listener.onError("Cannot initialize AudioRecord: ${e.message}")
                return false
            }
        }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            listener.onError("AudioRecord failed to reach STATE_INITIALIZED")
            return false
        }

        audioRecord = record

        // Attach hardware effects based on preprocessing profile
        val sessionId = record.audioSessionId
        effectsController = HardwareAudioEffectsController(sessionId).apply {
            when (profile) {
                PreprocessingProfile.ANDROID_NS -> {
                    enableNoiseSuppressor(true)
                }
                PreprocessingProfile.ANDROID_NS_AGC -> {
                    enableNoiseSuppressor(true)
                    enableAutomaticGainControl(true)
                }
                PreprocessingProfile.ANDROID_NS_DPDFNET -> {
                    enableNoiseSuppressor(true)
                }
                PreprocessingProfile.RAW,
                PreprocessingProfile.DPDFNET -> {
                    // Raw hardware input
                }
            }
        }

        try {
            record.startRecording()
        } catch (e: Exception) {
            listener.onError("AudioRecord.startRecording failed: ${e.message}")
            release()
            return false
        }

        isRecording = true

        captureJob = scope.launch(Dispatchers.IO) {
            val shortBuffer = ShortArray(chunkSamples)
            val floatBuffer = FloatArray(chunkSamples)

            while (isActive && isRecording) {
                val currentRecord = audioRecord ?: break
                val readSamples = currentRecord.read(shortBuffer, 0, chunkSamples)

                if (readSamples > 0) {
                    for (i in 0 until readSamples) {
                        floatBuffer[i] = shortBuffer[i] / 32768.0f
                    }
                    listener.onAudioChunk(shortBuffer, floatBuffer, readSamples)
                } else if (readSamples < 0) {
                    if (isRecording) {
                        Log.e(TAG, "AudioRecord error read: $readSamples")
                        listener.onError("AudioRecord error code $readSamples")
                    }
                    break
                }
            }
        }

        return true
    }

    fun stop() {
        isRecording = false
        captureJob?.cancel()
        captureJob = null

        val record = audioRecord
        audioRecord = null

        try {
            if (record?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                record.stop()
            }
        } catch (e: Throwable) {
            Log.w(TAG, "Error stopping AudioRecord: ${e.message}")
        }

        effectsController?.release()
        effectsController = null

        try {
            record?.release()
        } catch (e: Throwable) {
            Log.w(TAG, "Error releasing AudioRecord: ${e.message}")
        }
    }

    fun release() {
        stop()
    }
}
