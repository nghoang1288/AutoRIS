package com.autoris.asrbenchmark.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
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
import kotlinx.coroutines.isActive
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
    private val onPartialResult: (text: String, firstPartialLatencyMs: Long) -> Unit,
    private val onError: (message: String) -> Unit
) {

    companion object {
        private const val TAG = "AudioRecorderManager"
        const val SAMPLE_RATE = 16000
        const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val CHUNK_SAMPLES = 1600 // 100ms chunks
    }

    private val _state = MutableStateFlow(AudioCaptureState())
    val state: StateFlow<AudioCaptureState> = _state.asStateFlow()

    private var audioRecord: AudioRecord? = null
    private var recordingJob: Job? = null
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

    // Sliding energy window for adaptive noise floor tracking (last 30 chunks = 3.0s)
    private val energyWindow = FloatArray(30) { -40.0f }
    private var energyWindowIndex = 0
    private var chunksRecordedCount = 0

    var isSaveAudioEnabled: Boolean = false

    @SuppressLint("MissingPermission")
    fun startRecording(coroutineScope: CoroutineScope): Boolean {
        if (_state.value.isRecording) {
            Log.w(TAG, "Already recording")
            return true
        }

        val minBufSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        if (minBufSize <= 0) {
            onError("Không xác định được audio buffer size phù hợp")
            return false
        }

        val bufferSize = maxOf(minBufSize * 2, CHUNK_SAMPLES * 2 * 2)

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            )
        } catch (e: Exception) {
            // Fallback to standard MIC if VOICE_RECOGNITION fails
            try {
                audioRecord = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    bufferSize
                )
            } catch (e2: Exception) {
                onError("Khởi tạo AudioRecord thất bại: ${e2.message}")
                return false
            }
        }

        val record = audioRecord ?: run {
            onError("AudioRecord is null")
            return false
        }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            onError("AudioRecord không thể chuyển sang trạng thái INITIALIZED")
            return false
        }

        if (!asrEngine.start()) {
            onError("Khởi tạo phiên ASR Engine thất bại")
            return false
        }

        record.startRecording()

        // Reset metrics
        sessionStartTimeNs = SystemClock.elapsedRealtimeNanos()
        firstSpeechTimeNs = 0L
        firstPartialTimeNs = 0L
        speechDetected = false
        totalProcessingMs = 0L
        totalSamplesRecorded = 0L
        energyWindow.fill(-40.0f)
        energyWindowIndex = 0
        chunksRecordedCount = 0

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

        recordingJob = coroutineScope.launch(Dispatchers.Default) {
            val shortBuffer = ShortArray(CHUNK_SAMPLES)
            val floatBuffer = FloatArray(CHUNK_SAMPLES)

            var silenceChunkCount = 0
            var speechChunkCount = 0
            var segmentHasSpeech = false

            while (isActive && _state.value.isRecording) {
                val readCount = record.read(shortBuffer, 0, CHUNK_SAMPLES)
                if (readCount <= 0) {
                    break
                }
                totalSamplesRecorded += readCount
                    val durationSec = totalSamplesRecorded.toFloat() / SAMPLE_RATE

                    // Save raw PCM for full uninterrupted WAV
                    if (isSaveAudioEnabled) {
                        synchronized(recordedPcmBuffer) {
                            for (i in 0 until readCount) {
                                recordedPcmBuffer.add(shortBuffer[i])
                            }
                        }
                    }

                    // Compute RMS dB
                    var sumSquare = 0.0
                    for (i in 0 until readCount) {
                        val s = shortBuffer[i].toFloat()
                        sumSquare += (s * s)
                        floatBuffer[i] = s / 32768.0f
                    }
                    val rms = sqrt(sumSquare / readCount)
                    val db = if (rms > 0.0) (20 * log10(rms / 32768.0)).toFloat().coerceIn(-90f, 0f) else -90f

                    // Adaptive noise floor tracking via sliding percentile energy window (3.0 seconds)
                    energyWindow[energyWindowIndex] = db
                    energyWindowIndex = (energyWindowIndex + 1) % energyWindow.size
                    chunksRecordedCount++

                    val validCount = minOf(chunksRecordedCount, energyWindow.size)
                    val sortedEnergies = FloatArray(validCount)
                    for (i in 0 until validCount) {
                        sortedEnergies[i] = energyWindow[i]
                    }
                    sortedEnergies.sort()
                    val percentileIdx = (validCount * 0.15f).toInt().coerceIn(0, validCount - 1)
                    val noiseFloorDb = sortedEnergies[percentileIdx].coerceIn(-65.0f, -30.0f)

                    val speechThresholdDb = (noiseFloorDb + 7.0f).coerceIn(-46.0f, -25.0f)
                    val silenceThresholdDb = (noiseFloorDb + 3.0f).coerceIn(-50.0f, -29.0f)

                    // Add to current phrase segment buffer
                    val audioSlice = if (readCount == CHUNK_SAMPLES) floatBuffer else floatBuffer.copyOf(readCount)
                    synchronized(currentSegmentPcm) {
                        for (sample in audioSlice) {
                            currentSegmentPcm.add(sample)
                        }
                    }

                    // Energy VAD detection
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

                    // Check if current phrase segment ended (natural pause ~1.0s = 10 chunks * 100ms)
                    val isPauseDetected = segmentHasSpeech && (silenceChunkCount >= 10)

                    if (isPauseDetected) {
                        Log.i(TAG, ">>> [PAUSE TRIGGERED at ${String.format(Locale.ROOT, "%.1f", durationSec)}s] silenceChunks=$silenceChunkCount, segSamples=${currentSegmentPcm.size}")

                        // Keep ~250ms trailing silence, trim the rest
                        val trailingToKeep = (SAMPLE_RATE * 0.25f).toInt()
                        val silenceToRemove = (silenceChunkCount * CHUNK_SAMPLES) - trailingToKeep
                        val keepCount = if (silenceToRemove > 0 && currentSegmentPcm.size > silenceToRemove) {
                            currentSegmentPcm.size - silenceToRemove
                        } else {
                            currentSegmentPcm.size
                        }

                        val segmentSamples: FloatArray
                        synchronized(currentSegmentPcm) {
                            if (keepCount > 0 && keepCount <= currentSegmentPcm.size) {
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
        }

        return true
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

        recordingJob?.cancel()
        recordingJob = null

        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping audioRecord", e)
        }
        audioRecord = null

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
        asrEngine.release()
    }
}
