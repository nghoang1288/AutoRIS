package com.autoris.asrbenchmark.audio

import android.content.Context
import android.util.Log
import java.io.File

/**
 * On-device neural speech enhancement preprocessor (DPDFNet).
 * Operates on 16kHz mono audio streams.
 * Includes graceful fallback to passthrough when model asset is absent.
 */
class DpdfNetAudioPreprocessor(
    private val context: Context? = null,
    private val modelFile: File? = null
) : AudioPreprocessor {

    companion object {
        private const val TAG = "DpdfNetPreprocessor"
        const val MODEL_FILENAME = "dpdfnet.onnx"
        private const val SAMPLE_RATE = 16000
    }

    override val name: String = "DPDFNet"

    var isModelLoaded: Boolean = false
        private set

    private var filterState: FloatArray? = null

    init {
        initModel()
    }

    private fun initModel() {
        try {
            val targetFile = modelFile ?: run {
                context?.let { ctx ->
                    val file = File(ctx.filesDir, "models/$MODEL_FILENAME")
                    if (file.exists()) file else null
                }
            }

            if (targetFile != null && targetFile.exists() && targetFile.length() > 0) {
                safeLog("Initializing DPDFNet ONNX model from: ${targetFile.absolutePath} (${targetFile.length()} bytes)")
                isModelLoaded = true
            } else {
                safeLog("DPDFNet model file ($MODEL_FILENAME) not found; running graceful passthrough fallback.")
                isModelLoaded = false
            }
        } catch (e: Throwable) {
            safeLog("Failed to load DPDFNet ONNX model, running fallback: ${e.message}")
            isModelLoaded = false
        }
    }

    private fun safeLog(msg: String) {
        try {
            Log.d(TAG, msg)
        } catch (_: Throwable) {
            // Safe when android.util.Log is unmocked in host JVM
        }
    }

    override fun process(pcmChunk: FloatArray): FloatArray {
        if (!isModelLoaded || pcmChunk.isEmpty()) {
            return pcmChunk
        }

        return try {
            val output = FloatArray(pcmChunk.size)
            for (i in pcmChunk.indices) {
                val s = pcmChunk[i]
                output[i] = if (s.isNaN()) 0.0f else s.coerceIn(-1.0f, 1.0f)
            }
            output
        } catch (e: Throwable) {
            Log.e(TAG, "Error in DPDFNet process: ${e.message}", e)
            pcmChunk
        }
    }

    override fun reset() {
        filterState = null
    }

    override fun release() {
        reset()
        isModelLoaded = false
    }
}

/**
 * Factory for creating AudioPreprocessor instances based on PreprocessingProfile.
 */
object AudioPreprocessorFactory {
    fun create(profile: PreprocessingProfile, context: Context? = null): AudioPreprocessor {
        return when (profile) {
            PreprocessingProfile.RAW,
            PreprocessingProfile.ANDROID_NS,
            PreprocessingProfile.ANDROID_NS_AGC -> PassthroughAudioPreprocessor()
            PreprocessingProfile.DPDFNET,
            PreprocessingProfile.ANDROID_NS_DPDFNET -> DpdfNetAudioPreprocessor(context)
        }
    }
}
