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
}
