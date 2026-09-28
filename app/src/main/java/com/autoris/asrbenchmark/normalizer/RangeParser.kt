package com.autoris.asrbenchmark.normalizer

object RangeParser {

    /**
     * Normalizes numerical ranges.
     * E.g.:
     * - "từ 5 đến 10 mm" -> "5 - 10 mm"
     * - "khoảng 3 đến 4 cm" -> "khoảng 3 - 4 cm"
     * - "10-15 mm" -> "10 - 15 mm"
     */
    fun parse(text: String): String {
        var result = text

        // "từ N1 đến N2 [unit]" -> "N1 - N2 [unit]"
        val fromToUnitRegex = Regex(
            "\\btừ\\s+(\\d+(?:\\.\\d+)?)\\s+đến\\s+(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m|%|ml|HU|hu)?\\b",
            RegexOption.IGNORE_CASE
        )
        result = fromToUnitRegex.replace(result) { m ->
            val n1 = m.groupValues[1]
            val n2 = m.groupValues[2]
            val unit = m.groupValues[3]
            if (unit.isNotEmpty()) "$n1 - $n2 $unit" else "$n1 - $n2"
        }

        // "[prefix] N1 đến N2 [unit]" e.g. "khoảng 3 đến 4 cm"
        val prefixRangeRegex = Regex(
            "(\\d+(?:\\.\\d+)?)\\s+đến\\s+(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m|%|ml|HU|hu)?\\b",
            RegexOption.IGNORE_CASE
        )
        result = prefixRangeRegex.replace(result) { m ->
            val n1 = m.groupValues[1]
            val n2 = m.groupValues[2]
            val unit = m.groupValues[3]
            if (unit.isNotEmpty()) "$n1 - $n2 $unit" else "$n1 - $n2"
        }

        // "N1-N2 mm" with missing spaces
        val dashRangeRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*-\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m|%|ml|HU|hu)\\b", RegexOption.IGNORE_CASE)
        result = dashRangeRegex.replace(result, "$1 - $2 $3")

        return result
    }
}
