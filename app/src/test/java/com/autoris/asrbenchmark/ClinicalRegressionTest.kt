package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.benchmark.AccuracyEvaluator
import com.autoris.asrbenchmark.benchmark.FailureMode
import com.autoris.asrbenchmark.normalizer.CertaintyLevel
import com.autoris.asrbenchmark.normalizer.LateralityType
import com.autoris.asrbenchmark.normalizer.MedicalTextNormalizer
import com.autoris.asrbenchmark.safety.*
import org.junit.Assert.*
import org.junit.Test

class ClinicalRegressionTest {

    private val safetyGate = SafetyGate()

    @Test
    fun testHistoricalCase1_StomachWallMeasurement() {
        val raw = "DÀY THÀNH KHÔNG ĐỀU HANG MÔN VỊ DẠ DÀY CHỖ DÀY NHẤT HAI MỐT MM GÂY HẸP LÒNG MÔN VỊ"
        val norm = MedicalTextNormalizer.process(raw)

        // 1. Verify phonetic numeric conversion: "hai mốt mm" -> "21 mm"
        assertTrue(norm.normalizedSuggestion.contains("21 mm"))
        assertEquals(1, norm.measurements.size)
        assertEquals(21.0f, norm.measurements[0].value ?: 0f, 0.01f)
        assertEquals("mm", norm.measurements[0].unit)
        assertEquals(CertaintyLevel.EXPLICIT, norm.measurements[0].certainty)

        // 2. Production safety evaluation with clean evidence
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.ACCEPTED,
            transcriptConfidence = 0.98f,
            acousticQuality = AcousticQuality(level = AcousticQualityLevel.OPTIMAL, snrDb = 25.0f, noiseFloorDb = -50.0f),
            parserStatus = ParserStatus.CONFIRMED_CLEAN,
            criticalEntitiesStatus = EvidenceStatus.VALID
        )
        val decision = safetyGate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.SAFE_TO_AUTOFILL, decision.status)
        assertTrue(decision.autofillAllowed)
    }

    @Test
    fun testHistoricalCase2_LymphNode2DMeasurement() {
        val raw = "hạch lớn nhất kích thước hai mươi mốt nhân tám milimet bờ không đều"
        val norm = MedicalTextNormalizer.process(raw)

        assertTrue(norm.normalizedSuggestion.contains("21 × 8 mm") || norm.normalizedSuggestion.contains("21 x 8 mm"))
        assertEquals(1, norm.dimensions.size)
        val dim = norm.dimensions[0]
        assertEquals(listOf(21.0f, 8.0f), dim.dims)
        assertEquals("mm", dim.unit)
        assertEquals(CertaintyLevel.EXPLICIT, dim.certainty)
    }

    @Test
    fun testHistoricalCase3_LiverLateralityAndNegation() {
        val raw = "gan không to bờ đều nhu mô gan trái có nang chín mm"
        val norm = MedicalTextNormalizer.process(raw)

        // Verify laterality
        assertEquals(1, norm.lateralities.size)
        assertEquals(LateralityType.LEFT, norm.lateralities[0].side)
        assertFalse(norm.lateralities[0].isContradictory)

        // Verify negation
        assertTrue(norm.negations.any { it.trigger == "không to" || it.scopeText.contains("to") })
    }

    @Test
    fun testHistoricalCase4_SpineAndLateralityProtection() {
        val raw = "thoát vị đĩa đệm L4-L5 chèn ép rễ bên phải"
        val norm = MedicalTextNormalizer.process(raw)

        assertEquals(1, norm.spineLevels.size)
        assertEquals("L4-L5", norm.spineLevels[0].normalized)

        assertEquals(1, norm.lateralities.size)
        assertEquals(LateralityType.RIGHT, norm.lateralities[0].side)
    }

    @Test
    fun testSafetyGate_RejectsLateralityContradiction() {
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.ACCEPTED,
            transcriptConfidence = 0.95f,
            acousticQuality = AcousticQuality(level = AcousticQualityLevel.ACCEPTABLE),
            parserStatus = ParserStatus.CONFIRMED_CLEAN,
            criticalEntitiesStatus = EvidenceStatus.INVALID,
            criticalErrors = listOf("Mâu thuẫn định vị bên")
        )
        val decision = safetyGate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.REJECTED, decision.status)
        assertFalse(decision.autofillAllowed)
    }

    @Test
    fun testSafetyGate_ReviewRequiredOnAmbiguousUnitlessNumber() {
        val evidence = SafetyEvidence(
            speakerState = SpeakerState.ACCEPTED,
            transcriptConfidence = 0.95f,
            acousticQuality = AcousticQuality(level = AcousticQualityLevel.OPTIMAL),
            parserStatus = ParserStatus.HAS_AMBIGUITY,
            criticalEntitiesStatus = EvidenceStatus.VALID,
            unresolvedAmbiguities = listOf("Số đo 21 thiếu đơn vị lâm sàng (mm/cm)")
        )
        val decision = safetyGate.evaluateProduction(evidence)
        assertEquals(SafetyGateStatus.REVIEW_REQUIRED, decision.status)
        assertFalse(decision.autofillAllowed)
    }

    @Test
    fun testAccuracyEvaluator_CatchesNegationFlipAndSpineMutation() {
        val ref = "thoát vị đĩa đệm L4-L5 không chèn ép rễ"
        val hypFlip = "thoát vị đĩa đệm L5-S1 chèn ép rễ" // Mutated spine AND omitted negation!

        val eval = AccuracyEvaluator.evaluate(ref, hypFlip)
        assertTrue(eval.criticalSpineError)
        assertTrue(eval.criticalNegationError)
        assertTrue(eval.failureModes.contains(FailureMode.SPINE_LEVEL_MISMATCH))
        assertTrue(eval.failureModes.contains(FailureMode.NEGATION_FLIP))
    }
}
