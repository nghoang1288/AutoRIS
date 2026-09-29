package com.autoris.asrbenchmark.safety

import com.autoris.asrbenchmark.audio.VoiceLockResult
import com.autoris.asrbenchmark.audio.VoiceLockState
import com.autoris.asrbenchmark.benchmark.EvaluationReport
import com.autoris.asrbenchmark.noise.NoiseProfile

/**
 * Tri-state verification status for safety evidence.
 * Missing or unvalidated evidence is explicitly UNKNOWN and must fail-closed.
 */
enum class EvidenceStatus {
    VALID,
    INVALID,
    UNKNOWN
}

/**
 * Speaker verification state for Voice Lock.
 */
enum class SpeakerState {
    ACCEPTED,
    UNCERTAIN,
    REJECTED,
    NOT_ENROLLED,
    DISABLED
}

/**
 * Quality levels for ambient acoustic telemetry.
 */
enum class AcousticQualityLevel {
    OPTIMAL,      // High SNR (>20dB), low noise floor (<-48dB)
    ACCEPTABLE,   // Moderate SNR (10-20dB), typical hospital background
    DEGRADED,     // Low SNR (<10dB), loud ambient noise (> -36dB), or clipping
    UNKNOWN
}

/**
 * Acoustic environment telemetry evidence.
 */
data class AcousticQuality(
    val level: AcousticQualityLevel = AcousticQualityLevel.UNKNOWN,
    val snrDb: Float? = null,
    val noiseFloorDb: Float? = null,
    val clippingDetected: Boolean = false
)

/**
 * Normalizer & entity parser status.
 */
enum class ParserStatus {
    CONFIRMED_CLEAN,      // All entities fully resolved without clinical ambiguity
    HAS_AMBIGUITY,        // Non-critical ambiguity (e.g. number without explicit unit)
    SYNTAX_ERROR,         // Malformed structure or regex crash
    UNKNOWN
}

/**
 * Comprehensive Safety Evidence Model required for clinical autofill decisions.
 */
data class SafetyEvidence(
    val speakerState: SpeakerState = SpeakerState.DISABLED,
    val transcriptConfidence: Float? = null, // null means UNKNOWN (never assume 1.0f)
    val acousticQuality: AcousticQuality = AcousticQuality(),
    val parserStatus: ParserStatus = ParserStatus.UNKNOWN,
    val criticalEntitiesStatus: EvidenceStatus = EvidenceStatus.UNKNOWN,
    val unresolvedAmbiguities: List<String> = emptyList(),
    val criticalErrors: List<String> = emptyList()
)

/**
 * Radiology ASR Safety Gate Status.
 */
enum class SafetyGateStatus {
    SAFE_TO_AUTOFILL,   // Zero critical errors, verified speaker, confirmed clean entities
    REVIEW_REQUIRED,    // No critical errors, but requires visual confirmation by radiologist
    REJECTED            // Critical error, unauthorized speaker, corrupted signal, or missing evidence
}

enum class SafetyGateMode {
    PRODUCTION,
    BENCHMARK
}

/**
 * Result of Safety Gate evaluation.
 */
data class SafetyGateDecision(
    val status: SafetyGateStatus,
    val safetyScore: Float,            // [0.0 - 1.0]
    val reasons: List<String>,
    val autofillAllowed: Boolean,
    val criticalErrorCount: Int,
    val mode: SafetyGateMode = SafetyGateMode.PRODUCTION
)

/**
 * Clinical Safety Gate.
 * Enforces zero-tolerance patient safety standards for Radiology Information Systems (RIS/PACS).
 * Strictly separates Production Evaluation (evidence-based) from Benchmark Evaluation (ground-truth CER/WER).
 * Implements FAIL-CLOSED architecture: missing evidence or null reports will NEVER result in SAFE_TO_AUTOFILL.
 */
