package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.benchmark.AccuracyEvaluator
import com.autoris.asrbenchmark.benchmark.MedicalTestSet
import com.autoris.asrbenchmark.normalizer.MedicalTextNormalizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AccuracyEvaluatorTest {

    @Test
    fun testWordErrorRate() {
        val ref = "dày không đều thành hang môn vị dạ dày"
        val hypMatch = "dày không đều thành hang môn vị dạ dày"
        val hypError = "dày không đều thành hai môn vị dạ dày"

        val werMatch = AccuracyEvaluator.computeWer(AccuracyEvaluator.cleanText(ref), AccuracyEvaluator.cleanText(hypMatch))
        assertEquals(0.0f, werMatch, 0.001f)

        val werError = AccuracyEvaluator.computeWer(AccuracyEvaluator.cleanText(ref), AccuracyEvaluator.cleanText(hypError))
        // 1 error out of 9 words = 1/9 = 0.1111f
        assertEquals(1.0f / 9.0f, werError, 0.001f)
    }

    @Test
    fun testCharacterErrorRate() {
        val ref = "gan không to bờ đều"
        val hyp = "gan không to bờ đều"
        val cer = AccuracyEvaluator.computeCer(ref, hyp)
        assertEquals(0.0f, cer, 0.001f)
    }

    @Test
    fun testMedicalTextNormalizerNumbers() {
        val input1 = "chỗ dày nhất hai mươi mốt milimet gây hẹp"
        val norm1 = MedicalTextNormalizer.process(input1)
        assertTrue(norm1.normalizedSuggestion.contains("21 mm"))

        val input2 = "kích thước hai mươi mốt nhân tám milimet"
        val norm2 = MedicalTextNormalizer.process(input2)
        assertTrue(norm2.normalizedSuggestion.contains("21 × 8 mm") || norm2.normalizedSuggestion.contains("21 x 8 mm") || norm2.normalizedSuggestion.contains("21"))
    }

    @Test
    fun testMedicalTermsDetection() {
        val input = "thận trái có vài nang kích thước lớn nhất hai mươi hai nhân mười sáu milimet"
        val norm = MedicalTextNormalizer.process(input)
        assertTrue(norm.detectedAnatomy.contains("thận") || norm.detectedAnatomy.contains("thận trái"))
        assertTrue(norm.detectedTerms.contains("nang"))
    }

    @Test
    fun testTestSetIntegrity() {
        val sentences = MedicalTestSet.SENTENCES
        assertTrue("Test set must have at least 50 sentences", sentences.size >= 50)
        val categories = MedicalTestSet.getCategories()
        assertTrue("Must contain CT bụng", categories.contains("CT bụng"))
        assertTrue("Must contain CT ngực", categories.contains("CT ngực"))
        assertTrue("Must contain CT sọ não", categories.contains("CT sọ não"))
        assertTrue("Must contain MRI", categories.contains("MRI"))
        assertTrue("Must contain X-quang", categories.contains("X-quang"))
        assertTrue("Must contain Siêu âm", categories.contains("Siêu âm"))
        assertTrue("Must contain Số đo", categories.contains("Số đo"))
        assertTrue("Must contain Vị trí giải phẫu", categories.contains("Vị trí giải phẫu"))
    }

    @Test
    fun testStructuredEntityExtraction() {
        val text = "khối u thận phải kích thước 25 × 18 mm tầng L4-L5 không xâm lấn"
        val dims = AccuracyEvaluator.extractDimensions(text)
        assertEquals(1, dims.size)
        assertEquals(listOf(25.0f, 18.0f), dims[0].dimensions)
        assertEquals("mm", dims[0].unit)

        val spine = AccuracyEvaluator.extractSpineLevels(text)
        assertEquals(1, spine.size)
        assertEquals("L4-L5", spine[0].text)

        val sides = AccuracyEvaluator.extractLaterality(text)
        assertEquals(1, sides.size)
        assertEquals("phải", sides[0].side)
    }

    @Test
    fun testCriticalNegationErrorDetection() {
        val ref = "gan không to, không thấy huyết khối tĩnh mạch cửa"
        val hypDropNegation = "gan to, thấy huyết khối tĩnh mạch cửa" // Fatal omission of "không"!
        val eval = AccuracyEvaluator.evaluate(ref, hypDropNegation)

        assertTrue("Dropping negations must trigger criticalNegationError", eval.criticalNegationError)
        assertTrue(eval.hasCriticalError())
    }

    @Test
    fun testCriticalLateralityErrorDetection() {
        val ref = "nang thận phải kích thước 15 mm"
        val hypFlippedSide = "nang thận trái kích thước 15 mm" // Fatal laterality flip!
        val eval = AccuracyEvaluator.evaluate(ref, hypFlippedSide)

        assertTrue("Flipping left/right must trigger criticalLateralityError", eval.criticalLateralityError)
        assertTrue(eval.hasCriticalError())
    }

    @Test
    fun testCriticalSpineErrorDetection() {
        val ref = "thoát vị đĩa đệm L4-L5 chèn ép rễ"
        val hypWrongLevel = "thoát vị đĩa đệm L5-S1 chèn ép rễ" // Fatal wrong surgical level!
        val eval = AccuracyEvaluator.evaluate(ref, hypWrongLevel)

        assertTrue("Mutating spine level must trigger criticalSpineError", eval.criticalSpineError)
        assertTrue(eval.hasCriticalError())
    }

    @Test
    fun testCriticalMeasurementErrorDetection() {
        val ref = "nốt đặc phổi phải kích thước 8 × 6 mm"
        val hypWrongSize = "nốt đặc phổi phải kích thước 18 × 16 mm" // Fatal dimension mutation!
        val eval = AccuracyEvaluator.evaluate(ref, hypWrongSize)

        assertTrue("Mutating lesion size must trigger criticalMeasurementError", eval.criticalMeasurementError)
        assertTrue(eval.hasCriticalError())
    }

    @Test
    fun testExactNumberMatchingDoesNotMatchSubstrings() {
        val testSentence = com.autoris.asrbenchmark.benchmark.MedicalTestSentence(
            id = "TEST_01",
            category = "Số đo",
            referenceText = "kích thước hai mươi mốt milimet",
            keyNumbers = listOf("21"),
            keyTerms = listOf("kích thước")
        )

        // Substring trap: "121" contains "21", but exact token match must NOT match
        val hypSubstringTrap = "kích thước 121 mm"
        val eval = AccuracyEvaluator.evaluate(testSentence.referenceText, hypSubstringTrap, testSentence)

        assertTrue("Number 21 must NOT match 121", eval.criticalNumericError)
        assertTrue(eval.missedNumbers.contains("21"))
        assertTrue(eval.failureModes.contains(com.autoris.asrbenchmark.benchmark.FailureMode.NUMBER_MISMATCH))
    }

    @Test
    fun testUnitMismatchFailureMode() {
        val ref = "nang thận kích thước 21 × 8 mm"
        val hypWrongUnit = "nang thận kích thước 21 × 8 cm" // Fatal unit change mm -> cm!
        val eval = AccuracyEvaluator.evaluate(ref, hypWrongUnit)

        assertTrue("Unit mismatch must trigger criticalMeasurementError", eval.criticalMeasurementError)
        assertTrue(eval.failureModes.contains(com.autoris.asrbenchmark.benchmark.FailureMode.UNIT_MISMATCH))
    }

    @Test
    fun testDimensionValueMismatchFailureMode() {
        val ref = "nang thận kích thước 21 × 8 mm"
        val hypWrongVal = "nang thận kích thước 121 × 8 mm"
        val eval = AccuracyEvaluator.evaluate(ref, hypWrongVal)

        assertTrue("Dimension value mismatch must trigger criticalMeasurementError", eval.criticalMeasurementError)
        assertTrue(eval.failureModes.contains(com.autoris.asrbenchmark.benchmark.FailureMode.DIMENSION_MISMATCH))
    }
}
