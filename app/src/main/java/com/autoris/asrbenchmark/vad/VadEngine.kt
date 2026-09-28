package com.autoris.asrbenchmark.vad

import com.autoris.asrbenchmark.noise.AdaptiveNoiseTracker
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Common interface for Voice Activity Detection (VAD) engines.
 */
interface VadEngine {
    val name: String
    val isNeural: Boolean

    /**
     * Processes a 16kHz float PCM chunk.
     * Returns true if speech is active in the chunk.
     */
    fun process(pcmChunk: FloatArray): Boolean

    /**
     * Speech probability in range [0.0f, 1.0f].
     */
    fun getSpeechProbability(): Float

    /**
     * Resets internal buffers, sliding windows, and hidden states.
     */
    fun reset()

    /**
     * Releases model and native resources.
     */
    fun release()
}

/**
 * Adaptive Energy VAD Engine based on dynamic noise floor tracking.
 */
class EnergyVadEngine(
    private val noiseTracker: AdaptiveNoiseTracker = AdaptiveNoiseTracker(),
    private val speechProbabilityThreshold: Float = 0.5f
) : VadEngine {

    override val name: String = "EnergyVAD"
    override val isNeural: Boolean = false

    private var currentProbability: Float = 0.0f

    override fun process(pcmChunk: FloatArray): Boolean {
        if (pcmChunk.isEmpty()) return false

        var sumSquare = 0.0
        for (s in pcmChunk) {
            sumSquare += (s * s)
        }
        val rms = sqrt(sumSquare / pcmChunk.size)
        val db = if (rms > 0.0) (20 * log10(rms)).toFloat().coerceIn(-90f, 0f) else -90f

        val profile = noiseTracker.update(db)
        val silenceThresh = profile.silenceThresholdDb
        val speechThresh = profile.speechThresholdDb

        currentProbability = if (db <= silenceThresh) {
            0.0f
        } else if (db >= speechThresh) {
            1.0f
        } else {
            ((db - silenceThresh) / (speechThresh - silenceThresh)).coerceIn(0.0f, 1.0f)
        }

        return currentProbability >= speechProbabilityThreshold
    }

    override fun getSpeechProbability(): Float = currentProbability

    override fun reset() {
        noiseTracker.reset()
        currentProbability = 0.0f
    }

    override fun release() {
        reset()
    }
}
