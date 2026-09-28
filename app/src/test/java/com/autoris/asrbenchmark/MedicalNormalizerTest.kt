package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.normalizer.DimensionParser
import com.autoris.asrbenchmark.normalizer.MedicalPhraseNormalizer
import com.autoris.asrbenchmark.normalizer.MedicalTextNormalizer
import com.autoris.asrbenchmark.normalizer.PercentageParser
import com.autoris.asrbenchmark.normalizer.RangeParser
import com.autoris.asrbenchmark.normalizer.SpineLevelParser
import com.autoris.asrbenchmark.normalizer.VietnameseNumberParser
import com.autoris.asrbenchmark.normalizer.VolumeParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MedicalNormalizerTest {

    @Test
    fun testSpineLevelParser() {
        assertEquals("L4-L5", SpineLevelParser.parse("L bốn năm"))
        assertEquals("L4-L5", SpineLevelParser.parse("L bốn L năm"))
        assertEquals("L5-S1", SpineLevelParser.parse("L năm S một"))
        assertEquals("C4-C5", SpineLevelParser.parse("C bốn năm"))
        assertEquals("D12-L1", SpineLevelParser.parse("D mười hai L một"))
        assertEquals("L4-L5", SpineLevelParser.parse("L4 L5"))
        assertEquals("L4-L5", SpineLevelParser.parse("L4/L5"))
        assertEquals("C5", SpineLevelParser.parse("C năm"))
    }

    @Test
    fun testVietnameseNumberParser() {
        assertEquals("21", VietnameseNumberParser.parse("hai mươi mốt"))
        assertEquals("21", VietnameseNumberParser.parse("hai mốt"))
        assertEquals("35", VietnameseNumberParser.parse("ba lăm"))
        assertEquals("125", VietnameseNumberParser.parse("một trăm hai mươi lăm"))
        assertEquals("2.5", VietnameseNumberParser.parse("hai phẩy năm"))
        assertEquals("15.2", VietnameseNumberParser.parse("mười lăm chấm hai"))
        assertEquals("-5", VietnameseNumberParser.parse("âm năm"))
    }

    @Test
    fun testDimensionParser() {
        assertEquals("21 × 8 mm", DimensionParser.parse("21 x 8"))
        assertEquals("21 × 8 mm", DimensionParser.parse("21 nhân 8"))
        assertEquals("15 × 20 mm", DimensionParser.parse("15 x 20 mm"))
        assertEquals("10 × 15 × 20 mm", DimensionParser.parse("10 x 15 x 20"))
        assertEquals("1.5 × 2.3 cm", DimensionParser.parse("1.5 x 2.3 cm"))
    }

    @Test
    fun testRangeParser() {
        assertEquals("5 - 10 mm", RangeParser.parse("từ 5 đến 10 mm"))
        assertEquals("3 - 4 cm", RangeParser.parse("từ 3 đến 4 cm"))
        assertEquals("10 - 15 mm", RangeParser.parse("10-15 mm"))
    }

    @Test
    fun testPercentageParser() {
        assertEquals("70%", PercentageParser.parse("70 phần trăm"))
        assertEquals("hẹp 50%", PercentageParser.parse("hẹp 50 %"))
    }

    @Test
    fun testVolumeParser() {
        assertEquals("25 ml", VolumeParser.parse("25 mi li lít"))
        assertEquals("500 ml", VolumeParser.parse("500 mililit"))
        assertEquals("30 ml", VolumeParser.parse("30 cm khối"))
        assertEquals("1.5 l", VolumeParser.parse("1.5 lít"))
    }

    @Test
    fun testMedicalPhraseNormalizer() {
        val fixed = MedicalPhraseNormalizer.fixPhonetics("cái chiếc nốt kính mờ không gian bờ mà đều clitsung")
        assertTrue(fixed.contains("kích thước"))
        assertTrue(fixed.contains("nốt kính mờ"))
        assertTrue(fixed.contains("không giãn"))
        assertTrue(fixed.contains("bờ đều"))
        assertTrue(fixed.contains("Wirsung"))

        val cleaned = MedicalPhraseNormalizer.cleanTrailingFillers("gan bình thường đó thôi")
        assertEquals("gan bình thường.", cleaned)
    }

    @Test
    fun testFullMedicalPipelineEndToEnd() {
        // Clinical sentence: "dày thành không đều hang môn vị dạ dày kích thước hai mươi mốt nhân tám"
        val raw = "dày thành không đều hang môn vị dạ dày cái chiếc hai mươi mốt nhân tám đó thôi"
        val result = MedicalTextNormalizer.process(raw)

        assertTrue("Normalized text must contain proper anatomy and dimensions", result.normalizedSuggestion.contains("21 × 8 mm"))
        assertTrue("Normalized text must have capitalized first letter", result.normalizedSuggestion.startsWith("Dày"))
        assertTrue("Trailing filler 'đó thôi' must be stripped", !result.normalizedSuggestion.contains("đó thôi"))
        assertTrue("Hang môn vị must be detected in anatomy", result.detectedAnatomy.contains("hang môn vị"))
    }

    @Test
    fun testSpineLevelEndToEndPipeline() {
        val raw = "thoát vị đĩa đệm tầng l bốn năm chèn ép rễ thần kinh"
        val result = MedicalTextNormalizer.process(raw)

        assertTrue("Must normalize L bốn năm to L4-L5 without turning into 45", result.normalizedSuggestion.contains("L4-L5"))
    }
}
