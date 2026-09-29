package com.autoris.asrbenchmark.normalizer

import java.util.Locale

object VietnameseNumberParser {

    val DIGIT_WORDS = mapOf(
        "không" to 0, "một" to 1, "mốt" to 1, "hai" to 2, "ba" to 3, "bốn" to 4, "tư" to 4,
        "năm" to 5, "lăm" to 5, "nhăm" to 5, "sáu" to 6, "bảy" to 7, "tám" to 8, "chín" to 9
    )

    private val DIGIT_STR_MAP = mapOf(
        "không" to "0", "một" to "1", "mốt" to "1", "hai" to "2", "ba" to "3", "bốn" to "4", "tư" to "4",
        "năm" to "5", "lăm" to "5", "nhăm" to "5", "sáu" to "6", "bảy" to "7", "tám" to "8", "chín" to "9"
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
     * Converts spoken Vietnamese numbers into Arabic digits.
     */
    fun parse(text: String): String {
        var result = text

        // 1. Hundreds: "[dWord] trăm [tens] [unit]" or "[dWord] trăm [tens]" or "[dWord] trăm"
        for ((dWord, dVal) in DIGIT_WORDS) {
            if (dVal == 0) continue
            // "một trăm hai mươi lăm" -> 125
            for ((tWord, tVal) in TENS_WORDS) {
                for ((uWord, uVal) in UNITS_WORDS) {
                    val p = Regex("\\b$dWord\\s+trăm\\s+$tWord(?:\\s+mươi)?\\s+$uWord\\b", RegexOption.IGNORE_CASE)
                    result = p.replace(result, (dVal * 100 + tVal + uVal).toString())
                }
                val pTens = Regex("\\b$dWord\\s+trăm\\s+$tWord\\s+(?:mươi|chục)\\b", RegexOption.IGNORE_CASE)
                result = pTens.replace(result, (dVal * 100 + tVal).toString())
            }
            // "một trăm lẻ năm" / "một trăm linh năm" -> 105
            for ((uWord, uVal) in UNITS_WORDS) {
                val pLe = Regex("\\b$dWord\\s+trăm\\s+(?:lẻ|linh)\\s+$uWord\\b", RegexOption.IGNORE_CASE)
                result = pLe.replace(result, (dVal * 100 + uVal).toString())
            }
            // "hai trăm" -> 200
            val pHundredOnly = Regex("\\b$dWord\\s+trăm\\b", RegexOption.IGNORE_CASE)
            result = pHundredOnly.replace(result, (dVal * 100).toString())
        }

        // 2. Teens: "mười [unit]" (11 - 19)
        for ((uWord, uVal) in UNITS_WORDS) {
            val teenPattern = Regex("\\bmười\\s+$uWord\\b", RegexOption.IGNORE_CASE)
            result = teenPattern.replace(result, (10 + uVal).toString())
        }
        result = result.replace(Regex("\\bmười\\b", RegexOption.IGNORE_CASE), "10")

        // 3. Tens & compounds: "hai mươi mốt" / "hai mốt" -> 21, "ba lăm" -> 35
        for ((tWord, tVal) in TENS_WORDS) {
            for ((uWord, uVal) in UNITS_WORDS) {
                val compoundPattern = Regex("\\b$tWord(?:\\s+mươi)?\\s+$uWord\\b", RegexOption.IGNORE_CASE)
                if (compoundPattern.containsMatchIn(result)) {
                    val numVal = tVal + uVal
                    result = compoundPattern.replace(result, numVal.toString())
                }
            }
            val tensOnlyPattern = Regex("\\b$tWord\\s+(?:mươi|chục)\\b", RegexOption.IGNORE_CASE)
            result = tensOnlyPattern.replace(result, tVal.toString())
        }

        // 4. Decimals: handles word-word, digit-word, word-digit, digit-digit
        // e.g. "hai phẩy năm" -> 2.5, "15 chấm hai" -> 15.2, "0 phẩy 5" -> 0.5
        val decWordWord = Regex("\\b([a-zA-ZÀ-ỹ]+)\\s+(?:phẩy|chấm)\\s+([a-zA-ZÀ-ỹ]+)\\b", RegexOption.IGNORE_CASE)
        result = decWordWord.replace(result) { m ->
            val w1 = m.groupValues[1].lowercase(Locale.ROOT)
            val w2 = m.groupValues[2].lowercase(Locale.ROOT)
            val d1 = DIGIT_STR_MAP[w1]
            val d2 = DIGIT_STR_MAP[w2]
            if (d1 != null && d2 != null) "$d1.$d2" else m.value
        }

        val decDigitWord = Regex("(\\d+)\\s+(?:phẩy|chấm)\\s+([a-zA-ZÀ-ỹ]+)\\b", RegexOption.IGNORE_CASE)
        result = decDigitWord.replace(result) { m ->
            val num = m.groupValues[1]
            val w = m.groupValues[2].lowercase(Locale.ROOT)
            val d = DIGIT_STR_MAP[w]
            if (d != null) "$num.$d" else m.value
        }

        val decWordDigit = Regex("\\b([a-zA-ZÀ-ỹ]+)\\s+(?:phẩy|chấm)\\s+(\\d+)", RegexOption.IGNORE_CASE)
        result = decWordDigit.replace(result) { m ->
            val w = m.groupValues[1].lowercase(Locale.ROOT)
            val num = m.groupValues[2]
            val d = DIGIT_STR_MAP[w]
            if (d != null) "$d.$num" else m.value
        }

        val decDigitDigit = Regex("(\\d+)\\s+(?:phẩy|chấm)\\s+(\\d+)", RegexOption.IGNORE_CASE)
        result = decDigitDigit.replace(result, "$1.$2")

        // 5. Negative numbers: "âm [num|word]" -> "-[num]"
        val negPattern = Regex("\\bâm\\s+([a-zA-ZÀ-ỹ0-9.]+)\\b", RegexOption.IGNORE_CASE)
        result = negPattern.replace(result) { m ->
            val v = m.groupValues[1].lowercase(Locale.ROOT)
            val d = DIGIT_STR_MAP[v]
            if (d != null) {
                "-$d"
            } else if (v.toDoubleOrNull() != null) {
                "-$v"
            } else {
                m.value // Retain clinical terms like "âm tính", "âm vang", "âm đạo"
            }
        }

        // 6. Single digit words immediately before measurement units: e.g. "năm mm" -> "5 mm"
        for ((dWord, dVal) in DIGIT_WORDS) {
            val singleUnit = Regex("\\b$dWord\\s*(mm|cm|m|ml|l|%|HU)\\b", RegexOption.IGNORE_CASE)
            result = singleUnit.replace(result, "$dVal $1")
        }

        // 7. Single digit words after clinical dimension keywords: e.g. "đường kính chín" -> "đường kính 9"
        // MUST skip "không" (0) because "dày không đều", "không to", "không ngấm thuốc" are clinical negations, never 0 mm!
        val dimKeywords = "(?:đường\\s+kính|kích\\s+thước|dày|sâu|rộng|dài|cao|nhỏ\\s+hơn|lớn\\s+hơn)"
        for ((dWord, dVal) in DIGIT_WORDS) {
            if (dVal == 0) continue // Skip "không"
            val dimPattern = Regex("\\b($dimKeywords)\\s+$dWord\\b", RegexOption.IGNORE_CASE)
            result = dimPattern.replace(result, "$1 $dVal")
        }

        // 8. Spoken decimal fractions: e.g. "nhỏ hơn không năm" -> "nhỏ hơn 0.5"
        val zeroFivePattern = Regex("\\b((?:nhỏ\\s+hơn|lớn\\s+hơn|bằng|chỉ\\s+số|tỷ\\s+lệ)\\s+)không\\s+năm\\b", RegexOption.IGNORE_CASE)
        result = zeroFivePattern.replace(result, "$10.5")

        return result
    }
}
