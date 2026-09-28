package com.autoris.asrbenchmark.audio

/**
 * Preprocessing profiles supported by the AutoRIS benchmark pipeline.
 */
enum class PreprocessingProfile(
    val id: String,
    val displayName: String,
    val description: String
) {
    RAW(
        id = "RAW",
        displayName = "Raw Audio (No Filter)",
        description = "Pure untouched 16kHz PCM audio without hardware or software filtering."
    ),
    ANDROID_NS(
        id = "ANDROID_NS",
        displayName = "Android Hardware NS",
        description = "Qualcomm/Samsung hardware noise suppression via Android AudioEffect API."
    ),
    ANDROID_NS_AGC(
        id = "ANDROID_NS_AGC",
        displayName = "Android NS + AGC",
        description = "Hardware noise suppression combined with Automatic Gain Control."
    ),
    DPDFNET(
        id = "DPDFNET",
        displayName = "DPDFNet (Neural)",
        description = "Lightweight on-device deep neural speech enhancement model (ONNX)."
    ),
    ANDROID_NS_DPDFNET(
        id = "ANDROID_NS_DPDFNET",
        displayName = "Android NS + DPDFNet",
        description = "Hardware noise suppression cascaded into neural DPDFNet filter."
    );

    companion object {
        fun fromId(id: String): PreprocessingProfile {
            return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: RAW
        }
    }
}

/**
 * Common abstraction for audio preprocessors (filters, speech enhancers, gain normalization).
 */
interface AudioPreprocessor {
    val name: String

    /**
     * Process a mono 16kHz float PCM chunk [-1.0f, 1.0f].
     * Returns enhanced audio chunk of same or modified length.
     */
    fun process(pcmChunk: FloatArray): FloatArray

    /**
     * Reset internal filter state (e.g. at the start of a new utterance).
     */
    fun reset()

    /**
     * Release any native or onnx runtime resources.
     */
    fun release()
}

/**
 * Identity preprocessor that forwards samples without alteration.
 */
class PassthroughAudioPreprocessor : AudioPreprocessor {
    override val name: String = "Passthrough"

    override fun process(pcmChunk: FloatArray): FloatArray {
        return pcmChunk
    }

    override fun reset() {}

    override fun release() {}
}