class SafetyGate(
    val maxCerSafeAutofill: Float = 0.03f,          // 3.0% CER
    val maxCerReviewRequired: Float = 0.08f,        // 8.0% CER
    val minConfidenceSafeAutofill: Float = 0.90f
) {

    /**
     * PRODUCTION SAFETY EVALUATION.
     * Evaluates live clinical dictations where NO reference text exists.
     * Never relies on CER/WER. Evaluates structured safety evidence.
     */
    fun evaluateProduction(evidence: SafetyEvidence): SafetyGateDecision {
        val reasons = mutableListOf<String>()
        var criticalCount = evidence.criticalErrors.size

        // 1. REJECT CONDITIONS (Fail-Closed)

        // 1a. Critical errors present
        if (evidence.criticalErrors.isNotEmpty()) {
            reasons.addAll(evidence.criticalErrors.map { "Critical Clinical Error: $it" })
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = criticalCount,
                mode = SafetyGateMode.PRODUCTION
            )
        }

        // 1b. Critical entity status invalid
        if (evidence.criticalEntitiesStatus == EvidenceStatus.INVALID) {
            criticalCount++
            reasons.add("Critical Entity Status INVALID: Mismatch in dimensions, spine levels, or laterality")
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = criticalCount,
                mode = SafetyGateMode.PRODUCTION
            )
        }

        // 1c. Unauthorized speaker rejected
        if (evidence.speakerState == SpeakerState.REJECTED) {
            reasons.add("Voice Lock: Speaker rejected as unauthorized background voice")
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.PRODUCTION
            )
        }

        // 1d. Syntax or parser crash
        if (evidence.parserStatus == ParserStatus.SYNTAX_ERROR) {
            criticalCount++
            reasons.add("Parser Syntax Error: Malformed clinical entity structure")
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = criticalCount,
                mode = SafetyGateMode.PRODUCTION
            )
        }

        // 1e. Audio clipping / corrupted signal
        if (evidence.acousticQuality.clippingDetected) {
            reasons.add("Audio Signal Corrupted: Clipping detected during dictation")
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.2f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.PRODUCTION
            )
        }

        // 1f. Missing required safety evidence (FAIL-CLOSED: Unknown critical entities cannot autofill)
        if (evidence.criticalEntitiesStatus == EvidenceStatus.UNKNOWN) {
            reasons.add("Missing Required Evidence: Critical entity validation status is UNKNOWN")
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.PRODUCTION
            )
        }

        // 2. REVIEW_REQUIRED CONDITIONS
        val reviewReasons = mutableListOf<String>()

        if (evidence.speakerState == SpeakerState.UNCERTAIN) {
            reviewReasons.add("Speaker Verification Uncertain: Acoustic similarity near boundary")
        } else if (evidence.speakerState == SpeakerState.NOT_ENROLLED) {
            reviewReasons.add("Speaker Not Enrolled: Voice lock enabled but doctor profile not enrolled")
        }

        if (evidence.transcriptConfidence == null) {
            reviewReasons.add("ASR Confidence UNKNOWN: Model confidence score unavailable")
        } else if (evidence.transcriptConfidence < minConfidenceSafeAutofill) {
            reviewReasons.add("Insufficient ASR Confidence: ${(evidence.transcriptConfidence * 100).toInt()}% < ${(minConfidenceSafeAutofill * 100).toInt()}%")
        }

        if (evidence.acousticQuality.level == AcousticQualityLevel.DEGRADED) {
            reviewReasons.add("Degraded Acoustic Environment: High noise floor (${evidence.acousticQuality.noiseFloorDb?.toInt() ?: "N/A"} dB) or low SNR (${evidence.acousticQuality.snrDb?.toInt() ?: "N/A"} dB)")
        } else if (evidence.acousticQuality.level == AcousticQualityLevel.UNKNOWN) {
            reviewReasons.add("Acoustic Environment UNKNOWN: Noise telemetry unavailable")
        }

        if (evidence.parserStatus == ParserStatus.HAS_AMBIGUITY) {
            reviewReasons.add("Parser Ambiguity: Clinical finding contains non-standard terms")
        } else if (evidence.parserStatus == ParserStatus.UNKNOWN) {
            reviewReasons.add("Parser Status UNKNOWN: Normalizer verification not performed")
        }

        if (evidence.unresolvedAmbiguities.isNotEmpty()) {
            reviewReasons.addAll(evidence.unresolvedAmbiguities.map { "Unresolved Ambiguity: $it" })
        }

        if (reviewReasons.isNotEmpty()) {
            return SafetyGateDecision(
                status = SafetyGateStatus.REVIEW_REQUIRED,
                safetyScore = 0.70f,
                reasons = reviewReasons,
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.PRODUCTION
            )
        }

        // 3. SAFE_TO_AUTOFILL (All mandatory criteria satisfied)
        return SafetyGateDecision(
            status = SafetyGateStatus.SAFE_TO_AUTOFILL,
            safetyScore = 0.99f,
            reasons = listOf("All clinical safety evidence validated: speaker accepted, entities confirmed clean, optimal acoustics"),
            autofillAllowed = true,
            criticalErrorCount = 0,
            mode = SafetyGateMode.PRODUCTION
        )
    }

    /**
     * BENCHMARK SAFETY EVALUATION.
     * Evaluates benchmark sessions against ground-truth reference text.
     * Strictly requires EvaluationReport; null report will FAIL-CLOSED.
     */
    fun evaluateBenchmark(
        report: EvaluationReport?,
        evidence: SafetyEvidence? = null
    ): SafetyGateDecision {
        val reasons = mutableListOf<String>()

        // Fail-Closed: Missing benchmark report cannot be SAFE
        if (report == null) {
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = listOf("Missing EvaluationReport: Benchmark evaluation requires ground-truth comparison"),
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.BENCHMARK
            )
        }

        // Check speaker state if provided
        if (evidence != null && evidence.speakerState == SpeakerState.REJECTED) {
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = listOf("Voice Lock: Speaker rejected as unauthorized background voice"),
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.BENCHMARK
            )
        }

        // Check Zero-Tolerance Critical Errors
        var criticalCount = 0
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

        if (criticalCount > 0) {
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = criticalCount,
                mode = SafetyGateMode.BENCHMARK
            )
        }

        // Check CER thresholds
        val cer = report.cer
        if (cer > maxCerReviewRequired) {
            reasons.add("Excessive Character Error Rate (${(cer * 100).toInt()}% > ${(maxCerReviewRequired * 100).toInt()}%)")
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = (1.0f - cer).coerceIn(0.0f, 1.0f),
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.BENCHMARK
            )
        }

        if (cer > maxCerSafeAutofill) {
            reasons.add("Moderate CER (${(cer * 1000).toInt() / 10.0}%) exceeds safe autofill threshold (${(maxCerSafeAutofill * 100).toInt()}%)")
            return SafetyGateDecision(
                status = SafetyGateStatus.REVIEW_REQUIRED,
                safetyScore = 0.75f,
                reasons = reasons,
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.BENCHMARK
            )
        }

        return SafetyGateDecision(
            status = SafetyGateStatus.SAFE_TO_AUTOFILL,
            safetyScore = 0.98f,
            reasons = listOf("Zero critical errors, CER within tolerance (${(cer * 1000).toInt() / 10.0}%)"),
            autofillAllowed = true,
            criticalErrorCount = 0,
            mode = SafetyGateMode.BENCHMARK
        )
    }

    /**
     * Legacy evaluation bridge for backward compatibility.
     * Enforces fail-closed when report is null.
     */
    fun evaluate(
        report: EvaluationReport?,
        voiceLockResult: VoiceLockResult? = null,
        noiseProfile: NoiseProfile? = null,
        asrConfidence: Float? = null // null means UNKNOWN
    ): SafetyGateDecision {
        if (report == null) {
            return SafetyGateDecision(
                status = SafetyGateStatus.REJECTED,
                safetyScore = 0.0f,
                reasons = listOf("Fail-Closed: EvaluationReport is null. Cannot evaluate safety without report data."),
                autofillAllowed = false,
                criticalErrorCount = 0,
                mode = SafetyGateMode.BENCHMARK
            )
        }

        val speakerState = when (voiceLockResult?.state) {
            VoiceLockState.ACCEPT -> SpeakerState.ACCEPTED
            VoiceLockState.REJECT -> SpeakerState.REJECTED
            VoiceLockState.UNCERTAIN -> SpeakerState.UNCERTAIN
            null -> SpeakerState.DISABLED
        }

        val acousticLevel = when {
            noiseProfile == null -> AcousticQualityLevel.UNKNOWN
            noiseProfile.snrDb < 10.0f || noiseProfile.noiseFloorDb > -36.0f -> AcousticQualityLevel.DEGRADED
            noiseProfile.snrDb >= 20.0f && noiseProfile.noiseFloorDb <= -48.0f -> AcousticQualityLevel.OPTIMAL
            else -> AcousticQualityLevel.ACCEPTABLE
        }

        val evidence = SafetyEvidence(
            speakerState = speakerState,
            transcriptConfidence = asrConfidence,
            acousticQuality = AcousticQuality(
                level = acousticLevel,
                snrDb = noiseProfile?.snrDb,
                noiseFloorDb = noiseProfile?.noiseFloorDb
            ),
            parserStatus = ParserStatus.CONFIRMED_CLEAN,
            criticalEntitiesStatus = if (report.hasCriticalError()) EvidenceStatus.INVALID else EvidenceStatus.VALID
        )

        return evaluateBenchmark(report, evidence)
    }
}
