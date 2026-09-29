package com.autoris.asrbenchmark.normalizer

import java.util.Locale

object MedicalPhraseNormalizer {

    private val RADIOLOGY_PHONETIC_FIXES = listOf(
        Regex("\\b(?:cái\\s+chiếc|cái\\s+trích|cái\\s+trước)\\b", RegexOption.IGNORE_CASE) to "kích thước",
        Regex("\\b(?:không\\s+gian|chưa\\s+gian)\\b", RegexOption.IGNORE_CASE) to "không giãn",
        Regex("\\b(?:mà|vừa|và|mờ)\\s+đều\\b", RegexOption.IGNORE_CASE) to "bờ đều",
        Regex("\\bngấm\\s+thuốc\\s+không\\s+đều(?:\\s+biết)?\\b", RegexOption.IGNORE_CASE) to "ngấm thuốc không đồng nhất",
        Regex("\\bkhông\\s+đều\\s+biết\\b", RegexOption.IGNORE_CASE) to "không đồng nhất",
        Regex("\\b(?:tích\\s+mạch|tích\\s+mới)\\s+cửa\\b", RegexOption.IGNORE_CASE) to "tĩnh mạch cửa",
        Regex("\\btích\\s+mạch\\b", RegexOption.IGNORE_CASE) to "tĩnh mạch",
        Regex("\\b(?:clitsung|clit\\s+sung|quýt\\s*xung|witt\\s*sung)\\b", RegexOption.IGNORE_CASE) to "Wirsung",
        Regex("\\bngấm\\s+thuốc\\s+đồng\\s+nhân\\b", RegexOption.IGNORE_CASE) to "ngấm thuốc đồng nhất",
        Regex("\\btrong\\s+hạn\\s+bình\\s+thường\\b", RegexOption.IGNORE_CASE) to "trong giới hạn bình thường",
        Regex("\\b(?:nhưng|nhân|như)\\s+mô\\b", RegexOption.IGNORE_CASE) to "nhu mô",
        Regex("\\bnút\\s+kính\\s+mờ\\b", RegexOption.IGNORE_CASE) to "nốt kính mờ",
        Regex("\\bnút\\s+đặc\\b", RegexOption.IGNORE_CASE) to "nốt đặc",
        Regex("\\b(?:fly|flai|fe\\s*le)\\b", RegexOption.IGNORE_CASE) to "FLAIR",
        Regex("\\bthuỷ\\s+(trán|thái\\s+dương|đỉnh|chẩm|nhộng|dưới|trên|giữa|gan|thận|phổi)\\b", RegexOption.IGNORE_CASE) to "thùy $1",
        Regex("\\b(?:khai|khải|hai|hại|hạ)\\s+phân\\s+(?:thuỷ|thùy|thuy|thuỳ)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy",
        Regex("\\b(?:hạ\\s+phân\\s+thùy|phân\\s+thùy|hpt)\\s+(?:một|1)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy I",
        Regex("\\b(?:hạ\\s+phân\\s+thùy|phân\\s+thùy|hpt)\\s+(?:hai|2)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy II",
        Regex("\\b(?:hạ\\s+phân\\s+thùy|phân\\s+thùy|hpt)\\s+(?:ba|3)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy III",
        Regex("\\b(?:hạ\\s+phân\\s+thùy|phân\\s+thùy|hpt)\\s+(?:bốn|tư|4)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy IV",
        Regex("\\b(?:hạ\\s+phân\\s+thùy|phân\\s+thùy|hpt)\\s+(?:năm|5)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy V",
        Regex("\\b(?:hạ\\s+phân\\s+thùy|phân\\s+thùy|hpt)\\s+(?:sáu|6)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy VI",
        Regex("\\b(?:hạ\\s+phân\\s+thùy|phân\\s+thùy|hpt)\\s+(?:bảy|7)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy VII",
        Regex("\\b(?:hạ\\s+phân\\s+thùy|phân\\s+thùy|hpt)\\s+(?:tám|8)\\b", RegexOption.IGNORE_CASE) to "hạ phân thùy VIII",
        Regex("\\bgóc\\s+sơn\\s+lành\\b", RegexOption.IGNORE_CASE) to "góc sườn hoành",
        Regex("\\btràn\\s+dịch\\s+mỏng\\b", RegexOption.IGNORE_CASE) to "tràn dịch màng phổi",
        Regex("\\brãnh\\s+quận(?:\\s+não)?\\b", RegexOption.IGNORE_CASE) to "rãnh cuộn não",
        Regex("\\b(?:phù\\s+hợp\\s+)?(?:cho|theo)\\s+não\\s+tuổi\\s+già\\b", RegexOption.IGNORE_CASE) to "phù hợp teo não tuổi già",
        Regex("\\bxoang\\s+chán\\b", RegexOption.IGNORE_CASE) to "xoang trán",
        Regex("\\b(?:xương|xoang)\\s+hàm\\s+(?:xương|xoang)\\s+sàng\\b", RegexOption.IGNORE_CASE) to "xoang hàm, xoang sàng",
        Regex("\\bxương\\s+sàng\\b", RegexOption.IGNORE_CASE) to "xoang sàng",
        Regex("\\bxương\\s+bướm\\b", RegexOption.IGNORE_CASE) to "xoang bướm",
        Regex("\\b(?:từ|tử)\\s+mặt\\b", RegexOption.IGNORE_CASE) to "túi mật",
        Regex("\\bsỏi\\s+chẳng\\s+qua\\b", RegexOption.IGNORE_CASE) to "sỏi cản quang",
        Regex("\\btuỳ\\s+(kích\\s+thước|nhu\\s+mô|đồng\\s+nhất)\\b", RegexOption.IGNORE_CASE) to "tụy $1",
        Regex("\\b(?:christong|clitsung|clit\\s+sung|quýt\\s*xung|witt\\s*sung|vua\\s*xung|cris\\s*tong|crit\\s*sung|chrit\\s*sung)\\b", RegexOption.IGNORE_CASE) to "Wirsung",
        Regex("\\bkhu\\s+chú\\b", RegexOption.IGNORE_CASE) to "khu trú",
        Regex("\\bthì\\s+(dưới|trên|giữa)\\s+phổi\\b", RegexOption.IGNORE_CASE) to "thùy $1 phổi",
        Regex("\\bco\\s+keo\\b", RegexOption.IGNORE_CASE) to "co kéo",
        Regex("\\bqua\\s+màng\\s+phổi\\b", RegexOption.IGNORE_CASE) to "khoang màng phổi",
        Regex("\\bmuôn\\s+vị\\b", RegexOption.IGNORE_CASE) to "môn vị",
        Regex("\\b(?:hang|hai)\\s+môn\\s+vị\\b", RegexOption.IGNORE_CASE) to "hang - môn vị",
        Regex("\\btỉ\\s+trọng\\b", RegexOption.IGNORE_CASE) to "tỷ trọng",
        // Spoken punctuation deduction: "phải" as comma when between clinical descriptors/clauses
        Regex("\\s+(?:phẩy|phải)\\s+(nghĩ|không|giảm|tăng|kèm|di\\s+động|đường\\s+kính|kích\\s+thước|liên\\s+tục)\\b", RegexOption.IGNORE_CASE) to ", $1",
        Regex("\\b(dày|lan\\s+tỏa|lan\\s+toả|rõ|đều|liên\\s+tục|sâu|nhẹ|đồng\\s+nhất|bình\\s+thường|khu\\s+trú|mũn|gai|mm)\\s+(?:phẩy|phải)\\s+", RegexOption.IGNORE_CASE) to "$1, ",

        // Radiology Phonetics & Dialect calibration
        Regex("\\b(?:và|va)\\s+hoành\\b", RegexOption.IGNORE_CASE) to "vòm hoành",
        Regex("\\blềm\\s+hơi\\b", RegexOption.IGNORE_CASE) to "liềm hơi",
        Regex("\\btrồng\\s+ngắn\\b", RegexOption.IGNORE_CASE) to "chồng ngắn",
        Regex("\\bgóc\\s+(?:xương|sương)\\s+hoành\\b", RegexOption.IGNORE_CASE) to "góc sườn hoành",
        Regex("\\bdây\\s+chẳng\\s+chéo\\b", RegexOption.IGNORE_CASE) to "dây chằng chéo",
        Regex("\\bphùỷ\\s+xương\\b", RegexOption.IGNORE_CASE) to "phù tủy xương",
        Regex("\\bđối\\s+hoàng\\s+tử\\b", RegexOption.IGNORE_CASE) to "đối quang từ",
        Regex("\\btừ\\s+chán\\b", RegexOption.IGNORE_CASE) to "thùy trán",
        Regex("\\bba\\s+màng\\s+cứng\\b", RegexOption.IGNORE_CASE) to "bao màng cứng",
        Regex("\\b(?:tráng|cháng)\\s+đều\\b", RegexOption.IGNORE_CASE) to "sáng đều",
        Regex("\\bnãn\\s+thất\\b", RegexOption.IGNORE_CASE) to "não thất",

        Regex("\\bđộ\\s+một\\b", RegexOption.IGNORE_CASE) to "độ 1",
        Regex("\\bđộ\\s+hai\\b", RegexOption.IGNORE_CASE) to "độ 2",
        Regex("\\bđộ\\s+ba\\b", RegexOption.IGNORE_CASE) to "độ 3",
        Regex("\\bđộ\\s+bốn\\b", RegexOption.IGNORE_CASE) to "độ 4",
        Regex("\\bkhông\\s+đáy\\b", RegexOption.IGNORE_CASE) to "không thấy",
        Regex("\\bsơ\\s+vữa\\b", RegexOption.IGNORE_CASE) to "xơ vữa"
    )

    private val REPEATED_TRAILING_FILLERS = Regex(
        "(?:[.,\\s]+(?:đây\\s+này|đó\\s+thôi|bây\\s+giờ|dừng\\s+lại|được\\s+rồi|đây|này|đó|thôi|tôi|em|hết|xong|dừng|có|là|rồi|thì|ạ|nhé|nha)[.,\\s]*)+$",
        RegexOption.IGNORE_CASE
    )

    private val LEADING_FILLERS = Regex(
        "^(?:[.,\\s]*(?:đó|này|thì|à|ừ|ờ|dạ|vâng|rồi|xong)[.,\\s]+)+",
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
     * Cleans up leading acoustic click/filler words before dictation starts.
     */
    fun cleanLeadingFillers(text: String): String {
        var result = text.trim()
        while (LEADING_FILLERS.containsMatchIn(result)) {
            result = LEADING_FILLERS.replace(result, "")
        }
        return result.trim()
    }

    /**
     * Cleans up trailing verbal fillers when the doctor finishes dictating.
     */
    fun cleanTrailingFillers(text: String): String {
        var result = text
        while (REPEATED_TRAILING_FILLERS.containsMatchIn(result)) {
            result = REPEATED_TRAILING_FILLERS.replace(result, "")
        }
        result = result.trim()
        while (result.endsWith(".") || result.endsWith(",") || result.endsWith(";")) {
            result = result.dropLast(1).trim()
        }
        if (result.isNotEmpty() && !result.endsWith("?") && !result.endsWith("!")) {
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
