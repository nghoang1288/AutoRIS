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

    // Common phonetic / dialect ASR corrections in Radiology
    private val RADIOLOGY_PHONETIC_FIXES = listOf(
        Regex("\\b(?:cái\\s+chiếc|cái\\s+trích|cái\\s+trước)\\b", RegexOption.IGNORE_CASE) to "kích thước",
        Regex("\\b(?:không\\s+gian|chưa\\s+gian)\\b", RegexOption.IGNORE_CASE) to "không giãn",
        Regex("\\b(?:mà|vừa|và)\\s+đều\\b", RegexOption.IGNORE_CASE) to "bờ đều",
        Regex("\\bngấm\\s+thuốc\\s+không\\s+đều(?:\\s+biết)?\\b", RegexOption.IGNORE_CASE) to "ngấm thuốc không đồng nhất",
        Regex("\\bkhông\\s+đều\\s+biết\\b", RegexOption.IGNORE_CASE) to "không đồng nhất",
        Regex("\\btích mới cửa\\b", RegexOption.IGNORE_CASE) to "tĩnh mạch cửa",
        Regex("\\bclitsung\\b", RegexOption.IGNORE_CASE) to "Wirsung",
        Regex("\\bclit\\s+sung\\b", RegexOption.IGNORE_CASE) to "Wirsung",
        Regex("\\bquýt\\s*xung\\b", RegexOption.IGNORE_CASE) to "Wirsung",
        Regex("\\bngầm thuốc đồng nhân\\b", RegexOption.IGNORE_CASE) to "ngấm thuốc đồng nhất",
        Regex("\\bngấm thuốc đồng nhân\\b", RegexOption.IGNORE_CASE) to "ngấm thuốc đồng nhất",
        Regex("\\btrong hạn bình thường\\b", RegexOption.IGNORE_CASE) to "trong giới hạn bình thường",
        Regex("\\bnhư mô\\b", RegexOption.IGNORE_CASE) to "nhu mô",
        Regex("\\bnút kính mờ\\b", RegexOption.IGNORE_CASE) to "nốt kính mờ",
        Regex("\\bnút đặc\\b", RegexOption.IGNORE_CASE) to "nốt đặc",
        Regex("\\bthuỷ\\s+(dưới|trên|giữa)\\b", RegexOption.IGNORE_CASE) to "thùy $1",
        Regex("\\bkhông đáy\\b", RegexOption.IGNORE_CASE) to "không thấy"
    )

    private val DIGIT_WORDS = mapOf(
        "không" to 0, "một" to 1, "mốt" to 1, "hai" to 2, "ba" to 3, "bốn" to 4, "tư" to 4,
        "năm" to 5, "lăm" to 5, "nhăm" to 5, "sáu" to 6, "bảy" to 7, "tám" to 8, "chín" to 9, "mười" to 10
    )

    private val TENS_WORDS = mapOf(
        "hai" to 20, "ba" to 30, "bốn" to 40, "năm" to 50,
        "sáu" to 60, "bảy" to 70, "tám" to 80, "chín" to 90
    )

    private val UNITS_WORDS = mapOf(
        "mốt" to 1, "một" to 1, "hai" to 2, "ba" to 3, "tư" to 4, "bốn" to 4,
        "lăm" to 5, "nhăm" to 5, "năm" to 5, "sáu" to 6, "bảy" to 7, "tám" to 8, "chín" to 9
    )

    /**
     * Normalizes transcript for display, reporting, and accuracy evaluation.
     */
    fun process(rawText: String): NormalizedResult {
        val lower = rawText.lowercase(Locale.ROOT).trim()
        val suggestionsLog = mutableListOf<String>()

        var normalized = rawText

        // 1. Radiology Phonetic & Dialect corrections
        for ((regex, replacement) in RADIOLOGY_PHONETIC_FIXES) {
            if (regex.containsMatchIn(normalized)) {
                val match = regex.find(normalized)?.value ?: ""
                normalized = regex.replace(normalized, replacement)
                suggestionsLog.add("Hiệu chỉnh thuật ngữ CĐHA: \"$match\" -> \"$replacement\"")
            }
        }

        // 2. Spine Levels: "L bốn năm" / "L bốn L năm" -> "L4 L5" / "L4-L5"
        val spinePattern = Regex("\\b([LCDSTlcdst])\\s+(một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín)\\s+(?:([LCDSTlcdst])\\s+)?(một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín)\\b", RegexOption.IGNORE_CASE)
        normalized = spinePattern.replace(normalized) { m ->
            val prefix = m.groupValues[1].uppercase(Locale.ROOT)
            val d1 = DIGIT_WORDS[m.groupValues[2].lowercase(Locale.ROOT)] ?: m.groupValues[2]
            val d2 = DIGIT_WORDS[m.groupValues[4].lowercase(Locale.ROOT)] ?: m.groupValues[4]
            val rep = "$prefix$d1 $prefix$d2"
            suggestionsLog.add("Chuẩn hóa tầng cột sống: \"${m.value}\" -> \"$rep\"")
            rep
        }

        // 3. Spoken Vietnamese numbers (compound: "hai mốt" -> 21, "ba lăm" -> 35, "hai mươi mốt" -> 21)
        for ((tWord, tVal) in TENS_WORDS) {
            for ((uWord, uVal) in UNITS_WORDS) {
                val compoundPattern = Regex("\\b$tWord(?:\\s+mươi)?\\s+$uWord\\b", RegexOption.IGNORE_CASE)
                if (compoundPattern.containsMatchIn(normalized)) {
                    val numVal = tVal + uVal
                    normalized = compoundPattern.replace(normalized, numVal.toString())
                }
            }
            val tensOnlyPattern = Regex("\\b$tWord\\s+(?:mươi|chục)\\b", RegexOption.IGNORE_CASE)
            normalized = tensOnlyPattern.replace(normalized, tVal.toString())
        }

        // 4. "đường kính [số]" -> "đường kính [số] mm"
        for ((dWord, dVal) in DIGIT_WORDS) {
            val dkPattern = Regex("\\bđường\\s+kính\\s+$dWord\\b", RegexOption.IGNORE_CASE)
            if (dkPattern.containsMatchIn(normalized)) {
                normalized = dkPattern.replace(normalized, "đường kính $dVal mm")
                suggestionsLog.add("Chuẩn hóa kích thước đường kính: -> \"đường kính $dVal mm\"")
            }
        }
        for ((tWord, tVal) in TENS_WORDS) {
            val dkTensPattern = Regex("\\bđường\\s+kính\\s+$tWord\\b", RegexOption.IGNORE_CASE)
            if (dkTensPattern.containsMatchIn(normalized)) {
                normalized = dkTensPattern.replace(normalized, "đường kính $tVal mm")
                suggestionsLog.add("Chuẩn hóa kích thước đường kính: -> \"đường kính $tVal mm\"")
            }
        }

        // 5. Dimensions & Measurements: "21 x 8 mm" / "21 nhân 8 mm" / "hai mốt x tám mm" -> "21 × 8 mm"
        for ((dWord, dVal) in DIGIT_WORDS) {
            // "21 x tám" -> "21 × 8 mm"
            val dimWordPattern = Regex("(\\d+(?:\\.\\d+)?)\\s*(?:x|×|nhân)\\s*$dWord\\b", RegexOption.IGNORE_CASE)
            if (dimWordPattern.containsMatchIn(normalized)) {
                normalized = dimWordPattern.replace(normalized, "$1 × $dVal mm")
                suggestionsLog.add("Chuẩn hóa kích thước đa chiều: -> \"$1 × $dVal mm\"")
            }

            val singleUnitPattern = Regex("\\b$dWord\\s*(mm|cm|milimet|xen ti met|%)\\b", RegexOption.IGNORE_CASE)
            normalized = singleUnitPattern.replace(normalized, "$dVal $1")

            val singleDimPattern = Regex("\\b$dWord\\s+(?:x|nhân)\\s+", RegexOption.IGNORE_CASE)
            normalized = singleDimPattern.replace(normalized, "$dVal × ")
        }

        // Standardize multi-dimensional × format
        val multiDimRegex = Regex("(\\d+(?:\\.\\d+)?)\\s+(?:x|nhân|bằng)\\s+(\\d+(?:\\.\\d+)?)", RegexOption.IGNORE_CASE)
        normalized = multiDimRegex.replace(normalized, "$1 × $2")

        // Add default mm unit if two dimensions have no unit: e.g. "21 × 8" -> "21 × 8 mm"
        val dimWithoutUnit = Regex("(\\d+(?:\\.\\d+)?)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)(?!\\s*(?:mm|cm|%))\\b", RegexOption.IGNORE_CASE)
        normalized = dimWithoutUnit.replace(normalized, "$1 × $2 mm")

        // Standardize unit abbreviations
        normalized = normalized.replace(Regex("\\b(?:mi\\s*li\\s*mét|milimet|mi\\s*li)\\b", RegexOption.IGNORE_CASE), "mm")
        normalized = normalized.replace(Regex("\\b(?:xen\\s*ti\\s*mét|centimet|xen\\s*ti)\\b", RegexOption.IGNORE_CASE), "cm")
        normalized = normalized.replace(Regex("\\b(?:phần\\s*trăm)\\b", RegexOption.IGNORE_CASE), "%")
        normalized = normalized.replace(Regex("(\\d+)\\s*(mm|cm|%)", RegexOption.IGNORE_CASE), "$1 $2")

        // 6. Clean up trailing fillers when stopping: "đó thôi", "thôi", "tôi", "hết", "xong"
        val trailingFiller = Regex("\\s*\\b(?:đó\\s+thôi|đó|thôi|tôi|hết|xong)\\.?\\s*$", RegexOption.IGNORE_CASE)
        if (trailingFiller.containsMatchIn(normalized)) {
            normalized = trailingFiller.replace(normalized, "")
        }
        normalized = normalized.trim()
        if (normalized.endsWith("..")) normalized = normalized.dropLast(1)
        if (!normalized.endsWith(".") && normalized.isNotEmpty()) normalized = "$normalized."

        // Extract detected domain entities
        val normLower = normalized.lowercase(Locale.ROOT)
        val foundAnatomy = ANATOMY_TERMS.filter { normLower.contains(it) }
        val foundPathology = PATHOLOGY_TERMS.filter { normLower.contains(it) }
        val foundNegations = NEGATION_PATTERNS.filter { normLower.contains(it) }

        val foundNumbers = mutableListOf<String>()
        val numberMatchRegex = Regex("\\b\\d+(?:\\.\\d+)?(?:\\s*×\\s*\\d+(?:\\.\\d+)?)*(?:\\s*(?:mm|cm|%))?\\b")
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
