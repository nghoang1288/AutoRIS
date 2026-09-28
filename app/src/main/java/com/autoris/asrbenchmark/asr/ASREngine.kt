package com.autoris.asrbenchmark.asr

/**
 * Common abstraction for ASR Engines (Streaming Zipformer, Offline Zipformer, future engines).
 * Decouples speech recognition engine from the UI and benchmark layers.
 */
interface ASREngine {
    val name: String
    val isStreaming: Boolean
    val isReady: Boolean

    /**
     * Initializes the engine with model files and native configuration.
     * Returns true if initialization succeeded.
     */
    fun init(): Boolean

    /**
     * Prepares engine for a new utterance session.
     */
    fun start(): Boolean

    /**
     * Feeds raw PCM audio samples (float normalized to [-1.0f, 1.0f], 16kHz mono).
     */
    fun acceptAudio(samples: FloatArray)

    /**
     * Runs decoding step if decoder is ready.
     * Returns pure processing time spent in this decode step (in milliseconds).
     */
    fun decodeStep(): Long

    /**
     * Returns true if native VAD / endpointing detected end of speech.
     */
    fun isEndpoint(): Boolean

    /**
     * Gets current partial hypothesis. Replaces previous partial (NOT appended).
     */
    fun getPartialResult(): String

    /**
     * Finalizes current utterance and returns final transcript.
     */
    fun getFinalResult(): String

    /**
     * Resets internal stream state for the next utterance.
     */
    fun reset()

    /**
     * Stops the engine session.
     */
    fun stop()

    /**
     * Decodes an isolated audio segment directly (used for continuous chunk-based decoding).
     * Returns Pair(transcript, processingTimeMs).
     */
    fun decodeSegment(samples: FloatArray): Pair<String, Long> {
        return Pair("", 0L)
    }

    /**
     * Releases native memory and pointers.
     */
    fun release()
}
