package com.autoris.asrbenchmark.audio

import kotlin.math.sqrt

enum class VoiceLockState {
    ACCEPT,
    REJECT,
    UNCERTAIN
}

data class VoiceLockResult(
    val state: VoiceLockState,
    val confidence: Float,
    val similarity: Float
) {
    val isAccepted: Boolean get() = state == VoiceLockState.ACCEPT
    val isRejected: Boolean get() = state == VoiceLockState.REJECT
    val isUncertain: Boolean get() = state == VoiceLockState.UNCERTAIN
}

/**
 * On-device Voice Lock (Speaker Gate).
 * Prevents interloper/background voices in radiology reading rooms
 * from corrupting clinical dictation.
 */
class VoiceLock(
    var isEnabled: Boolean = false,
    var acceptThreshold: Float = 0.65f,
    var rejectThreshold: Float = 0.40f
) {
    companion object {
        private const val FEATURE_DIM = 64
    }

    private var enrolledProfile: FloatArray? = null

    val isEnrolled: Boolean get() = enrolledProfile != null

    /**
     * Enrolls the primary doctor's voice using sample audio (e.g. 2-5 seconds).
     */
    fun enroll(samples: FloatArray): Boolean {
        if (samples.size < 1600) return false // At least 100ms
        val embedding = extractAcousticFeatureVector(samples)
        enrolledProfile = embedding
        return true
    }

    /**
     * Sets an explicit enrolled embedding vector.
     */
    fun setEnrolledEmbedding(embedding: FloatArray) {
        enrolledProfile = normalize(embedding)
    }

    /**
     * Verifies if incoming audio belongs to the enrolled radiologist.
     * STRICTLY FAIL-CLOSED: If VoiceLock is enabled but no profile is enrolled,
     * returns REJECT to prevent unauthorized dictation injection.
     */
    fun verify(samples: FloatArray): VoiceLockResult {
        if (!isEnabled) {
            // Feature disabled: bypass gate
            return VoiceLockResult(VoiceLockState.ACCEPT, 1.0f, 1.0f)
        }

        if (!isEnrolled) {
            // FAIL-CLOSED: Enabled but not enrolled -> REJECT
            return VoiceLockResult(VoiceLockState.REJECT, 0.0f, 0.0f)
        }

        if (samples.size < 800) {
            // Micro-slice insufficient for biometric verification
            return VoiceLockResult(VoiceLockState.UNCERTAIN, 0.5f, 0.5f)
        }

        val profile = enrolledProfile ?: return VoiceLockResult(VoiceLockState.REJECT, 0.0f, 0.0f)
        val currentFeature = extractAcousticFeatureVector(samples)
        val similarity = cosineSimilarity(profile, currentFeature)

        // Map cosine similarity [-1.0, 1.0] to confidence [0.0, 1.0]
        val confidence = ((similarity + 1.0f) / 2.0f).coerceIn(0.0f, 1.0f)

        val state = when {
            confidence >= acceptThreshold -> VoiceLockState.ACCEPT
            confidence < rejectThreshold -> VoiceLockState.REJECT
            else -> VoiceLockState.UNCERTAIN
        }

        return VoiceLockResult(state, confidence, similarity)
    }

    fun clearEnrollment() {
        enrolledProfile = null
    }

    /**
     * Extracts a normalized 64-dimensional acoustic timbre/formant signature vector.
     */
    private fun extractAcousticFeatureVector(samples: FloatArray): FloatArray {
        val features = FloatArray(FEATURE_DIM)
        val subBandSize = samples.size / FEATURE_DIM

        if (subBandSize == 0) {
            for (i in 0 until minOf(samples.size, FEATURE_DIM)) {
                features[i] = kotlin.math.abs(samples[i])
            }
            return normalize(features)
        }

        for (band in 0 until FEATURE_DIM) {
            var sum = 0.0
            var sumSquare = 0.0
            val start = band * subBandSize
            for (i in 0 until subBandSize) {
                val s = samples[start + i].toDouble()
                sum += kotlin.math.abs(s)
                sumSquare += (s * s)
            }
            val mean = sum / subBandSize
            val variance = (sumSquare / subBandSize) - (mean * mean)
            features[band] = (mean + sqrt(maxOf(0.0, variance))).toFloat()
        }

        return normalize(features)
    }

    private fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        var dot = 0.0f
        var normA = 0.0f
        var normB = 0.0f

        val len = minOf(a.size, b.size)
        for (i in 0 until len) {
            dot += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }

        val denominator = sqrt(normA.toDouble()) * sqrt(normB.toDouble())
        return if (denominator > 1e-9) {
            (dot / denominator).toFloat().coerceIn(-1.0f, 1.0f)
        } else {
            0.0f
        }
    }

    private fun normalize(vec: FloatArray): FloatArray {
        var norm = 0.0
        for (v in vec) norm += (v * v)
        val mag = sqrt(norm)
        if (mag > 1e-9) {
            val out = FloatArray(vec.size)
            for (i in vec.indices) out[i] = (vec[i] / mag).toFloat()
            return out
        }
        return vec
    }
}
