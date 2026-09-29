package com.autoris.asrbenchmark.audio

import android.os.SystemClock
import android.util.Log
import com.autoris.asrbenchmark.asr.ASREngine
import com.autoris.asrbenchmark.noise.AdaptiveNoiseTracker
import com.autoris.asrbenchmark.noise.NoisePolicyEngine
import com.autoris.asrbenchmark.noise.NoiseProfile
import com.autoris.asrbenchmark.noise.PolicyDecision
import com.autoris.asrbenchmark.vad.EndpointState
import com.autoris.asrbenchmark.vad.EndpointStateMachine
import com.autoris.asrbenchmark.vad.EnergyVadEngine
import com.autoris.asrbenchmark.vad.VadConfig
import com.autoris.asrbenchmark.vad.VadEngine
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
import java.util.ArrayDeque
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
    private val streamingEngine: ASREngine? = null,
    private val vadConfig: VadConfig = VadConfig(),
    private val vadEngine: VadEngine = EnergyVadEngine(),
    val preprocessingProfile: PreprocessingProfile = PreprocessingProfile.RAW,
    private val preprocessor: AudioPreprocessor = PassthroughAudioPreprocessor(),
    private val speakerVerifier: SpeakerVerifier? = null,
    var isSpeakerLockEnabled: Boolean = false,
    private val noisePolicyEngine: NoisePolicyEngine = NoisePolicyEngine(),
    private val onPolicyDecision: ((PolicyDecision) -> Unit)? = null,
    private val onNoiseProfileUpdate: ((NoiseProfile) -> Unit)? = null,
    private val onPartialResult: (text: String, firstPartialLatencyMs: Long) -> Unit,
    private val onSpeakerVerificationResult: ((VoiceLockResult) -> Unit)? = null,
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
    private var streamingScope: CoroutineScope? = null
    private val decodeMutex = Mutex()

    // Timing metrics
    private var sessionStartTimeNs: Long = 0L
    private var firstSpeechTimeNs: Long = 0L
    private var firstPartialTimeNs: Long = 0L
    private var speechDetected: Boolean = false
    private var totalProcessingMs: Long = 0L
    private var totalSamplesRecorded: Long = 0L

    var latestPolicyDecision: PolicyDecision? = null
        private set

    var lastStreamingTranscript: String = ""
        private set

    // In-memory audio buffer for saving WAV
    private val recordedPcmBuffer = ArrayList<Short>(16000 * 60) // up to 60s
    private val currentSegmentPcm = ArrayList<Float>(16000 * 15) // current phrase
    private val accumulatedSegments = mutableListOf<String>()

    // Circular pre-speech ring buffer: keeps ~300ms (3 chunks * 1600 samples)
    private val preSpeechRingBuffer = ArrayDeque<FloatArray>(3)

    // Adaptive noise floor tracker
    private val noiseTracker = AdaptiveNoiseTracker()
    private var chunksRecordedCount = 0

    // Robust Endpoint State Machine
    private val endpointStateMachine = EndpointStateMachine(
        minSpeechChunksToEnter = (vadConfig.minSpeechDurationMs / 100).toInt().coerceIn(1, 4),
        minSilenceChunksForPossible = (vadConfig.endpointDelayMs / 200).toInt().coerceAtLeast(3),
        minSilenceChunksForConfirmed = (vadConfig.endpointDelayMs / 100).toInt().coerceAtLeast(5)
    )

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

        // Reset metrics, tracker, VAD, buffers
        sessionStartTimeNs = SystemClock.elapsedRealtimeNanos()
        firstSpeechTimeNs = 0L
        firstPartialTimeNs = 0L
        speechDetected = false
        totalProcessingMs = 0L
        totalSamplesRecorded = 0L
        noiseTracker.reset()
        chunksRecordedCount = 0
        endpointStateMachine.reset()
        preSpeechRingBuffer.clear()

        preprocessor.reset()
        vadEngine.reset()

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
        streamingScope = CoroutineScope(Dispatchers.Default + Job())
        streamingEngine?.start()

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

        // 3. Compute RMS dB and clipping check
        var sumSquare = 0.0
        var clippingDetected = false
        for (sample in processedSlice) {
            sumSquare += (sample * sample)
            if (sample >= 0.98f || sample <= -0.98f) {
                clippingDetected = true
            }
        }
        val rms = sqrt(sumSquare / processedSlice.size)
        val db = if (rms > 0.0) (20 * log10(rms.toDouble())).toFloat().coerceIn(-90f, 0f) else -90f

        // 4. VAD evaluation
        val isVadSpeech = vadEngine.process(processedSlice)
        val speechProb = vadEngine.getSpeechProbability()

        // 5. Endpoint State Machine update
        val previousState = endpointStateMachine.state
        val currentState = endpointStateMachine.update(
            isSpeech = isVadSpeech,
            speechProbability = speechProb,
            currentDb = db,
            noiseFloorDb = noiseTracker.getEstimatedNoiseFloor()
        )

        val isSpeaking = (currentState == EndpointState.SPEECH ||
                          currentState == EndpointState.POSSIBLE_SPEECH ||
                          currentState == EndpointState.POSSIBLE_ENDPOINT)

        // 6. Adaptive noise tracking (freeze noise floor window during speech)
        chunksRecordedCount++
        val noiseProfile = noiseTracker.update(db, isSpeech = isSpeaking)
        onNoiseProfileUpdate?.invoke(noiseProfile)

        // 7. Segment audio buffering with pre-speech onset protection
        synchronized(currentSegmentPcm) {
            when (currentState) {
                EndpointState.SILENCE -> {
                    // P0-3: If transitioned back to SILENCE from a false trigger (POSSIBLE_SPEECH) without reaching speech, clear phantom audio
                    if (previousState == EndpointState.POSSIBLE_SPEECH) {
                        currentSegmentPcm.clear()
                    }
                    if (preSpeechRingBuffer.size >= 3) {
                        preSpeechRingBuffer.removeFirst()
                    }
                    preSpeechRingBuffer.addLast(processedSlice.clone())
                }
                EndpointState.POSSIBLE_SPEECH, EndpointState.SPEECH -> {
                    if (previousState == EndpointState.SILENCE && currentSegmentPcm.isEmpty()) {
                        // Flush pre-speech buffer so leading consonants are intact
                        while (preSpeechRingBuffer.isNotEmpty()) {
                            val preChunk = preSpeechRingBuffer.removeFirst()
                            for (s in preChunk) currentSegmentPcm.add(s)
                        }
                    }
                    for (sample in processedSlice) {
                        currentSegmentPcm.add(sample)
                    }
                    if (currentState == EndpointState.SPEECH && !speechDetected) {
                        speechDetected = true
                        firstSpeechTimeNs = SystemClock.elapsedRealtimeNanos()
                    }
                }
                EndpointState.POSSIBLE_ENDPOINT -> {
                    for (sample in processedSlice) {
                        currentSegmentPcm.add(sample)
                    }
                }
                EndpointState.ENDPOINT_CONFIRMED -> {
                    for (sample in processedSlice) {
                        currentSegmentPcm.add(sample)
                    }
                }
            }
        }

        // 7b. Feed live speech chunk to streaming engine for immediate partial feedback
        if (streamingEngine != null && isSpeaking) {
            val chunkCopy = processedSlice.clone()
            streamingScope?.launch {
                streamingEngine.acceptAudio(chunkCopy)
                streamingEngine.decodeStep()
                val partial = streamingEngine.getPartialResult().trim()
                if (partial.isNotBlank()) {
                    val prefix = synchronized(accumulatedSegments) { accumulatedSegments.joinToString(" ") }
                    val displayText = if (prefix.isNotBlank()) "$prefix $partial" else partial
                    lastStreamingTranscript = displayText
                    val latency = (SystemClock.elapsedRealtimeNanos() - (firstSpeechTimeNs.takeIf { it > 0 } ?: sessionStartTimeNs)) / 1_000_000
                    onPartialResult(displayText, latency)
                }
            }
        }

        // Periodic logging every 1 second (10 chunks)
        if (chunksRecordedCount % 10 == 0) {
            Log.i(TAG, "VAD: t=${String.format(Locale.ROOT, "%.1f", durationSec)}s db=${db.toInt()} floor=${noiseProfile.noiseFloorDb.toInt()} state=$currentState isSpeaking=$isSpeaking segSamples=${synchronized(currentSegmentPcm) { currentSegmentPcm.size }}")
        }

        // 8. Natural sentence boundary reached
        if (currentState == EndpointState.ENDPOINT_CONFIRMED && speechDetected) {
            Log.i(TAG, ">>> [PAUSE TRIGGERED at ${String.format(Locale.ROOT, "%.1f", durationSec)}s] state=$currentState segSamples=${synchronized(currentSegmentPcm) { currentSegmentPcm.size }}")
            streamingEngine?.reset()

            // Keep ~250ms trailing silence, trim remainder
            val trailingToKeep = (SAMPLE_RATE * 0.25f).toInt()
            val silenceChunks = endpointStateMachine.silenceStreak
            val silenceToRemove = (silenceChunks * CHUNK_SAMPLES) - trailingToKeep
            val keepCount = synchronized(currentSegmentPcm) {
                if (silenceToRemove > 0 && currentSegmentPcm.size > silenceToRemove) {
                    currentSegmentPcm.size - silenceToRemove
                } else {
                    currentSegmentPcm.size
                }
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

            // Reset utterance tracking
            speechDetected = false
            endpointStateMachine.reset()
            preSpeechRingBuffer.clear()

            // Run Policy Engine evaluation at phrase boundary
            val decision = noisePolicyEngine.evaluate(
                noiseProfile = noiseProfile,
                clippingOccurred = clippingDetected
            )
            latestPolicyDecision = decision
            onPolicyDecision?.invoke(decision)

            if (segmentSamples.size >= (SAMPLE_RATE * 0.4f)) { // at least 400ms of audio
                decodeScope?.launch {
                    decodeMutex.withLock {
                        // 1. Speaker Verification Gate (Biometric check)
                        if (isSpeakerLockEnabled && speakerVerifier != null) {
                            val vResult = speakerVerifier.verify(segmentSamples)
                            onSpeakerVerificationResult?.invoke(vResult)
                            if (vResult.state == VoiceLockState.REJECT) {
                                Log.w(TAG, "Speaker Verification REJECTED: similarity=${vResult.similarity}, conf=${vResult.confidence}. Ignoring interloper speech segment.")
                                return@withLock
                            }
                        }

                        // 2. ASR decoding for accepted speech
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

        val vadState = when (currentState) {
            EndpointState.SILENCE -> VadState.SILENCE
            EndpointState.POSSIBLE_SPEECH, EndpointState.SPEECH -> VadState.SPEECH
            EndpointState.POSSIBLE_ENDPOINT, EndpointState.ENDPOINT_CONFIRMED -> VadState.ENDPOINT
        }

        _state.value = _state.value.copy(
            vadState = vadState,
            currentDb = db,
            audioDurationSec = durationSec,
            samplesRecorded = totalSamplesRecorded
        )
    }

    private fun formatSentence(s: String): String {
        val trimmed = s.trim()
        if (trimmed.isEmpty()) return ""
        val lower = trimmed.lowercase(Locale("vi", "VN"))
        val cap = lower.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() }
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
                Log.i(TAG, "Leftover segment decoded in ${costMs}ms: '$formatted'")
            }
        }

        decodeScope?.cancel()
        decodeScope = null
        streamingScope?.cancel()
        streamingScope = null

        streamingEngine?.stop()
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

    fun getTotalProcessingMs(): Long = totalProcessingMs

    fun release() {
        stopRecordingInternal()
        preprocessor.release()
        vadEngine.release()
        streamingEngine?.release()
        asrEngine.release()
    }
}
