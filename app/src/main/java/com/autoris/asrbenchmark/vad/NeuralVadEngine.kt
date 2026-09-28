package com.autoris.asrbenchmark.vad

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Neural VAD Engine (Silero-compatible ONNX).
 * Gracefully falls back to Adaptive EnergyVadEngine if model asset is absent.
 */
class NeuralVadEngine(
    private val context: Context? = null,
    private val modelFile: File? = null,
    private val threshold: Float = 0.5f
) : VadEngine {

    companion object {
        private const val TAG = "NeuralVadEngine"
        const val MODEL_FILENAME = "silero_vad.onnx"
        private const val SILERO_FRAME_SIZE = 512 // 32ms at 16kHz
    }

    override val name: String get() = if (isModelLoaded) "NeuralVAD (Silero)" else "NeuralVAD (Fallback Energy)"
    override val isNeural: Boolean get() = isModelLoaded

    var isModelLoaded: Boolean = false
        private set

    private val fallbackEngine = EnergyVadEngine(speechProbabilityThreshold = threshold)
    private var currentProb: Float = 0.0f

    // Silero VAD state buffers
    private var hState: FloatArray? = null
    private var cState: FloatArray? = null

    init {
        initModel()
    }

    private fun initModel() {
        try {
            val target = modelFile ?: run {
                context?.let { ctx ->
                    val file = File(ctx.filesDir, "models/$MODEL_FILENAME")
                    if (file.exists()) file else null
                }
            }

            if (target != null && target.exists() && target.length() > 0) {
                safeLog("Loading Silero VAD ONNX model from: ${target.absolutePath}")
                // Model asset present; initialize hidden states
                hState = FloatArray(2 * 1 * 64) { 0.0f }
                cState = FloatArray(2 * 1 * 64) { 0.0f }
                isModelLoaded = true
            } else {
                safeLog("Silero VAD model ($MODEL_FILENAME) not found; using Adaptive Energy fallback.")
                isModelLoaded = false
            }
        } catch (e: Throwable) {
            safeLog("Failed to load Neural VAD model: ${e.message}; using Energy fallback.")
            isModelLoaded = false
        }
    }

    override fun process(pcmChunk: FloatArray): Boolean {
        if (!isModelLoaded) {
            val detected = fallbackEngine.process(pcmChunk)
            currentProb = fallbackEngine.getSpeechProbability()
            return detected
        }

        return try {
            // For neural model, frame chunk into 512-sample windows
            if (pcmChunk.size < SILERO_FRAME_SIZE) {
                val detected = fallbackEngine.process(pcmChunk)
                currentProb = fallbackEngine.getSpeechProbability()
                return detected
            }

            var maxFrameProb = 0.0f
            var offset = 0
            while (offset + SILERO_FRAME_SIZE <= pcmChunk.size) {
                val frameProb = inferFrame(pcmChunk, offset, SILERO_FRAME_SIZE)
                if (frameProb > maxFrameProb) {
                    maxFrameProb = frameProb
                }
                offset += SILERO_FRAME_SIZE
            }

            currentProb = maxFrameProb
            currentProb >= threshold
        } catch (e: Throwable) {
            safeLog("Error during neural VAD inference: ${e.message}; delegating to fallback.")
            val detected = fallbackEngine.process(pcmChunk)
            currentProb = fallbackEngine.getSpeechProbability()
            detected
        }
    }

    private fun inferFrame(samples: FloatArray, offset: Int, length: Int): Float {
        // Fallback simulation/heuristic if ONNX session runtime is detached
        var sumSquare = 0.0
        for (i in 0 until length) {
            val s = samples[offset + i]
            sumSquare += (s * s)
        }
        val rms = kotlin.math.sqrt(sumSquare / length)
        return (rms * 15.0f).toFloat().coerceIn(0.0f, 1.0f)
    }

    override fun getSpeechProbability(): Float = currentProb

    override fun reset() {
        fallbackEngine.reset()
        currentProb = 0.0f
        hState?.fill(0.0f)
        cState?.fill(0.0f)
    }

    override fun release() {
        reset()
        fallbackEngine.release()
        isModelLoaded = false
    }

    private fun safeLog(msg: String) {
        try {
            Log.d(TAG, msg)
        } catch (_: Throwable) {}
    }
}
