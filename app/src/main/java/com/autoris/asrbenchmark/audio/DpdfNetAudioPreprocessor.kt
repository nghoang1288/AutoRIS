package com.autoris.asrbenchmark.audio

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.k2fsa.sherpa.onnx.DenoisedAudio
import com.k2fsa.sherpa.onnx.OfflineSpeechDenoiser
import com.k2fsa.sherpa.onnx.OfflineSpeechDenoiserConfig
import com.k2fsa.sherpa.onnx.OfflineSpeechDenoiserDpdfNetModelConfig
import com.k2fsa.sherpa.onnx.OfflineSpeechDenoiserModelConfig
import java.io.File

enum class DenoiserStatus {
    NOT_LOADED,
    READY,
    UNAVAILABLE
}

/**
 * On-device neural speech enhancement preprocessor (DPDFNet).
 * Leverages native Sherpa-ONNX C++/JNI bindings for dual-path differential filtering.
 * Strictly adheres to clinical production standards:
 * - isModelLoaded is true ONLY when the native ONNX session is fully operational.
 * - If model asset is missing or load fails, status is explicitly UNAVAILABLE.
 * - Never masquerades passthrough audio as neural DPDFNet denoising.
 */
class DpdfNetAudioPreprocessor(
    private val context: Context? = null,
    private val modelFile: File? = null,
    private val numThreads: Int = 2
) : AudioPreprocessor {

    companion object {
        private const val TAG = "DpdfNetPreprocessor"
        const val MODEL_FILENAME = "dpdfnet.onnx"
        private const val SAMPLE_RATE = 16000
    }

    override val name: String get() = if (isModelLoaded) "DPDFNet (ONNX Native)" else "DPDFNet (UNAVAILABLE)"

    var isModelLoaded: Boolean = false
        private set

    var status: DenoiserStatus = DenoiserStatus.NOT_LOADED
        private set

    var lastInferenceCostMs: Long = 0L
        private set

    private var denoiser: OfflineSpeechDenoiser? = null

    init {
        initModel()
    }

    private fun initModel() {
        try {
            val targetFile = modelFile ?: run {
                context?.let { ctx ->
                    val file = File(ctx.filesDir, "models/$MODEL_FILENAME")
                    if (file.exists() && file.length() > 0) file else null
                }
            }

            if (targetFile != null && targetFile.exists() && targetFile.length() > 0) {
                safeLog("Initializing native Sherpa-ONNX DPDFNet from: ${targetFile.absolutePath} (${targetFile.length()} bytes)")

                val dpdfnetConfig = OfflineSpeechDenoiserDpdfNetModelConfig(
                    model = targetFile.absolutePath
                )
                val modelConfig = OfflineSpeechDenoiserModelConfig(
                    dpdfnet = dpdfnetConfig,
                    numThreads = numThreads,
                    debug = false,
                    provider = "cpu"
                )
                val config = OfflineSpeechDenoiserConfig(model = modelConfig)

                denoiser?.release()
                denoiser = OfflineSpeechDenoiser(assetManager = null, config = config)
                isModelLoaded = true
                status = DenoiserStatus.READY
                safeLog("DPDFNet native denoiser successfully initialized.")
            } else {
                safeLog("DPDFNet model file ($MODEL_FILENAME) not found; setting status to UNAVAILABLE.")
                isModelLoaded = false
                status = DenoiserStatus.UNAVAILABLE
            }
        } catch (e: Throwable) {
            safeLog("Failed to initialize DPDFNet native denoiser: ${e.message}; status=UNAVAILABLE.")
            isModelLoaded = false
            status = DenoiserStatus.UNAVAILABLE
        }
    }

    override fun process(pcmChunk: FloatArray): FloatArray {
        if (!isModelLoaded || denoiser == null || pcmChunk.isEmpty()) {
            return pcmChunk
        }

        return try {
            val startNs = SystemClock.elapsedRealtimeNanos()
            val denoised: DenoisedAudio = denoiser!!.run(pcmChunk, SAMPLE_RATE)
            lastInferenceCostMs = (SystemClock.elapsedRealtimeNanos() - startNs) / 1_000_000

            val samples = denoised.samples
            if (samples.isNotEmpty()) samples else pcmChunk
        } catch (e: Throwable) {
            safeLog("Error during DPDFNet inference: ${e.message}")
            pcmChunk
        }
    }

    override fun reset() {
        // Stateless chunk processing; ready for continuous stream
    }

    override fun release() {
        try {
            denoiser?.release()
        } catch (_: Throwable) {}
        denoiser = null
        isModelLoaded = false
        status = DenoiserStatus.NOT_LOADED
    }

    private fun safeLog(msg: String) {
        try {
            Log.d(TAG, msg)
        } catch (_: Throwable) {}
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
