package com.autoris.asrbenchmark.normalizer

import java.util.Locale

object SpineLevelParser {

    private val DIGIT_MAP = mapOf(
        "một" to "1", "hai" to "2", "ba" to "3", "bốn" to "4", "tư" to "4",
        "năm" to "5", "lăm" to "5", "sáu" to "6", "bảy" to "7", "tám" to "8", "chín" to "9",
        "mười" to "10", "mười một" to "11", "mười hai" to "12"
    )

    /**
     * Normalizes spine levels (C, D, T, L, S) before general number substitution.
     */
    fun parse(text: String): String {
        var result = text

        // 1. Dual spine levels with word numbers: e.g. "L bốn năm", "L bốn L năm", "L năm S một"
        val dualSpineRegex = Regex(
            "\\b([LCDSTlcdst])\\s+(một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|mười\\s+hai|mười\\s+một|mười)\\s*(?:-|gạch|đến)?\\s*(?:([LCDSTlcdst])\\s+)?(một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|mười\\s+hai|mười\\s+một|mười)\\b",
            RegexOption.IGNORE_CASE
        )
        result = dualSpineRegex.replace(result) { m ->
            val p1 = m.groupValues[1].uppercase(Locale.ROOT)
            val d1Raw = m.groupValues[2].lowercase(Locale.ROOT).trim()
            val p2Raw = m.groupValues[3].uppercase(Locale.ROOT)
            val d2Raw = m.groupValues[4].lowercase(Locale.ROOT).trim()

            val d1 = DIGIT_MAP[d1Raw] ?: d1Raw
            val d2 = DIGIT_MAP[d2Raw] ?: d2Raw
            val p2 = if (p2Raw.isNotEmpty()) p2Raw else p1

            "$p1$d1-$p2$d2"
        }

        // 2. Dual spine levels already in digit form: "L4 L5", "L4/L5", "L4 - L5", "L4-5" -> "L4-L5"
        val dualDigitSpine = Regex("\\b([LCDST])(\\d+)\\s*(?:/|-|–|gạch|đến|\\s+)\\s*(?:([LCDST]))?(\\d+)\\b")
        result = dualDigitSpine.replace(result) { m ->
            val p1 = m.groupValues[1]
            val d1 = m.groupValues[2]
            val p2Raw = m.groupValues[3]
            val d2 = m.groupValues[4]
            val p2 = if (p2Raw.isNotEmpty()) p2Raw else p1
            "$p1$d1-$p2$d2"
        }

        // 3. Single spine level: "L bốn" -> "L4", "C năm" -> "C5", "D mười hai" -> "D12", "S một" -> "S1"
        for ((word, digit) in DIGIT_MAP) {
            val singleRegex = Regex("\\b([LCDSTlcdst])\\s+$word\\b", RegexOption.IGNORE_CASE)
            result = singleRegex.replace(result) { m ->
                "${m.groupValues[1].uppercase(Locale.ROOT)}$digit"
            }
        }

        return result
    }
}
