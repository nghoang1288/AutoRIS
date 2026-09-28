package com.autoris.asrbenchmark.normalizer

object PercentageParser {

    /**
     * Normalizes percentage expressions.
     * E.g.:
     * - "70 phần trăm" -> "70%"
     * - "hẹp khoảng 50 %" -> "hẹp khoảng 50%"
     */
    fun parse(text: String): String {
        var result = text

        // Replace "phần trăm" with "%"
        val ptRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*phần\\s*trăm\\b", RegexOption.IGNORE_CASE)
        result = ptRegex.replace(result, "$1%")

        // Standardize spacing: "N %" -> "N%"
        val pctSpacingRegex = Regex("(\\d+(?:\\.\\d+)?)\\s+%", RegexOption.IGNORE_CASE)
        result = pctSpacingRegex.replace(result, "$1%")

        return result
    }
}
