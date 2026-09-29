package com.autoris.asrbenchmark.normalizer

import java.util.Locale

/**
 * Parser for laterality extraction and conflict checking in medical dictation.
 * Detects right/left/bilateral orientation and flags contradictory assignments.
 */
object LateralityParser {

    private val PAIRED_ANATOMY = listOf(
        "tuyến thượng thận", "bán cầu đại não", "động mạch cảnh",
        "động mạch khoeo", "tĩnh mạch đùi", "rễ thần kinh",
        "thận phải", "thận trái", "phổi phải", "phổi trái", "gan phải", "gan trái",
        "buồng trứng", "khớp háng", "khớp gối", "khớp vai",
        "niệu quản", "thùy gan", "đĩa đệm",
        "thận", "phổi", "gan", "rễ", "mắt", "tai", "tay", "chân"
    )

    private val RIGHT_REGEX = Regex("\\b(?:bên\\s+phải|phía\\s+phải|ở\\s+phải|phải)\\b", RegexOption.IGNORE_CASE)
    private val LEFT_REGEX = Regex("\\b(?:bên\\s+trái|phía\\s+trái|ở\\s+trái|trái)\\b", RegexOption.IGNORE_CASE)
    private val BILATERAL_REGEX = Regex("\\b(?:hai\\s+bên|cả\\s+hai\\s+bên|đôi\\s+bên)\\b", RegexOption.IGNORE_CASE)

    fun getBaseAnatomyTarget(target: String): String {
        return when {
            target.startsWith("thận") -> "thận"
            target.startsWith("phổi") -> "phổi"
            target.startsWith("gan") -> "gan"
            target.startsWith("rễ") -> "rễ"
            else -> target
        }
    }

    fun parse(text: String): Pair<List<ParsedLaterality>, Boolean> {
        val lower = text.lowercase(Locale.ROOT)
        val results = mutableListOf<ParsedLaterality>()
        var hasConflict = false
        val matchedSpans = mutableListOf<IntRange>()

        // Check each paired anatomy term (sorted by descending length)
        for (target in PAIRED_ANATOMY.sortedByDescending { it.length }) {
            var searchFrom = 0
            while (searchFrom < lower.length) {
                val targetIdx = lower.indexOf(target, searchFrom)
                if (targetIdx == -1) break

                val targetRange = targetIdx until (targetIdx + target.length)
                val overlaps = matchedSpans.any { it.first <= targetRange.last && targetRange.first <= it.last }
                if (!overlaps) {
                    // Look around the target window (-25 to +25 chars)
                    val start = maxOf(0, targetIdx - 25)
                    val end = minOf(lower.length, targetIdx + target.length + 25)
                    val window = lower.substring(start, end)

                    val hasRight = RIGHT_REGEX.containsMatchIn(window)
                    val hasLeft = LEFT_REGEX.containsMatchIn(window)
                    val hasBilateral = BILATERAL_REGEX.containsMatchIn(window)

                    val baseTarget = getBaseAnatomyTarget(target)

                    if (hasBilateral) {
                        results.add(ParsedLaterality(LateralityType.BILATERAL, baseTarget, window, isContradictory = false))
                        matchedSpans.add(targetRange)
                    } else if (hasRight && hasLeft) {
                        // Contradiction in the same local window for a single anatomy!
                        hasConflict = true
                        results.add(ParsedLaterality(LateralityType.UNSPECIFIED, baseTarget, window, isContradictory = true))
                        matchedSpans.add(targetRange)
                    } else if (hasRight) {
                        results.add(ParsedLaterality(LateralityType.RIGHT, baseTarget, window, isContradictory = false))
                        matchedSpans.add(targetRange)
                    } else if (hasLeft) {
                        results.add(ParsedLaterality(LateralityType.LEFT, baseTarget, window, isContradictory = false))
                        matchedSpans.add(targetRange)
                    }
                }
                searchFrom = targetIdx + target.length
            }
        }

        // Fallback: If no specific paired organ matched, but explicit directional cue exists
        if (results.isEmpty()) {
            val clauses = lower.split(Regex("[,.;\\n]")).map { it.trim() }.filter { it.isNotEmpty() }
            for (clause in clauses) {
                val hasRight = RIGHT_REGEX.containsMatchIn(clause)
                val hasLeft = LEFT_REGEX.containsMatchIn(clause)
                val hasBilateral = BILATERAL_REGEX.containsMatchIn(clause)

                if (hasBilateral) {
                    results.add(ParsedLaterality(LateralityType.BILATERAL, "chung", clause, isContradictory = false))
                } else if (hasRight && hasLeft) {
                    results.add(ParsedLaterality(LateralityType.UNSPECIFIED, "chung", clause, isContradictory = true))
                    hasConflict = true
                } else if (hasRight) {
                    results.add(ParsedLaterality(LateralityType.RIGHT, "chung", clause, isContradictory = false))
                } else if (hasLeft) {
                    results.add(ParsedLaterality(LateralityType.LEFT, "chung", clause, isContradictory = false))
                }
            }
        }

        return Pair(results, hasConflict)
    }
}
