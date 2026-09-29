package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.audio.VoiceLockResult
import com.autoris.asrbenchmark.audio.VoiceLockState
import com.autoris.asrbenchmark.benchmark.EvaluationReport
import com.autoris.asrbenchmark.safety.AcousticQuality
import com.autoris.asrbenchmark.safety.AcousticQualityLevel
import com.autoris.asrbenchmark.safety.EvidenceStatus
import com.autoris.asrbenchmark.safety.ParserStatus
import com.autoris.asrbenchmark.safety.SafetyEvidence
import com.autoris.asrbenchmark.safety.SafetyGate
import com.autoris.asrbenchmark.safety.SafetyGateStatus
import com.autoris.asrbenchmark.safety.SpeakerState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SafetyGateTest {

    private lateinit var gate: SafetyGate

    @Before
    fun setUp() {
        gate = SafetyGate()
    }

    private fun createBenchmarkReport(
        cer: Float = 0.01f,
        wer: Float = 0.02f,
        criticalNumeric: Boolean = false,
        criticalMeasurement: Boolean = false,
        criticalNegation: Boolean = false,
        criticalLaterality: Boolean = false,
        criticalSpine: Boolean = false
    ): EvaluationReport {
        return EvaluationReport(
            referenceText = "Dày thành 21 mm",
            hypothesisText = "Dày thành 21 mm",
            cer = cer,
            wer = wer,
            medicalTermAccuracy = 1.0f,
            numericAccuracy = if (criticalNumeric) 0.0f else 1.0f,
            anatomyAccuracy = 1.0f,
            negationAccuracy = if (criticalNegation) 0.0f else 1.0f,
            matchedTerms = listOf("dày thành"),
            missedTerms = emptyList(),
            matchedNumbers = listOf("21"),
            missedNumbers = emptyList(),
            diffTokens = emptyList(),
            criticalNumericError = criticalNumeric,
            criticalMeasurementError = criticalMeasurement,
            criticalNegationError = criticalNegation,
            criticalLateralityError = criticalLaterality,
            criticalSpineError = criticalSpine
        )
    }

    // =========================================================================
    // PRODUCTION SAFETY TESTS (No reference text, strictly evidence-based)
    // =========================================================================

    @Test
    fun testProductionPristineEvidenceIsSafeToAutofill() {
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.ACCEPTED,
            transcriptConfidence = 0.95f,
            acousticQuality = AcousticQuality(level = AcousticQualityLevel.OPTIMAL, snrDb = 25.0f),
            parserStatus = ParserStatus.CONFIRMED_CLEAN,
            criticalEntitiesStatus = EvidenceStatus.VALID,
            unresolvedAmbiguities = emptyList(),
            criticalErrors = emptyList()
        )

        val decision = gate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.SAFE_TO_AUTOFILL, decision.status)
        assertTrue(decision.autofillAllowed)
        assertEquals(0, decision.criticalErrorCount)
    }

    @Test
    fun testProductionFailClosedOnMissingCriticalEntityValidation() {
        // EvidenceStatus.UNKNOWN must FAIL-CLOSED (cannot autofill without positive verification)
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.ACCEPTED,
            transcriptConfidence = 0.95f,
            acousticQuality = AcousticQuality(level = AcousticQualityLevel.OPTIMAL),
            parserStatus = ParserStatus.CONFIRMED_CLEAN,
            criticalEntitiesStatus = EvidenceStatus.UNKNOWN // Unknown!
        )

        val decision = gate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Missing Required Evidence") })
    }

    @Test
    fun testProductionRejectsUnauthorizedSpeaker() {
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.REJECTED,
            transcriptConfidence = 0.95f,
            criticalEntitiesStatus = EvidenceStatus.VALID
        )

        val decision = gate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Voice Lock") })
    }

    @Test
    fun testProductionRejectsAudioClipping() {
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.ACCEPTED,
            transcriptConfidence = 0.95f,
            acousticQuality = AcousticQuality(clippingDetected = true),
            criticalEntitiesStatus = EvidenceStatus.VALID
        )

        val decision = gate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Clipping detected") })
    }

    @Test
    fun testProductionRequiresReviewWhenConfidenceMissing() {
        // Missing confidence (null) MUST NOT default to 1.0f!
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.ACCEPTED,
            transcriptConfidence = null, // Unknown confidence!
            acousticQuality = AcousticQuality(level = AcousticQualityLevel.OPTIMAL),
            parserStatus = ParserStatus.CONFIRMED_CLEAN,
            criticalEntitiesStatus = EvidenceStatus.VALID
        )

        val decision = gate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.REVIEW_REQUIRED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("ASR Confidence UNKNOWN") })
    }

    @Test
    fun testProductionRequiresReviewWhenSpeakerUnenrolled() {
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.NOT_ENROLLED,
            transcriptConfidence = 0.95f,
            acousticQuality = AcousticQuality(level = AcousticQualityLevel.OPTIMAL),
            parserStatus = ParserStatus.CONFIRMED_CLEAN,
            criticalEntitiesStatus = EvidenceStatus.VALID
        )

        val decision = gate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.REVIEW_REQUIRED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Speaker Not Enrolled") })
    }

    @Test
    fun testProductionRequiresReviewWhenAmbiguityExists() {
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.ACCEPTED,
            transcriptConfidence = 0.95f,
            acousticQuality = AcousticQuality(level = AcousticQualityLevel.OPTIMAL),
            parserStatus = ParserStatus.HAS_AMBIGUITY,
            criticalEntitiesStatus = EvidenceStatus.VALID,
            unresolvedAmbiguities = listOf("Number 21 without explicit unit (inferred mm)")
        )

        val decision = gate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.REVIEW_REQUIRED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Unresolved Ambiguity") })
    }

    // =========================================================================
    // BENCHMARK SAFETY TESTS (Ground-truth reference comparison)
    // =========================================================================

    @Test
    fun testBenchmarkFailClosedOnNullReport() {
        // In benchmark mode, null report must FAIL-CLOSED
        val decision = gate.evaluateBenchmark(report = null)
        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Missing EvaluationReport") })
    }

    @Test
    fun testBenchmarkPristineReportIsSafeToAutofill() {
        val report = createBenchmarkReport(cer = 0.01f)
        val decision = gate.evaluateBenchmark(report = report)

        assertEquals(SafetyGateStatus.SAFE_TO_AUTOFILL, decision.status)
        assertTrue(decision.autofillAllowed)
        assertEquals(0, decision.criticalErrorCount)
    }

    @Test
    fun testBenchmarkNumericCriticalErrorBlocksAutofill() {
        val report = createBenchmarkReport(criticalNumeric = true)
        val decision = gate.evaluateBenchmark(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.criticalErrorCount > 0)
        assertTrue(decision.reasons.any { it.contains("Numerical dimension/value mismatch") })
    }

    @Test
    fun testBenchmarkNegationCriticalErrorBlocksAutofill() {
        val report = createBenchmarkReport(criticalNegation = true)
        val decision = gate.evaluateBenchmark(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Negation inverted") })
    }

    @Test
    fun testBenchmarkLateralityCriticalErrorBlocksAutofill() {
        val report = createBenchmarkReport(criticalLaterality = true)
        val decision = gate.evaluateBenchmark(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("laterality reversed") })
    }

    @Test
    fun testBenchmarkSpineCriticalErrorBlocksAutofill() {
        val report = createBenchmarkReport(criticalSpine = true)
        val decision = gate.evaluateBenchmark(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Spine vertebral level mismatch") })
    }

    @Test
    fun testBenchmarkModerateCerRequiresReview() {
        val report = createBenchmarkReport(cer = 0.05f) // 5% CER
        val decision = gate.evaluateBenchmark(report = report)

        assertEquals(SafetyGateStatus.REVIEW_REQUIRED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertEquals(0, decision.criticalErrorCount)
    }

    @Test
    fun testBenchmarkExcessiveCerRejectsReport() {
        val report = createBenchmarkReport(cer = 0.12f) // 12% CER > 8% maxCerReviewRequired
        val decision = gate.evaluateBenchmark(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Excessive Character Error Rate") })
    }

    @Test
    fun testLegacyEvaluateFailClosedOnNullReport() {
        // Proves legacy bridge no longer fails open
        val decision = gate.evaluate(report = null)
        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
    }
}
