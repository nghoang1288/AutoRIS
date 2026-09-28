package com.autoris.asrbenchmark.normalizer

object MeasurementParser {

    /**
     * Normalizes single measurements, clinical units, and contextual defaults.
     * E.g.:
     * - "đường kính 15" -> "đường kính 15 mm"
     * - "dày 4" -> "dày 4 mm"
     * - "15mi li mét" -> "15 mm"
     * - "2.5 xen ti mét" -> "2.5 cm"
     * - "tỷ trọng 45 hounsfield" -> "tỷ trọng 45 HU"
     */
    fun parse(text: String): String {
        var result = text

        // 1. Standardize unit spoken words
        result = result.replace(Regex("\\b(?:mi\\s*li\\s*mét|milimet|mi\\s*li)\\b", RegexOption.IGNORE_CASE), "mm")
        result = result.replace(Regex("\\b(?:xen\\s*ti\\s*mét|centimet|xen\\s*ti)\\b", RegexOption.IGNORE_CASE), "cm")
        result = result.replace(Regex("\\b(?:hounsfield|đơn\\s+vị\\s+hounsfield)\\b", RegexOption.IGNORE_CASE), "HU")

        // 2. Contextual radiology defaults without unit -> append "mm"
        // e.g. "đường kính 12", "dày 3", "sâu 5", "kích thước 15"
        val contextualRegex = Regex(
            "\\b(đường\\s+kính|dày|sâu|kích\\s+thước)\\s+(\\d+(?:\\.\\d+)?)(?!\\s*(?:mm|cm|m|%|ml|HU|×|x|nhân))\\b",
            RegexOption.IGNORE_CASE
        )
        result = contextualRegex.replace(result) { m ->
            "${m.groupValues[1]} ${m.groupValues[2]} mm"
        }

        // 3. Ensure clean spacing between digit and unit: "15mm" -> "15 mm"
        val spacingRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m|HU)\\b", RegexOption.IGNORE_CASE)
        result = spacingRegex.replace(result) { m ->
            "${m.groupValues[1]} ${m.groupValues[2]}"
        }

        return result
    }
}
