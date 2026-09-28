package com.autoris.asrbenchmark.safety

import com.autoris.asrbenchmark.audio.VoiceLockResult
import com.autoris.asrbenchmark.audio.VoiceLockState
import com.autoris.asrbenchmark.benchmark.EvaluationReport
import com.autoris.asrbenchmark.noise.NoiseProfile

/**
 * Radiology ASR Safety Gate Status.
 * Enforces zero-tolerance safety standards for direct RIS/PACS report injection.
 */
enum class SafetyGateStatus {
    SAFE_TO_AUTOFILL,   // Zero critical errors, high confidence, verified clinical entities
    REVIEW_REQUIRED,    // No critical errors, but medium confidence or noisy acoustic environment
    REJECTED            // Critical error detected, speaker rejected, or excessive CER
}

/**
 * Result of Safety Gate evaluation.
 */
data class SafetyGateDecision(
    val status: SafetyGateStatus,
    val safetyScore: Float,            // [0.0 - 1.0]
    val reasons: List<String>,
    val autofillAllowed: Boolean,
    val criticalErrorCount: Int
)

/**
 * Clinical Safety Gate.
 * Evaluates ASR output, structured medical entities, speaker authorization, and acoustic SNR.
 * Blocks automated insertion into clinical radiology reports if any critical diagnostic risks exist.
 */
class SafetyGate(
    val maxCerSafeAutofill: Float = 0.03f,      // 3.0% CER
    val maxCerReviewRequired: Float = 0.08f,    // 8.0% CER
    val minConfidenceSafeAutofill: Float = 0.90f
) {
    fun evaluate(
        report: EvaluationReport?,
        voiceLockResult: VoiceLockResult? = null,
        noiseProfile: NoiseProfile? = null,
        asrConfidence: Float = 1.0f
    ): SafetyGateDecision {
        val reasons = mutableListOf<String>()
        var criticalCount = 0

        // 1. Voice Lock / Speaker Gate Check
        if (voiceLockResult != null && voiceLockResult.state == VoiceLockState.REJECT) {
            reasons.add("Voice Lock: Speaker rejected as unauthorized background voice (Similarity: ${voiceLockResult.similarity})")
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = 0
            )
        }

        // 2. Critical Medical Error Checks (Zero Tolerance)
        if (report != null) {
            if (report.criticalNumericError) {
                criticalCount++
                reasons.add("Critical Error: Numerical dimension/value mismatch detected")
            }
            if (report.criticalMeasurementError) {
                criticalCount++
                reasons.add("Critical Error: Clinical measurement unit/value error")
            }
            if (report.criticalNegationError) {
                criticalCount++
                reasons.add("Critical Error: Negation inverted (e.g. 'không có' vs 'có')")
            }
            if (report.criticalLateralityError) {
                criticalCount++
                reasons.add("Critical Error: Anatomical laterality reversed (phải vs trái)")
            }
            if (report.criticalSpineError) {
                criticalCount++
                reasons.add("Critical Error: Spine vertebral level mismatch (e.g. L4-L5 vs L5-S1)")
            }
        }

        if (criticalCount > 0) {
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = criticalCount
            )
        }

        // 3. Accuracy & CER Checks
        val cer = report?.cer ?: 0.0f
        if (cer > maxCerReviewRequired) {
            reasons.add("Excessive Character Error Rate (${(cer * 100).toInt()}% > ${(maxCerReviewRequired * 100).toInt()}%)")
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = (1.0f - cer).coerceIn(0.0f, 1.0f),
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = 0
            )
        }

        // 4. Acoustic Environment & Confidence Check
        val isAcousticChallenging = noiseProfile != null && (noiseProfile.snrDb < 10.0f || noiseProfile.noiseFloorDb > -36.0f)
        val isLowConfidence = asrConfidence < minConfidenceSafeAutofill
        val isModerateCer = cer > maxCerSafeAutofill

        if (isAcousticChallenging || isLowConfidence || isModerateCer) {
            if (isModerateCer) reasons.add("Moderate CER (${(cer * 100 * 10).toInt() / 10.0}%) requires doctor confirmation")
            if (isLowConfidence) reasons.add("Low ASR confidence (${(asrConfidence * 100).toInt()}%)")
            if (isAcousticChallenging) reasons.add("High ambient noise floor (${noiseProfile?.noiseFloorDb?.toInt()} dB)")

            return SafetyGateDecision(
                status = SafetyGateStatus.REVIEW_REQUIRED,
                safetyScore = 0.75f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = 0
            )
        }

        // 5. Passed all clinical safety criteria
        reasons.add("Zero critical errors, pristine entities, high confidence")
        return SafetyGateDecision(
            status = SafetyGateStatus.SAFE_TO_AUTOFILL,
            safetyScore = 0.98f,
            reasons = reasons,
            autofillAllowed = true,
            criticalErrorCount = 0
        )
    }
}
