package com.autoris.asrbenchmark.normalizer

object VolumeParser {

    /**
     * Normalizes fluid/lesion volume measurements.
     * E.g.:
     * - "25 mi li lít" -> "25 ml"
     * - "khoảng 500 mililit" -> "khoảng 500 ml"
     * - "thể tích 30 cm khối" -> "thể tích 30 ml"
     */
    fun parse(text: String): String {
        var result = text

        val mlRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*(?:mi\\s*li\\s*lít|mililit|mili\\s*lít)\\b", RegexOption.IGNORE_CASE)
        result = mlRegex.replace(result, "$1 ml")

        val ccRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*(?:xen\\s*ti\\s*mét\\s*khối|cm\\s*khối|cm3|cc)\\b", RegexOption.IGNORE_CASE)
        result = ccRegex.replace(result, "$1 ml")

        val literRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*(?:lít)\\b", RegexOption.IGNORE_CASE)
        result = literRegex.replace(result, "$1 l")

        return result
    }
}
