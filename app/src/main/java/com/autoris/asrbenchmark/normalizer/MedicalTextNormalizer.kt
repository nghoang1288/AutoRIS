package com.autoris.asrbenchmark.normalizer

import java.util.Locale

data class NormalizedResult(
    val rawText: String,
    val normalizedSuggestion: String,
    val detectedTerms: List<String>,
    val detectedNumbers: List<String>,
    val detectedAnatomy: List<String>,
    val detectedNegations: List<String>,
    val suggestionsLog: List<String>,
    val measurements: List<ParsedMeasurement> = emptyList(),
    val dimensions: List<ParsedDimension> = emptyList(),
    val spineLevels: List<ParsedSpineLevel> = emptyList(),
    val lateralities: List<ParsedLaterality> = emptyList(),
    val negations: List<ParsedNegation> = emptyList(),
    val clinicalScores: List<ParsedClinicalScore> = emptyList(),
    val hasAmbiguityOrConflict: Boolean = false
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
        "chưa thấy", "không có", "không tràn dịch", "không tràn khí", "không vôi hóa", "loại trừ"
    )

    /**
     * Modularized normalizer pipeline for Radiology / CĐHA with 3-tier semantic parsing.
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
        var normalized = rawText.lowercase(Locale("vi", "VN"))

        // 1. Radiology Phonetic & Dialect fixes
        val afterPhonetics = MedicalPhraseNormalizer.fixPhonetics(normalized, suggestionsLog)
        normalized = afterPhonetics

        // 2. Clinical Scoring Systems (BI-RADS, TI-RADS, PI-RADS, LI-RADS, ASPECTS, EF)
        val (afterScores, parsedScores) = ClinicalScoreParser.parse(normalized)
        if (afterScores != normalized) {
            suggestionsLog.add("Chuẩn hóa phân loại CĐHA: -> \"$afterScores\"")
            normalized = afterScores
        }

        // 3. Spine Levels (MUST precede general number parsing so "L bốn năm" -> "L4-L5")
        val afterSpine = SpineLevelParser.parse(normalized)
        if (afterSpine != normalized) {
            suggestionsLog.add("Chuẩn hóa tầng cột sống: -> \"$afterSpine\"")
            normalized = afterSpine
        }

        // 4. Spoken Vietnamese numbers (decimals, compounds, tens, hundreds)
        val afterNumbers = VietnameseNumberParser.parse(normalized)
        if (afterNumbers != normalized) {
            normalized = afterNumbers
        }

        // 5. Ranges (e.g. "từ 5 đến 10 mm" -> "5 - 10 mm")
        val afterRange = RangeParser.parse(normalized)
        normalized = afterRange

        // 6. Dimensions (e.g. "21 x 8" -> "21 × 8 mm", "10 x 15 x 20 mm" -> "10 × 15 × 20 mm")
        val afterDim = DimensionParser.parse(normalized)
        normalized = afterDim

        // 7. Percentages (e.g. "70 phần trăm" -> "70%")
        val afterPct = PercentageParser.parse(normalized)
        normalized = afterPct

        // 8. Volumes (e.g. "25 mi li lít" -> "25 ml")
        val afterVol = VolumeParser.parse(normalized)
        normalized = afterVol

        // 9. Measurements & contextual defaults (e.g. "đường kính 15" -> "đường kính 15 mm")
        val afterMeas = MeasurementParser.parse(normalized)
        normalized = afterMeas

        // 10. Clean trailing verbal fillers & capitalize
        normalized = MedicalPhraseNormalizer.cleanTrailingFillers(normalized)
        normalized = MedicalPhraseNormalizer.capitalizeFirstLetter(normalized)

        // 11. Extract domain entities
        val normLower = normalized.lowercase(Locale.ROOT)
        val foundAnatomy = ANATOMY_TERMS.filter { normLower.contains(it) }
        val foundPathology = PATHOLOGY_TERMS.filter { normLower.contains(it) }
        val foundNegations = NEGATION_PATTERNS.filter { normLower.contains(it) }

        // 12. Semantic parsing: Laterality & Conflict Checking
        val (parsedLateralities, hasLateralityConflict) = LateralityParser.parse(normalized)

        // 13. Semantic parsing: Clinical Negations
        val parsedNegations = NegationParser.parse(normalized)

        // 14. Semantic parsing: Spine Levels
        val spineRegex = Regex("\\b([LCDST]\\d+(?:-[LCDST]\\d+)?)\\b", RegexOption.IGNORE_CASE)
        val parsedSpineLevels = spineRegex.findAll(normalized).map {
            val upper = it.value.uppercase(Locale.ROOT)
            ParsedSpineLevel(raw = it.value, normalized = upper, certainty = CertaintyLevel.EXPLICIT)
        }.toList()

        // 15. Semantic parsing: Dimensions
        val dimRegex = Regex("\\b(\\d+(?:\\.\\d+)?)\\s*×\\s*(\\d+(?:\\.\\d+)?)(?:\\s*×\\s*(\\d+(?:\\.\\d+)?))?\\s*(mm|cm|m)\\b")
        val parsedDims = dimRegex.findAll(normalized).map { match ->
            val d1 = match.groupValues[1].toFloatOrNull() ?: 0f
            val d2 = match.groupValues[2].toFloatOrNull() ?: 0f
            val d3Str = match.groupValues[3]
            val dimsList = if (d3Str.isNotEmpty()) listOf(d1, d2, d3Str.toFloatOrNull() ?: 0f) else listOf(d1, d2)
            val unit = match.groupValues[4]
            ParsedDimension(
                raw = match.value,
                normalized = match.value,
                dims = dimsList,
                unit = unit,
                certainty = if (isUnitExplicitlyPresent(rawText, unit)) CertaintyLevel.EXPLICIT else CertaintyLevel.INFERRED
            )
        }.toList()

        // 16. Semantic parsing: Measurements
        val measRegex = Regex("\\b(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m|%|ml|HU)(?=[^a-zA-ZÀ-ỹ0-9]|$)")
        val parsedMeasurements = mutableListOf<ParsedMeasurement>()
        measRegex.findAll(normalized).forEach { match ->
            val isPartOfDim = parsedDims.any { it.normalized.endsWith(match.value.trim()) }
            if (!isPartOfDim) {
                val v = match.groupValues[1].toFloatOrNull()
                val u = match.groupValues[2]
                val certainty = if (isUnitExplicitlyPresent(rawText, u)) CertaintyLevel.EXPLICIT else CertaintyLevel.INFERRED
                parsedMeasurements.add(
                    ParsedMeasurement(raw = match.value, normalized = match.value, value = v, unit = u, certainty = certainty)
                )
            }
        }

        // Check for ambiguous isolated numbers without unit
        val bareNumberRegex = Regex("\\b\\d+(?:\\.\\d+)?\\b")
        var hasAmbiguity = hasLateralityConflict
        bareNumberRegex.findAll(normalized).forEach { match ->
            val numStr = match.value
            val isPartOfDim = parsedDims.any { Regex("\\b" + Regex.escape(numStr) + "\\b").containsMatchIn(it.normalized) }
            val isPartOfMeas = parsedMeasurements.any { Regex("\\b" + Regex.escape(numStr) + "\\b").containsMatchIn(it.normalized) }
            val isPartOfSpine = parsedSpineLevels.any { Regex("\\b" + Regex.escape(numStr) + "\\b").containsMatchIn(it.normalized) }
            val isPartOfScore = parsedScores.any { Regex("\\b" + Regex.escape(numStr) + "\\b").containsMatchIn(it.raw) }

            if (!isPartOfDim && !isPartOfMeas && !isPartOfSpine && !isPartOfScore) {
                parsedMeasurements.add(
                    ParsedMeasurement(
                        raw = numStr,
                        normalized = numStr,
                        value = numStr.toFloatOrNull(),
                        unit = null,
                        certainty = CertaintyLevel.AMBIGUOUS,
                        ambiguityReason = "Số đo thiếu đơn vị lâm sàng (mm/cm)"
                    )
                )
                hasAmbiguity = true
            }
        }

        val foundNumbers = mutableListOf<String>()
        val numberMatchRegex = Regex("\\b\\d+(?:\\.\\d+)?(?:\\s*×\\s*\\d+(?:\\.\\d+)?)*(?:\\s*(?:mm|cm|m|%|ml|HU))?(?=[^a-zA-ZÀ-ỹ0-9]|$)")
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
            suggestionsLog = suggestionsLog,
            measurements = parsedMeasurements,
            dimensions = parsedDims,
            spineLevels = parsedSpineLevels,
            lateralities = parsedLateralities,
            negations = parsedNegations,
            clinicalScores = parsedScores,
            hasAmbiguityOrConflict = hasAmbiguity
        )
    }

    private fun isUnitExplicitlyPresent(rawText: String, unit: String): Boolean {
        if (rawText.contains(unit, ignoreCase = true)) return true
        val lower = rawText.lowercase(Locale("vi", "VN"))
        return when (unit.lowercase(Locale.ROOT)) {
            "mm" -> lower.contains("mili")
            "cm" -> lower.contains("centi") || lower.contains("xenti")
            "ml" -> lower.contains("mililit") || lower.contains("mili lít")
            "l" -> lower.contains("lít")
            "%" -> lower.contains("phần trăm")
            else -> false
        }
    }
}
