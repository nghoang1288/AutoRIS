package com.autoris.asrbenchmark.normalizer

import java.util.Locale

object MedicalPhraseNormalizer {

    private val RADIOLOGY_PHONETIC_FIXES = listOf(
        Regex("\\b(?:cái\\s+chiếc|cái\\s+trích|cái\\s+trước)\\b", RegexOption.IGNORE_CASE) to "kích thước",
        Regex("\\b(?:không\\s+gian|chưa\\s+gian)\\b", RegexOption.IGNORE_CASE) to "không giãn",
        Regex("\\b(?:mà|vừa|và)\\s+đều\\b", RegexOption.IGNORE_CASE) to "bờ đều",
        Regex("\\bngấm\\s+thuốc\\s+không\\s+đều(?:\\s+biết)?\\b", RegexOption.IGNORE_CASE) to "ngấm thuốc không đồng nhất",
        Regex("\\bkhông\\s+đều\\s+biết\\b", RegexOption.IGNORE_CASE) to "không đồng nhất",
        Regex("\\btích mới cửa\\b", RegexOption.IGNORE_CASE) to "tĩnh mạch cửa",
        Regex("\\b(?:clitsung|clit\\s+sung|quýt\\s*xung|witt\\s*sung)\\b", RegexOption.IGNORE_CASE) to "Wirsung",
        Regex("\\bngấm\\s+thuốc\\s+đồng\\s+nhân\\b", RegexOption.IGNORE_CASE) to "ngấm thuốc đồng nhất",
        Regex("\\btrong\\s+hạn\\s+bình\\s+thường\\b", RegexOption.IGNORE_CASE) to "trong giới hạn bình thường",
        Regex("\\bnhư\\s+mô\\b", RegexOption.IGNORE_CASE) to "nhu mô",
        Regex("\\bnút\\s+kính\\s+mờ\\b", RegexOption.IGNORE_CASE) to "nốt kính mờ",
        Regex("\\bnút\\s+đặc\\b", RegexOption.IGNORE_CASE) to "nốt đặc",
        Regex("\\bthuỷ\\s+(dưới|trên|giữa)\\b", RegexOption.IGNORE_CASE) to "thùy $1",
        Regex("\\bhạ\\s+phân\\s+thuỳ\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy",
        Regex("\\bkhông\\s+đáy\\b", RegexOption.IGNORE_CASE) to "không thấy",
        Regex("\\bsơ\\s+vữa\\b", RegexOption.IGNORE_CASE) to "xơ vữa"
    )

    private val TRAILING_FILLERS = Regex(
        "\\s*\\b(?:đó\\s+thôi|đó|thôi|tôi|hết|xong|dừng|dừng\\s+lại)\\.?\\s*$",
        RegexOption.IGNORE_CASE
    )

    /**
     * Applies phonetic radiology dialect fixes.
     */
    fun fixPhonetics(text: String, suggestionsLog: MutableList<String>? = null): String {
        var result = text
        for ((regex, replacement) in RADIOLOGY_PHONETIC_FIXES) {
            if (regex.containsMatchIn(result)) {
                val match = regex.find(result)?.value ?: ""
                result = regex.replace(result, replacement)
                suggestionsLog?.add("Hiệu chỉnh thuật ngữ CĐHA: \"$match\" -> \"$replacement\"")
            }
        }
        return result
    }

    /**
     * Cleans up trailing verbal fillers when the doctor finishes dictating.
     */
    fun cleanTrailingFillers(text: String): String {
        var result = text
        if (TRAILING_FILLERS.containsMatchIn(result)) {
            result = TRAILING_FILLERS.replace(result, "")
        }
        result = result.trim()
        if (result.endsWith("..")) result = result.dropLast(1)
        if (result.isNotEmpty() && !result.endsWith(".") && !result.endsWith("?") && !result.endsWith("!")) {
            result = "$result."
        }
        return result
    }

    /**
     * Capitalizes the first letter of the sentence.
     */
    fun capitalizeFirstLetter(text: String): String {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return ""
        return trimmed.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() }
    }
}
