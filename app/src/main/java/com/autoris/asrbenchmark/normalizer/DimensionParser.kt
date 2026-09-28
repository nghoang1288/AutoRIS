package com.autoris.asrbenchmark.normalizer

object DimensionParser {

    private val DIGIT_WORDS = mapOf(
        "không" to "0", "một" to "1", "mốt" to "1", "hai" to "2", "ba" to "3",
        "bốn" to "4", "tư" to "4", "năm" to "5", "lăm" to "5", "nhăm" to "5",
        "sáu" to "6", "bảy" to "7", "tám" to "8", "chín" to "9"
    )

    /**
     * Normalizes 2D and 3D lesion dimensions.
     * Standardizes delimiter to "×".
     * E.g.:
     * - "21 x 8" -> "21 × 8 mm"
     * - "21 nhân tám" -> "21 × 8 mm"
     * - "15 nhân 20 mm" -> "15 × 20 mm"
     * - "10 x 15 x 20" -> "10 × 15 × 20 mm"
     * - "1.5 x 2.3 cm" -> "1.5 × 2.3 cm"
     */
    fun parse(text: String): String {
        var result = text

        // Convert word numbers adjacent to dimension markers
        for ((w, d) in DIGIT_WORDS) {
            result = result.replace(Regex("\\b$w\\s+(?:x|×|nhân)\\s+", RegexOption.IGNORE_CASE), "$d × ")
            result = result.replace(Regex("(\\d+(?:\\.\\d+)?)\\s*(?:x|×|nhân)\\s*$w\\b", RegexOption.IGNORE_CASE), "$1 × $d")
        }

        // 1. 3D Dimensions: "N1 x N2 x N3 [unit]?"
        val dim3DRegex = Regex(
            "\\b(\\d+(?:\\.\\d+)?)\\s*(?:x|×|nhân)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:x|×|nhân)\\s*(\\d+(?:\\.\\d+)?)(?:\\s*(mm|cm|m))?\\b",
            RegexOption.IGNORE_CASE
        )
        result = dim3DRegex.replace(result) { m ->
            val n1 = m.groupValues[1]
            val n2 = m.groupValues[2]
            val n3 = m.groupValues[3]
            val unit = m.groupValues[4].ifEmpty { "mm" }
            "$n1 × $n2 × $n3 $unit"
        }

        // 2. 2D Dimensions: "N1 x N2 [unit]?" - with \b and lookahead so 3D isn't split
        val dim2DRegex = Regex(
            "\\b(\\d+(?:\\.\\d+)?)\\s*(?:x|×|nhân)\\s*(\\d+(?:\\.\\d+)?)\\b(?!\\s*(?:x|×|nhân))(?:\\s*(mm|cm|m))?\\b",
            RegexOption.IGNORE_CASE
        )
        result = dim2DRegex.replace(result) { m ->
            val n1 = m.groupValues[1]
            val n2 = m.groupValues[2]
            val unit = m.groupValues[3].ifEmpty { "mm" }
            "$n1 × $n2 $unit"
        }

        return result
    }
}
