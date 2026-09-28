package com.autoris.asrbenchmark.audio

import android.os.SystemClock
import android.util.Log
import com.autoris.asrbenchmark.asr.ASREngine
import com.autoris.asrbenchmark.vad.VadConfig
import com.autoris.asrbenchmark.vad.VadState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import kotlin.math.log10
import kotlin.math.sqrt

data class AudioCaptureState(
    val isRecording: Boolean = false,
    val vadState: VadState = VadState.SILENCE,
    val currentDb: Float = -60.0f,
    val audioDurationSec: Float = 0.0f,
    val samplesRecorded: Long = 0L
)

class AudioRecorderManager(
    private val asrEngine: ASREngine,
    private val vadConfig: VadConfig = VadConfig(),
    val preprocessingProfile: PreprocessingProfile = PreprocessingProfile.RAW,
    private val preprocessor: AudioPreprocessor = PassthroughAudioPreprocessor(),
    private val onPartialResult: (text: String, firstPartialLatencyMs: Long) -> Unit,
    private val onError: (message: String) -> Unit
) {

    companion object {
        private const val TAG = "AudioRecorderManager"
        const val SAMPLE_RATE = 16000
        private const val CHUNK_SAMPLES = 1600 // 100ms chunks
    }

    private val _state = MutableStateFlow(AudioCaptureState())
    val state: StateFlow<AudioCaptureState> = _state.asStateFlow()

    private var audioCapture: AudioCapture? = null
    private var decodeScope: CoroutineScope? = null
    private val decodeMutex = Mutex()

    // Timing metrics
    private var sessionStartTimeNs: Long = 0L
    private var firstSpeechTimeNs: Long = 0L
    private var firstPartialTimeNs: Long = 0L
    private var speechDetected: Boolean = false
    private var totalProcessingMs: Long = 0L
    private var totalSamplesRecorded: Long = 0L

    // In-memory audio buffer for saving WAV
    private val recordedPcmBuffer = ArrayList<Short>(16000 * 60) // up to 60s
    private val currentSegmentPcm = ArrayList<Float>(16000 * 15) // current phrase
    private val accumulatedSegments = mutableListOf<String>()

    // Adaptive noise floor tracker
    private val noiseTracker = com.autoris.asrbenchmark.noise.AdaptiveNoiseTracker()
    private var chunksRecordedCount = 0

    // VAD tracking counts
    private var silenceChunkCount = 0
    private var speechChunkCount = 0
    private var segmentHasSpeech = false

    var isSaveAudioEnabled: Boolean = false

    fun startRecording(coroutineScope: CoroutineScope): Boolean {
        if (_state.value.isRecording) {
            Log.w(TAG, "Already recording")
            return true
        }

        if (!asrEngine.start()) {
            onError("Khởi tạo phiên ASR Engine thất bại")
            return false
        }

        // Reset metrics & preprocessor
        sessionStartTimeNs = SystemClock.elapsedRealtimeNanos()
        firstSpeechTimeNs = 0L
        firstPartialTimeNs = 0L
        speechDetected = false
        totalProcessingMs = 0L
        totalSamplesRecorded = 0L
        noiseTracker.reset()
        chunksRecordedCount = 0
        silenceChunkCount = 0
        speechChunkCount = 0
        segmentHasSpeech = false

        preprocessor.reset()

        synchronized(recordedPcmBuffer) {
            recordedPcmBuffer.clear()
        }
        synchronized(currentSegmentPcm) {
            currentSegmentPcm.clear()
        }
        synchronized(accumulatedSegments) {
            accumulatedSegments.clear()
        }

        decodeScope = CoroutineScope(Dispatchers.Default + Job())

        _state.value = AudioCaptureState(
            isRecording = true,
            vadState = VadState.SILENCE,
            currentDb = -60.0f,
            audioDurationSec = 0.0f,
            samplesRecorded = 0L
        )

        val capture = AudioCapture(
            sampleRate = SAMPLE_RATE,
            chunkSamples = CHUNK_SAMPLES,
            profile = preprocessingProfile
        )
        audioCapture = capture

        val started = capture.start(coroutineScope, object : AudioCaptureListener {
            override fun onAudioChunk(shortSamples: ShortArray, floatSamples: FloatArray, count: Int) {
                handleIncomingAudioChunk(shortSamples, floatSamples, count)
            }

            override fun onError(message: String) {
                Log.e(TAG, "AudioCapture error: $message")
                this@AudioRecorderManager.onError(message)
            }
        })

        if (!started) {
            _state.value = _state.value.copy(isRecording = false)
            return false
        }

        return true
    }

    private fun handleIncomingAudioChunk(shortSamples: ShortArray, floatSamples: FloatArray, readCount: Int) {
        if (!_state.value.isRecording) return

        totalSamplesRecorded += readCount
        val durationSec = totalSamplesRecorded.toFloat() / SAMPLE_RATE

        // 1. Save raw audio for review & benchmark reproducibility
        if (isSaveAudioEnabled) {
            synchronized(recordedPcmBuffer) {
                for (i in 0 until readCount) {
                    recordedPcmBuffer.add(shortSamples[i])
                }
            }
        }

        // 2. Preprocessing pipeline (e.g. DPDFNet software filter if active)
        val rawSlice = if (readCount == CHUNK_SAMPLES) floatSamples else floatSamples.copyOf(readCount)
        val processedSlice = preprocessor.process(rawSlice)

        // 3. Compute RMS dB on audio chunk
        var sumSquare = 0.0
        for (sample in processedSlice) {
            sumSquare += (sample * sample)
        }
        val rms = sqrt(sumSquare / processedSlice.size)
        val db = if (rms > 0.0) (20 * log10(rms.toDouble())).toFloat().coerceIn(-90f, 0f) else -90f

        // 4. Adaptive noise floor tracking via sliding percentile energy window (3.0s window)
        chunksRecordedCount++
        val noiseProfile = noiseTracker.update(db)
        val noiseFloorDb = noiseProfile.noiseFloorDb
        val speechThresholdDb = noiseProfile.speechThresholdDb
        val silenceThresholdDb = noiseProfile.silenceThresholdDb

        // 5. Add to current phrase segment buffer
        synchronized(currentSegmentPcm) {
            for (sample in processedSlice) {
                currentSegmentPcm.add(sample)
            }
        }

        // 6. Energy VAD detection
        val isSpeechEnergy = db >= speechThresholdDb
        val isSilenceEnergy = db <= silenceThresholdDb

        if (isSpeechEnergy) {
            speechChunkCount++
            silenceChunkCount = 0
            if (speechChunkCount >= 3) { // at least 300ms of voice
                segmentHasSpeech = true
                if (!speechDetected) {
                    speechDetected = true
                    firstSpeechTimeNs = SystemClock.elapsedRealtimeNanos()
                }
            }
        } else if (isSilenceEnergy) {
            if (segmentHasSpeech) {
                silenceChunkCount++
            }
        } else {
            // Hysteresis band
            if (segmentHasSpeech && silenceChunkCount > 0) {
                silenceChunkCount++
            }
        }

        // Periodic logging every 1 second (10 chunks)
        if (chunksRecordedCount % 10 == 0) {
            Log.i(TAG, "VAD: t=${String.format(Locale.ROOT, "%.1f", durationSec)}s db=${db.toInt()} noiseFloor=${noiseFloorDb.toInt()} speechThresh=${speechThresholdDb.toInt()} silenceThresh=${silenceThresholdDb.toInt()} speechChunks=$speechChunkCount silChunks=$silenceChunkCount hasSpeech=$segmentHasSpeech")
        }

        // 7. Check if current phrase segment ended (natural pause ~1.0s = 10 chunks * 100ms)
        val isPauseDetected = segmentHasSpeech && (silenceChunkCount >= 10)

        if (isPauseDetected) {
            Log.i(TAG, ">>> [PAUSE TRIGGERED at ${String.format(Locale.ROOT, "%.1f", durationSec)}s] silenceChunks=$silenceChunkCount, segSamples=${currentSegmentPcm.size}")

            // Keep ~250ms trailing silence, trim remainder
            val trailingToKeep = (SAMPLE_RATE * 0.25f).toInt()
            val silenceToRemove = (silenceChunkCount * CHUNK_SAMPLES) - trailingToKeep
            val keepCount = if (silenceToRemove > 0 && currentSegmentPcm.size > silenceToRemove) {
                currentSegmentPcm.size - silenceToRemove
            } else {
                currentSegmentPcm.size
            }

            val segmentSamples: FloatArray
            synchronized(currentSegmentPcm) {
                if (keepCount in 1..currentSegmentPcm.size) {
                    segmentSamples = FloatArray(keepCount)
                    for (i in 0 until keepCount) {
                        segmentSamples[i] = currentSegmentPcm[i]
                    }
                } else {
                    segmentSamples = currentSegmentPcm.toFloatArray()
                }
                currentSegmentPcm.clear()
            }

            segmentHasSpeech = false
            speechChunkCount = 0
            silenceChunkCount = 0

            if (segmentSamples.size >= (SAMPLE_RATE * 0.4f)) { // at least 400ms of audio
                decodeScope?.launch {
                    decodeMutex.withLock {
                        val (segText, costMs) = asrEngine.decodeSegment(segmentSamples)
                        totalProcessingMs += costMs
                        if (segText.isNotBlank()) {
                            val formatted = formatSentence(segText)
                            synchronized(accumulatedSegments) {
                                accumulatedSegments.add(formatted)
                            }
                            val fullText = synchronized(accumulatedSegments) {
                                accumulatedSegments.joinToString(" ")
                            }
                            if (firstPartialTimeNs == 0L) {
                                firstPartialTimeNs = SystemClock.elapsedRealtimeNanos()
                            }
                            val latency = (SystemClock.elapsedRealtimeNanos() - (firstSpeechTimeNs.takeIf { it > 0 } ?: sessionStartTimeNs)) / 1_000_000
                            Log.i(TAG, "Segment decoded in ${costMs}ms: '$formatted'. Total: '$fullText'")
                            onPartialResult(fullText, latency)
                        }
                    }
                }
            }
        }

        val currentVad = when {
            isSpeechEnergy -> VadState.SPEECH
            segmentHasSpeech && silenceChunkCount > 0 -> VadState.ENDPOINT
            else -> VadState.SILENCE
        }

        _state.value = _state.value.copy(
            vadState = currentVad,
            currentDb = db,
            audioDurationSec = durationSec,
            samplesRecorded = totalSamplesRecorded
        )
    }

    private fun formatSentence(s: String): String {
        val trimmed = s.trim()
        if (trimmed.isEmpty()) return ""
        val cap = trimmed.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() }
        return if (cap.endsWith(".") || cap.endsWith("?") || cap.endsWith("!")) cap else "$cap."
    }

    fun stopRecording(): String {
        return stopRecordingInternal()
    }

    private fun stopRecordingInternal(): String {
        if (!_state.value.isRecording) {
            return synchronized(accumulatedSegments) { accumulatedSegments.joinToString(" ") }
        }

        _state.value = _state.value.copy(
            isRecording = false,
            vadState = VadState.SILENCE
        )

        audioCapture?.stop()
        audioCapture = null

        // Wait for any active segment decode to complete
        runBlocking {
            withTimeoutOrNull(2000L) {
                decodeMutex.withLock {
                    // Previous decode finished
                }
            }
        }

        // Decode any leftover segment audio
        val leftoverSamples: FloatArray
        synchronized(currentSegmentPcm) {
            leftoverSamples = currentSegmentPcm.toFloatArray()
            currentSegmentPcm.clear()
        }
        if (leftoverSamples.size >= (SAMPLE_RATE * 0.4f)) {
            val (lastText, costMs) = asrEngine.decodeSegment(leftoverSamples)
            totalProcessingMs += costMs
            if (lastText.isNotBlank()) {
                val formatted = formatSentence(lastText)
                synchronized(accumulatedSegments) {
                    accumulatedSegments.add(formatted)
                }
            }
        }

        decodeScope?.cancel()
        decodeScope = null

        asrEngine.stop()
        preprocessor.reset()

        val fullText = synchronized(accumulatedSegments) {
            if (accumulatedSegments.isNotEmpty()) {
                accumulatedSegments.joinToString(" ")
            } else {
                asrEngine.getFinalResult()
            }
        }

        _state.value = _state.value.copy(
            isRecording = false,
            vadState = VadState.SILENCE
        )

        return fullText
    }

    fun getRecordedPcm(): ShortArray {
        synchronized(recordedPcmBuffer) {
            return recordedPcmBuffer.toShortArray()
        }
    }

    fun release() {
        stopRecordingInternal()
        preprocessor.release()
        asrEngine.release()
    }
}
