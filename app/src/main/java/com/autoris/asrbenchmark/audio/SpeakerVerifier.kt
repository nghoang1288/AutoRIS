package com.autoris.asrbenchmark.audio

/**
 * Result of audio quality evaluation during speaker enrollment.
 */
data class EnrollmentQualityResult(
    val isValid: Boolean,
    val totalDurationSec: Float,
    val segmentCount: Int,
    val averageSnrDb: Float,
    val rejectionReason: String? = null
)

/**
 * Speaker Verification interface.
 * Provides on-device biometric speaker verification to isolate the primary radiologist
 * from background interlopers, technologists, or intercom voices.
 * All implementations MUST be strictly fail-closed.
 */
interface SpeakerVerifier {
    val name: String
    val isEnrolled: Boolean
    val enrolledSegmentCount: Int

    /**
     * Enrolls the primary speaker using multiple spoken segments (typically 3-5 utterances, 10-20s).
     * Enforces quality checks (clipping, duration, SNR, silence).
     */
    fun enroll(utterances: List<FloatArray>, sampleRate: Int = 16000): EnrollmentQualityResult

    /**
     * Verifies whether the incoming speech segment belongs to the enrolled primary radiologist.
     * MUST fail-closed: if not enrolled, returns REJECT with 0.0 confidence.
     */
    fun verify(samples: FloatArray, sampleRate: Int = 16000): VoiceLockResult

    /**
     * Resets transient verification state.
     */
    fun reset()

    /**
     * Clears all enrolled speaker templates.
     */
    fun clearEnrollment()

    /**
     * Releases any allocated native resources or neural sessions.
     */
    fun release()
}
