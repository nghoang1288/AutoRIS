package com.autoris.asrbenchmark.noise

import com.autoris.asrbenchmark.audio.PreprocessingProfile

/**
 * Result of policy engine acoustic evaluation.
 */
data class PolicyDecision(
    val activeProfile: PreprocessingProfile,
    val recommendedProfile: PreprocessingProfile,
    val confidence: Float,
    val reason: String,
    val isOverride: Boolean
)

/**
 * Automated Noise Policy Engine.
 * Dynamically selects the optimal audio preprocessing profile based on real-time acoustic telemetry,
 * SNR, speaker distance, and clipping indicators.
 * Implements hysteresis debounce to prevent ping-pong oscillation across threshold boundaries.
 */
class NoisePolicyEngine(
    val hysteresisCount: Int = 3,
    val snrQuietThreshold: Float = 25.0f,
    val snrModerateThreshold: Float = 15.0f,
    val snrLowThreshold: Float = 5.0f,
    val noiseFloorQuietDb: Float = -48.0f,
    val noiseFloorModerateDb: Float = -40.0f,
    val noiseFloorHighDb: Float = -32.0f,
    val distanceFarThresholdCm: Int = 35
) {
    private var currentActiveProfile: PreprocessingProfile = PreprocessingProfile.RAW
    private var manualOverrideProfile: PreprocessingProfile? = null
    private var pendingRecommendation: PreprocessingProfile? = null
    private var consecutivePendingCount: Int = 0

    /**
     * Evaluates acoustic telemetry and updates active profile if hysteresis condition is met.
     */
    fun evaluate(
        noiseProfile: NoiseProfile,
        speakerDistanceCm: Int = 30,
        clippingOccurred: Boolean = false
    ): PolicyDecision {
        val (recommended, reason, confidence) = determineOptimalProfile(
            noiseFloorDb = noiseProfile.noiseFloorDb,
            snrDb = noiseProfile.snrDb,
            distanceCm = speakerDistanceCm,
            clipping = clippingOccurred
        )

        // If doctor has frozen/overridden profile manually
        if (manualOverrideProfile != null) {
            return PolicyDecision(
                activeProfile = manualOverrideProfile!!,
                recommendedProfile = recommended,
                confidence = 1.0f,
                reason = "Manual override by user: ${manualOverrideProfile!!.displayName} (Engine recommends: ${recommended.displayName})",
                isOverride = true
            )
        }

        // Hysteresis logic
        if (recommended == currentActiveProfile) {
            pendingRecommendation = null
            consecutivePendingCount = 0
        } else {
            if (recommended == pendingRecommendation) {
                consecutivePendingCount++
                if (consecutivePendingCount >= hysteresisCount) {
                    currentActiveProfile = recommended
                    pendingRecommendation = null
                    consecutivePendingCount = 0
                }
            } else {
                pendingRecommendation = recommended
                consecutivePendingCount = 1
            }
        }

        return PolicyDecision(
            activeProfile = currentActiveProfile,
            recommendedProfile = recommended,
            confidence = confidence,
            reason = reason,
            isOverride = false
        )
    }

    /**
     * Core deterministic rule matrix for acoustic profile selection.
     */
    fun determineOptimalProfile(
        noiseFloorDb: Float,
        snrDb: Float,
        distanceCm: Int,
        clipping: Boolean
    ): Triple<PreprocessingProfile, String, Float> {
        return when {
            clipping || noiseFloorDb >= noiseFloorHighDb || (snrDb <= snrLowThreshold && noiseFloorDb >= -38.0f) -> {
                Triple(
                    PreprocessingProfile.ANDROID_NS_DPDFNET,
                    "Extreme clinical noise / alarms detected (Floor: ${noiseFloorDb.toInt()} dB, SNR: ${snrDb.toInt()} dB)",
                    0.95f
                )
            }
            noiseFloorDb >= noiseFloorModerateDb || snrDb < snrModerateThreshold -> {
                Triple(
                    PreprocessingProfile.DPDFNET,
                    "High acoustic interference (MRI chiller / CT gantry / low SNR ${snrDb.toInt()} dB)",
                    0.90f
                )
            }
            distanceCm > distanceFarThresholdCm -> {
                Triple(
                    PreprocessingProfile.ANDROID_NS_AGC,
                    "Speaker distance (${distanceCm} cm > ${distanceFarThresholdCm} cm) requires Hardware NS + AGC compensation",
                    0.85f
                )
            }
            noiseFloorDb >= noiseFloorQuietDb || snrDb < snrQuietThreshold -> {
                Triple(
                    PreprocessingProfile.ANDROID_NS,
                    "Moderate stationary room noise (Floor: ${noiseFloorDb.toInt()} dB, SNR: ${snrDb.toInt()} dB)",
                    0.88f
                )
            }
            else -> {
                Triple(
                    PreprocessingProfile.RAW,
                    "Clean acoustic environment (Floor: ${noiseFloorDb.toInt()} dB, SNR: ${snrDb.toInt()} dB) - zero distortion",
                    0.98f
                )
            }
        }
    }

    fun setManualOverride(profile: PreprocessingProfile?) {
        manualOverrideProfile = profile
        if (profile != null) {
            currentActiveProfile = profile
            pendingRecommendation = null
            consecutivePendingCount = 0
        }
    }

    fun clearOverride() {
        manualOverrideProfile = null
    }

    fun getActiveProfile(): PreprocessingProfile = manualOverrideProfile ?: currentActiveProfile

    fun isOverrideActive(): Boolean = manualOverrideProfile != null

    fun reset(initialProfile: PreprocessingProfile = PreprocessingProfile.RAW) {
        currentActiveProfile = initialProfile
        manualOverrideProfile = null
        pendingRecommendation = null
        consecutivePendingCount = 0
    }
}
