package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.normalizer.CertaintyLevel
import com.autoris.asrbenchmark.normalizer.ClinicalScoreParser
import com.autoris.asrbenchmark.normalizer.DimensionParser
import com.autoris.asrbenchmark.normalizer.LateralityParser
import com.autoris.asrbenchmark.normalizer.LateralityType
import com.autoris.asrbenchmark.normalizer.MedicalPhraseNormalizer
import com.autoris.asrbenchmark.normalizer.MedicalTextNormalizer
import com.autoris.asrbenchmark.normalizer.NegationParser
import com.autoris.asrbenchmark.normalizer.PercentageParser
import com.autoris.asrbenchmark.normalizer.RangeParser
import com.autoris.asrbenchmark.normalizer.SpineLevelParser
import com.autoris.asrbenchmark.normalizer.VietnameseNumberParser
import com.autoris.asrbenchmark.normalizer.VolumeParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        assertEquals("L4-L5", SpineLevelParser.parse("l4 l5"))
        assertEquals("L4-L5", SpineLevelParser.parse("l4-l5"))
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
        assertEquals("kết quả âm tính", VietnameseNumberParser.parse("kết quả âm tính"))
        assertEquals("âm vang đồng nhất", VietnameseNumberParser.parse("âm vang đồng nhất"))
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
    fun testClinicalScoreParser() {
        val (biradsText, biradsScores) = ClinicalScoreParser.parse("tổn thương vú phân loại bi rads 4a")
        assertTrue(biradsText.contains("BI-RADS 4A"))
        assertEquals(1, biradsScores.size)
        assertEquals("BI-RADS", biradsScores[0].system)
        assertEquals("4A", biradsScores[0].score)

        val (tiradsText, _) = ClinicalScoreParser.parse("nhân giáp ti-rads 3")
        assertTrue(tiradsText.contains("TI-RADS 3"))

        val (piradsText, _) = ClinicalScoreParser.parse("tuyến tiền liệt pi rads 5")
        assertTrue(piradsText.contains("PI-RADS 5"))

        val (liradsText, _) = ClinicalScoreParser.parse("khối u gan li rads 2")
        assertTrue(liradsText.contains("LI-RADS 2"))

        val (aspectsText, _) = ClinicalScoreParser.parse("nhồi máu não aspects 9 điểm")
        assertTrue(aspectsText.contains("ASPECTS 9"))

        val (efText, efScores) = ClinicalScoreParser.parse("phân suất tống máu ef sáu mươi phần trăm")
        val efAfterNumbers = VietnameseNumberParser.parse(efText)
        val (efFinal, _) = ClinicalScoreParser.parse(efAfterNumbers)
        assertTrue(efFinal.contains("EF 60%"))
    }

    @Test
    fun testLateralityAndContradiction() {
        val (latRight, confRight) = LateralityParser.parse("nang thận phải kích thước nhỏ")
        assertFalse(confRight)
        assertEquals(LateralityType.RIGHT, latRight[0].side)

        val (latLeft, confLeft) = LateralityParser.parse("thâm nhiễm thùy dưới phổi trái")
        assertFalse(confLeft)
        assertEquals(LateralityType.LEFT, latLeft[0].side)

        val (latBilateral, confBi) = LateralityParser.parse("thoái hóa hai bên khớp háng")
        assertFalse(confBi)
        assertEquals(LateralityType.BILATERAL, latBilateral[0].side)

        // Contradictory laterality in the same phrase
        val (latConflict, isConflicted) = LateralityParser.parse("u nang thận phải nằm ở cực dưới bên trái")
        assertTrue(isConflicted)
        assertTrue(latConflict.any { it.isContradictory })
    }

    @Test
    fun testNegationPreservationAndScope() {
        val negations = NegationParser.parse("không thấy sỏi cản quang hệ tiết niệu và chưa thấy tràn dịch màng phổi")
        assertEquals(2, negations.size)
        assertEquals("không thấy", negations[0].trigger)
        assertTrue(negations[0].scopeText.contains("sỏi cản quang"))
        assertEquals("chưa thấy", negations[1].trigger)
        assertTrue(negations[1].scopeText.contains("tràn dịch màng phổi"))

        // End-to-end check: Ensure "không thấy" is never dropped
        val result = MedicalTextNormalizer.process("không thấy hình ảnh bất thường trên phim")
        assertTrue(result.normalizedSuggestion.startsWith("Không thấy"))
        assertEquals(1, result.negations.size)
    }

    @Test
    fun testThreeTierCertaintyArchitecture() {
        // EXPLICIT: Explicit unit in speech
        val resExplicit = MedicalTextNormalizer.process("nốt phổi kích thước 15 x 20 mm")
        assertEquals(CertaintyLevel.EXPLICIT, resExplicit.dimensions[0].certainty)
        assertFalse(resExplicit.hasAmbiguityOrConflict)

        // INFERRED: Inferred mm default in radiology
        val resInferred = MedicalTextNormalizer.process("đường kính hai mươi mốt nhân tám")
        assertTrue(resInferred.dimensions.isNotEmpty())
        assertEquals(CertaintyLevel.INFERRED, resInferred.dimensions[0].certainty)

        // AMBIGUOUS: Bare number without any unit or clinical dimension
        val resAmbiguous = MedicalTextNormalizer.process("ghi nhận có 45 ổ dịch không rõ nguồn gốc")
        assertTrue(resAmbiguous.hasAmbiguityOrConflict)
        assertTrue(resAmbiguous.measurements.any { it.certainty == CertaintyLevel.AMBIGUOUS })
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
        val raw = "dày thành không đều hang môn vị dạ dày cái chiếc hai mươi mốt nhân tám đó thôi"
        val result = MedicalTextNormalizer.process(raw)

        assertTrue("Normalized text must contain proper anatomy and dimensions", result.normalizedSuggestion.contains("21 × 8 mm"))
        assertTrue("Normalized text must have capitalized first letter", result.normalizedSuggestion.startsWith("Dày"))
        assertTrue("Trailing filler 'đó thôi' must be stripped", !result.normalizedSuggestion.contains("đó thôi"))
        assertTrue("Hang môn vị must be detected in anatomy", result.detectedAnatomy.contains("hang - môn vị") || result.detectedAnatomy.contains("hang môn vị"))
    }

    @Test
    fun testSpineLevelEndToEndPipeline() {
        val raw = "thoát vị đĩa đệm tầng l bốn năm chèn ép rễ thần kinh"
        val result = MedicalTextNormalizer.process(raw)

        assertTrue("Must normalize L bốn năm to L4-L5 without turning into 45", result.normalizedSuggestion.contains("L4-L5"))
        assertEquals("L4-L5", result.spineLevels[0].normalized)
    }

    @Test
    fun testRealDeviceRadiologyCases() {
        // 1. Liver cyst with diameter 9 mm and nhu mô
        val liverRaw = "GAN KHÔNG TO BỜ ĐỀU NHƯNG MÔ GAN TRÁI CÓ NANG ĐƯỜNG KÍNH CHÍN."
        val liverRes = MedicalTextNormalizer.process(liverRaw)
        assertTrue("Nhu mô must be fixed", liverRes.normalizedSuggestion.contains("nhu mô gan trái"))
        assertTrue("Diameter 9 mm must be normalized", liverRes.normalizedSuggestion.contains("đường kính 9 mm"))

        // 2. Brain MRI with FLAIR and thùy trán
        val brainRaw = "TỔN THƯƠNG TĂNG TÍN HIỆU TRÊN T HAI VÀ FLY Ở CHẤT TRẮNG SÂU THUỶ TRÁN HAI BÊN."
        val brainRes = MedicalTextNormalizer.process(brainRaw)
        assertTrue("FLAIR must be recognized from fly", brainRes.normalizedSuggestion.contains("FLAIR"))
        assertTrue("thùy trán must be normalized", brainRes.normalizedSuggestion.contains("thùy trán"))

        // 3. Chest X-ray angle and pleural effusion
        val chestRaw = "GÓC TÂM HOÀNH VÀ GÓC SƠN LÀNH HAI BÊN NHỌN KHÔNG THẤY TRÀN DỊCH MỎNG."
        val chestRes = MedicalTextNormalizer.process(chestRaw)
        assertTrue("Góc sườn hoành must be fixed", chestRes.normalizedSuggestion.contains("góc sườn hoành"))
        assertTrue("Tràn dịch màng phổi must be fixed", chestRes.normalizedSuggestion.contains("tràn dịch màng phổi"))

        // 4. Brain atrophy
        val brainAtrophyRaw = "HỆ THỐNG NÃO THẤT VÀ CÁC RÃNH QUẬN NÃO HAI BÊN GIÃN NHẸ PHÙ HỢP CHO NÃO TUỔI GIÀ."
        val brainAtrophyRes = MedicalTextNormalizer.process(brainAtrophyRaw)
        assertTrue("Rãnh cuộn não must be fixed", brainAtrophyRes.normalizedSuggestion.contains("rãnh cuộn não"))
        assertTrue("Teo não tuổi già must be fixed", brainAtrophyRes.normalizedSuggestion.contains("teo não tuổi già"))

        // 5. Portal vein
        val portalRaw = "TÍCH MẠCH CỬA KHÔNG GIAN KHÔNG THẤY HUYẾT KHỐI TRONG LÒNG MẠCH."
        val portalRes = MedicalTextNormalizer.process(portalRaw)
        assertTrue("Tĩnh mạch cửa must be fixed", portalRes.normalizedSuggestion.contains("Tĩnh mạch cửa"))
        assertTrue("Không giãn must be fixed", portalRes.normalizedSuggestion.contains("không giãn"))

        // 6. Multi-filler trailing words
        val fillerRaw = "TRUNG THẤT KHÔNG THẤY HẠCH LỚN. KÍCH THƯỚC HẠCH NHỎ HƠN MƯỜI MM TRÊN TRỤC NGẮN. ĐÂY. NÀY."
        val fillerRes = MedicalTextNormalizer.process(fillerRaw)
        assertFalse("Trailing fillers 'đây' and 'này' must be removed", fillerRes.normalizedSuggestion.contains("đây", ignoreCase = true))
        assertFalse("Trailing fillers 'đây' and 'này' must be removed", fillerRes.normalizedSuggestion.contains("này", ignoreCase = true))

        // 7. Stomach antrum - môn vị (never 0 mm)
        val stomachRaw = "Dày không đều thành hang môn vị dạ dày chỗ dày nhất hai mốt mm. Gây hẹp lòng muôn vị."
        val stomachRes = MedicalTextNormalizer.process(stomachRaw)
        assertFalse("Dày không đều must NEVER turn into 0 mm", stomachRes.normalizedSuggestion.contains("0 mm"))
        assertTrue("Dày không đều must be preserved", stomachRes.normalizedSuggestion.contains("Dày không đều"))
        assertTrue("Môn vị must be fixed from muôn vị", stomachRes.normalizedSuggestion.contains("môn vị"))
        assertTrue("21 mm must be parsed", stomachRes.normalizedSuggestion.contains("21 mm"))

        // 8. Gallbladder and Wirsung duct
        val gbRaw = "Từ mặt thành mỏng dịch mật đồng nhất không thấy sỏi chẳng qua."
        val gbRes = MedicalTextNormalizer.process(gbRaw)
        assertTrue("Túi mật must be fixed from từ mặt", gbRes.normalizedSuggestion.contains("Túi mật"))
        assertTrue("Sỏi cản quang must be fixed from sỏi chẳng qua", gbRes.normalizedSuggestion.contains("sỏi cản quang"))

        val pancRaw = "Tuỳ kích thước trong giới hạn bình thường ngấm thuốc đồng nhất ống christong không giãn."
        val pancRes = MedicalTextNormalizer.process(pancRaw)
        assertTrue("Tụy must be fixed from tuỳ", pancRes.normalizedSuggestion.contains("Tụy"))
        assertTrue("Wirsung must be fixed from christong", pancRes.normalizedSuggestion.contains("Wirsung"))

        // 9. Lung nodule retracting pleura and pleural cavity
        val lungRaw = "Nốt kính mờ thì dưới phổi phải kích thước tám mm không thấy co keo màng phổi lân cận."
        val lungRes = MedicalTextNormalizer.process(lungRaw)
        assertTrue("Thùy dưới must be fixed from thì dưới", lungRes.normalizedSuggestion.contains("thùy dưới"))
        assertTrue("Co kéo must be fixed from co keo", lungRes.normalizedSuggestion.contains("co kéo"))
        assertTrue("8 mm must be parsed", lungRes.normalizedSuggestion.contains("8 mm"))

        val pleuraRaw = "Không thấy tràn dịch tràn khí qua màng phổi hai bên."
        val pleuraRes = MedicalTextNormalizer.process(pleuraRaw)
        assertTrue("Khoang màng phổi must be fixed from qua màng phổi", pleuraRes.normalizedSuggestion.contains("khoang màng phổi"))

        // 10. Spoken comma deduction ("phải" as comma) and thoracic ratio
        val commaRaw = "Nhu mô gan dày phải tăng âm nhẹ lan toả phải giảm hút âm vùng sâu phải nghĩ gan nhiễm mỡ độ một."
        val commaRes = MedicalTextNormalizer.process(commaRaw)
        assertTrue("Nhu mô gan dày, tăng âm", commaRes.normalizedSuggestion.contains("Nhu mô gan dày, tăng âm"))
        assertTrue("giảm hút âm vùng sâu, nghĩ", commaRes.normalizedSuggestion.contains("giảm hút âm vùng sâu, nghĩ"))

        val diaphragmRaw = "Và hoành hai bên đều phải liên tục phải không thấy lềm hơi dưới hoành."
        val diaphragmRes = MedicalTextNormalizer.process(diaphragmRaw)
        assertTrue("Vòm hoành must be fixed from và hoành", diaphragmRes.normalizedSuggestion.contains("Vòm hoành"))
        assertTrue("Liềm hơi must be fixed from lềm hơi", diaphragmRes.normalizedSuggestion.contains("liềm hơi"))

        val thoracicRaw = "Bóng tim không to chỉ số tim lồng ngực nhỏ hơn không năm."
        val thoracicRes = MedicalTextNormalizer.process(thoracicRaw)
        assertTrue("0.5 must be parsed from không năm", thoracicRes.normalizedSuggestion.contains("0.5"))

        val kneeRaw = "Đứt hoàn toàn dây chẳng chéo trước khớp gối phải kèm phùỷ xương lồi cầu ngoài."
        val kneeRes = MedicalTextNormalizer.process(kneeRaw)
        assertTrue("Dây chằng chéo must be fixed", kneeRes.normalizedSuggestion.contains("dây chằng chéo"))
        assertTrue("Phù tủy xương must be fixed", kneeRes.normalizedSuggestion.contains("phù tủy xương"))

        val contrastRaw = "Khối u ngấm thuốc mạnh sau tiêm đối hoàng tử giới hạn rõ đường kính mười tám mm."
        val contrastRes = MedicalTextNormalizer.process(contrastRaw)
        assertTrue("Đối quang từ must be fixed from đối hoàng tử", contrastRes.normalizedSuggestion.contains("đối quang từ"))
    }
}
