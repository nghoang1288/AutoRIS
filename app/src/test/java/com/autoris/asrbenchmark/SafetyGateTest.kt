package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.audio.VoiceLockResult
import com.autoris.asrbenchmark.audio.VoiceLockState
import com.autoris.asrbenchmark.benchmark.EvaluationReport
import com.autoris.asrbenchmark.noise.NoiseProfile
import com.autoris.asrbenchmark.safety.SafetyGate
import com.autoris.asrbenchmark.safety.SafetyGateStatus
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

    private fun createReport(
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

    @Test
    fun testPristineReportIsSafeToAutofill() {
        val report = createReport(cer = 0.01f)
        val decision = gate.evaluate(report = report, asrConfidence = 0.95f)

        assertEquals(SafetyGateStatus.SAFE_TO_AUTOFILL, decision.status)
        assertTrue(decision.autofillAllowed)
        assertEquals(0, decision.criticalErrorCount)
        assertTrue(decision.safetyScore >= 0.90f)
    }

    @Test
    fun testNumericCriticalErrorBlocksAutofill() {
        val report = createReport(criticalNumeric = true)
        val decision = gate.evaluate(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.criticalErrorCount > 0)
        assertTrue(decision.reasons.any { it.contains("Numerical dimension/value mismatch") })
    }

    @Test
    fun testNegationCriticalErrorBlocksAutofill() {
        val report = createReport(criticalNegation = true)
        val decision = gate.evaluate(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Negation inverted") })
    }

    @Test
    fun testLateralityCriticalErrorBlocksAutofill() {
        val report = createReport(criticalLaterality = true)
        val decision = gate.evaluate(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("laterality reversed") })
    }

    @Test
    fun testSpineCriticalErrorBlocksAutofill() {
        val report = createReport(criticalSpine = true)
        val decision = gate.evaluate(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Spine vertebral level mismatch") })
    }

    @Test
    fun testVoiceLockRejectionBlocksAutofill() {
        val report = createReport(cer = 0.01f)
        val rejectedVoice = VoiceLockResult(
            state = VoiceLockState.REJECT,
            confidence = 0.90f,
            similarity = 0.25f
        )
        val decision = gate.evaluate(report = report, voiceLockResult = rejectedVoice)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Speaker rejected") })
    }

    @Test
    fun testModerateCerRequiresReview() {
        val report = createReport(cer = 0.05f) // 5% CER
        val decision = gate.evaluate(report = report)

        assertEquals(SafetyGateStatus.REVIEW_REQUIRED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertEquals(0, decision.criticalErrorCount)
    }

    @Test
    fun testHighNoiseRequiresReview() {
        val report = createReport(cer = 0.02f)
        val noisyProfile = NoiseProfile(noiseFloorDb = -32.0f, snrDb = 8.0f)
        val decision = gate.evaluate(report = report, noiseProfile = noisyProfile)

        assertEquals(SafetyGateStatus.REVIEW_REQUIRED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("ambient noise floor") })
    }

    @Test
    fun testExcessiveCerRejectsReport() {
        val report = createReport(cer = 0.12f) // 12% CER > 8% maxCerReviewRequired
        val decision = gate.evaluate(report = report)

        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
        assertTrue(decision.reasons.any { it.contains("Excessive Character Error Rate") })
    }
}
