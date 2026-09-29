package com.autoris.asrbenchmark.normalizer

import java.util.Locale

/**
 * Parser for laterality extraction and conflict checking in medical dictation.
 * Detects right/left/bilateral orientation and flags contradictory assignments.
 */
object LateralityParser {

    private val PAIRED_ANATOMY = listOf(
        "thận", "thận phải", "thận trái",
        "phổi", "phổi phải", "phổi trái",
        "thùy gan", "buồng trứng", "tuyến thượng thận",
        "khớp háng", "khớp gối", "khớp vai",
        "niệu quản", "bán cầu đại não", "động mạch cảnh",
        "động mạch khoeo", "tĩnh mạch đùi", "mắt", "tai", "tay", "chân"
    )

    private val RIGHT_REGEX = Regex("\\b(?:bên\\s+phải|phía\\s+phải|ở\\s+phải|phải)\\b", RegexOption.IGNORE_CASE)
    private val LEFT_REGEX = Regex("\\b(?:bên\\s+trái|phía\\s+trái|ở\\s+trái|trái)\\b", RegexOption.IGNORE_CASE)
    private val BILATERAL_REGEX = Regex("\\b(?:hai\\s+bên|cả\\s+hai\\s+bên|đôi\\s+bên)\\b", RegexOption.IGNORE_CASE)

    fun parse(text: String): Pair<List<ParsedLaterality>, Boolean> {
        val lower = text.lowercase(Locale.ROOT)
        val results = mutableListOf<ParsedLaterality>()
        var hasConflict = false

        // Check each paired anatomy term
        for (target in PAIRED_ANATOMY) {
            val targetIdx = lower.indexOf(target)
            if (targetIdx != -1) {
                // Look around the target window (-25 to +25 chars)
                val start = maxOf(0, targetIdx - 25)
                val end = minOf(lower.length, targetIdx + target.length + 25)
                val window = lower.substring(start, end)

                val hasRight = RIGHT_REGEX.containsMatchIn(window)
                val hasLeft = LEFT_REGEX.containsMatchIn(window)
                val hasBilateral = BILATERAL_REGEX.containsMatchIn(window)

                if (hasBilateral) {
                    results.add(ParsedLaterality(LateralityType.BILATERAL, target, window, isContradictory = false))
                } else if (hasRight && hasLeft) {
                    // Contradiction in the same local window for a single anatomy!
                    hasConflict = true
                    results.add(ParsedLaterality(LateralityType.UNSPECIFIED, target, window, isContradictory = true))
                } else if (hasRight) {
                    results.add(ParsedLaterality(LateralityType.RIGHT, target, window, isContradictory = false))
                } else if (hasLeft) {
                    results.add(ParsedLaterality(LateralityType.LEFT, target, window, isContradictory = false))
                }
            }
        }

        return Pair(results, hasConflict)
    }
}
