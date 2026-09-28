package com.autoris.asrbenchmark.normalizer

import java.util.Locale

data class NormalizedResult(
    val rawText: String,
    val normalizedSuggestion: String,
    val detectedTerms: List<String>,
    val detectedNumbers: List<String>,
    val detectedAnatomy: List<String>,
    val detectedNegations: List<String>,
    val suggestionsLog: List<String>
)

object MedicalTextNormalizer {

    // Common Diagnostic Imaging (CĐHA) Anatomical Locations
    val ANATOMY_TERMS = listOf(
        "hang môn vị", "hang vị", "môn vị", "tá tràng", "hỗng tràng", "hồi tràng", "đại tràng", "trực tràng", "dạ dày",
        "gan", "nhu mô gan", "thùy gan", "hạ phân thùy", "tĩnh mạch cửa", "tĩnh mạch chủ dưới",
        "đường mật", "ống mật chủ", "túi mật", "đường mật trong gan", "đường mật ngoài gan",
        "tụy", "đầu tụy", "thân tụy", "đuôi tụy", "lách",
        "thận", "thận phải", "thận trái", "đài bể thận", "niệu quản", "bàng quang", "tiểu khung", "tuyến tiền liệt",
        "phổi", "nhu mô phổi", "màng phổi", "trung thất", "phế quản", "tiểu phế quản", "khe liên thùy", "rốn phổi",
        "động mạch chủ", "động mạch chậu", "động mạch thân tạng", "động mạch mạc treo tràng trên",
        "sọ não", "nhu mô não", "tiểu não", "thân não", "não thất", "xoang trán", "xoang hàm", "xoang bướm",
        "hạch", "hạch cổ", "hạch nách", "hạch trung thất", "hạch ổ bụng", "hạch bẹn",
        "cột sống", "đĩa đệm", "lỗ liên hợp"
    )

    // Common Pathologies & Imaging Findings
    val PATHOLOGY_TERMS = listOf(
        "nhu mô", "thâm nhiễm", "ngấm thuốc", "ngấm thuốc mạnh", "ngấm thuốc kém", "không đồng nhất",
        "nốt đặc", "nốt kính mờ", "nốt bán đặc", "dải mờ", "đông đặc", "tràn dịch", "tràn khí",
        "vôi hóa", "xơ vữa", "tưới máu", "huyết khối", "dịch tự do", "nang", "sỏi", "khối u", "polyp",
        "giãn", "hẹp", "hẹp lòng", "dày thành", "dày không đều", "bờ đều", "bờ không đều", "tăng tỷ trọng",
        "giảm tỷ trọng", "tăng tín hiệu", "giảm tín hiệu", "đồng tín hiệu", "thoát vị", "tổn thương"
    )

    // Negations
    val NEGATION_PATTERNS = listOf(
        "không thấy", "không giãn", "không huyết khối", "không ngấm thuốc", "không to", "không dày",
        "chưa thấy", "không có", "không tràn dịch", "không tràn khí", "không vôi hóa"
    )

    /**
     * Modularized normalizer pipeline for Radiology / CĐHA.
     */
    fun process(rawText: String): NormalizedResult {
        if (rawText.isBlank()) {
            return NormalizedResult(
                rawText = rawText,
                normalizedSuggestion = "",
                detectedTerms = emptyList(),
                detectedNumbers = emptyList(),
                detectedAnatomy = emptyList(),
                detectedNegations = emptyList(),
                suggestionsLog = emptyList()
            )
        }

        val suggestionsLog = mutableListOf<String>()
        var normalized = rawText

        // 1. Radiology Phonetic & Dialect fixes
        val afterPhonetics = MedicalPhraseNormalizer.fixPhonetics(normalized, suggestionsLog)
        normalized = afterPhonetics

        // 2. Spine Levels (MUST precede general number parsing so "L bốn năm" -> "L4-L5")
        val afterSpine = SpineLevelParser.parse(normalized)
        if (afterSpine != normalized) {
            suggestionsLog.add("Chuẩn hóa tầng cột sống: -> \"$afterSpine\"")
            normalized = afterSpine
        }

        // 3. Spoken Vietnamese numbers (decimals, compounds, tens, hundreds)
        val afterNumbers = VietnameseNumberParser.parse(normalized)
        if (afterNumbers != normalized) {
            normalized = afterNumbers
        }

        // 4. Ranges (e.g. "từ 5 đến 10 mm" -> "5 - 10 mm")
        val afterRange = RangeParser.parse(normalized)
        normalized = afterRange

        // 5. Dimensions (e.g. "21 x 8" -> "21 × 8 mm", "10 x 15 x 20 mm" -> "10 × 15 × 20 mm")
        val afterDim = DimensionParser.parse(normalized)
        normalized = afterDim

        // 6. Percentages (e.g. "70 phần trăm" -> "70%")
        val afterPct = PercentageParser.parse(normalized)
        normalized = afterPct

        // 7. Volumes (e.g. "25 mi li lít" -> "25 ml")
        val afterVol = VolumeParser.parse(normalized)
        normalized = afterVol

        // 8. Measurements & contextual defaults (e.g. "đường kính 15" -> "đường kính 15 mm")
        val afterMeas = MeasurementParser.parse(normalized)
        normalized = afterMeas

        // 9. Clean trailing verbal fillers & capitalize
        normalized = MedicalPhraseNormalizer.cleanTrailingFillers(normalized)
        normalized = MedicalPhraseNormalizer.capitalizeFirstLetter(normalized)

        // 10. Extract domain entities
        val normLower = normalized.lowercase(Locale.ROOT)
        val foundAnatomy = ANATOMY_TERMS.filter { normLower.contains(it) }
        val foundPathology = PATHOLOGY_TERMS.filter { normLower.contains(it) }
        val foundNegations = NEGATION_PATTERNS.filter { normLower.contains(it) }

        val foundNumbers = mutableListOf<String>()
        val numberMatchRegex = Regex("\\b\\d+(?:\\.\\d+)?(?:\\s*×\\s*\\d+(?:\\.\\d+)?)*(?:\\s*(?:mm|cm|m|%|ml|HU))?\\b")
        numberMatchRegex.findAll(normalized).forEach {
            foundNumbers.add(it.value.trim())
        }

        return NormalizedResult(
            rawText = rawText,
            normalizedSuggestion = normalized,
            detectedTerms = foundPathology,
            detectedNumbers = foundNumbers,
            detectedAnatomy = foundAnatomy,
            detectedNegations = foundNegations,
            suggestionsLog = suggestionsLog
        )
    }
}
