package com.autoris.asrbenchmark.vad

import android.content.Context
import android.util.Log
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import java.io.File

/**
 * Neural VAD Engine leveraging native Sherpa-ONNX Silero VAD bindings.
 * Operates on 16kHz mono audio streams.
 * If model weights are absent, explicitly logs `active_vad = ENERGY_FALLBACK`
 * and delegates to EnergyVadEngine.
 */
class NeuralVadEngine(
    private val context: Context? = null,
    private val modelFile: File? = null,
    private val threshold: Float = 0.5f,
    private val numThreads: Int = 2
) : VadEngine {

    companion object {
        private const val TAG = "NeuralVadEngine"
        const val MODEL_FILENAME = "silero_vad.onnx"
        private const val SILERO_FRAME_SIZE = 512 // 32ms at 16kHz
    }

    override val name: String get() = if (isModelLoaded) "NeuralVAD (Silero ONNX Native)" else "NeuralVAD (ENERGY_FALLBACK)"
    override val isNeural: Boolean get() = isModelLoaded

    var isModelLoaded: Boolean = false
        private set

    private var nativeVad: Vad? = null
    private val fallbackEngine = EnergyVadEngine(speechProbabilityThreshold = threshold)
    private var currentProb: Float = 0.0f

    init {
        initModel()
    }

    private fun initModel() {
        try {
            val target = modelFile ?: run {
                context?.let { ctx ->
                    val file = File(ctx.filesDir, "models/$MODEL_FILENAME")
                    if (file.exists() && file.length() > 0) file else null
                }
            }

            if (target != null && target.exists() && target.length() > 0) {
                safeLog("Loading native Silero VAD ONNX model from: ${target.absolutePath} (${target.length()} bytes)")

                val sileroConfig = SileroVadModelConfig(
                    model = target.absolutePath,
                    threshold = threshold,
                    minSilenceDuration = 0.5f,
                    minSpeechDuration = 0.25f,
                    windowSize = SILERO_FRAME_SIZE,
                    maxSpeechDuration = 30.0f
                )
                val config = VadModelConfig(
                    sileroVadModelConfig = sileroConfig,
                    sampleRate = 16000,
                    numThreads = numThreads,
                    provider = "cpu",
                    debug = false
                )

                nativeVad?.release()
                nativeVad = Vad(assetManager = null, config = config)
                isModelLoaded = true
                safeLog("Native Silero VAD successfully initialized: active_vad = SILERO_ONNX_NATIVE")
            } else {
                safeLog("Silero VAD model ($MODEL_FILENAME) not found; active_vad = ENERGY_FALLBACK")
                isModelLoaded = false
            }
        } catch (e: Throwable) {
            safeLog("Failed to initialize native Silero VAD: ${e.message}; active_vad = ENERGY_FALLBACK")
            isModelLoaded = false
        }
    }

    override fun process(pcmChunk: FloatArray): Boolean {
        if (!isModelLoaded || nativeVad == null) {
            val detected = fallbackEngine.process(pcmChunk)
            currentProb = fallbackEngine.getSpeechProbability()
            return detected
        }

        return try {
            val vad = nativeVad!!
            // Frame into 512-sample slices
            var maxProb = 0.0f
            var offset = 0
            while (offset + SILERO_FRAME_SIZE <= pcmChunk.size) {
                val slice = FloatArray(SILERO_FRAME_SIZE) { pcmChunk[offset + it] }
                val prob = vad.compute(slice)
                if (prob > maxProb) {
                    maxProb = prob
                }
                offset += SILERO_FRAME_SIZE
            }

            currentProb = maxProb
            vad.isSpeechDetected() || currentProb >= threshold
        } catch (e: Throwable) {
            safeLog("Error during native VAD compute: ${e.message}; falling back to EnergyVadEngine")
            val detected = fallbackEngine.process(pcmChunk)
            currentProb = fallbackEngine.getSpeechProbability()
            detected
        }
    }

    override fun getSpeechProbability(): Float = currentProb

    override fun reset() {
        fallbackEngine.reset()
        currentProb = 0.0f
        try {
            nativeVad?.reset()
        } catch (_: Throwable) {}
    }

    override fun release() {
        reset()
        fallbackEngine.release()
        try {
            nativeVad?.release()
        } catch (_: Throwable) {}
        nativeVad = null
        isModelLoaded = false
    }

    private fun safeLog(msg: String) {
        try {
            Log.d(TAG, msg)
        } catch (_: Throwable) {}
    }
}
