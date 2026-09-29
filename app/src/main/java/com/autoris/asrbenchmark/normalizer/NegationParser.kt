package com.autoris.asrbenchmark.normalizer

import java.util.Locale

/**
 * Parser for clinical negations and scope identification.
 * Ensures negation markers ('không thấy', 'chưa thấy', 'không có', 'loại trừ')
 * are strictly preserved and explicitly structured.
 */
object NegationParser {

    private val NEGATION_TRIGGERS = listOf(
        "không thấy",
        "chưa thấy",
        "không có",
        "loại trừ",
        "không phát hiện",
        "chưa phát hiện",
        "không sỏi",
        "không dày",
        "không to",
        "chưa to",
        "không giãn",
        "không vôi hóa",
        "không tràn dịch",
        "không tràn khí",
        "không ngấm thuốc"
    )

    fun parse(text: String): List<ParsedNegation> {
        val lower = text.lowercase(Locale.ROOT)
        val negations = mutableListOf<ParsedNegation>()

        for (trigger in NEGATION_TRIGGERS) {
            var searchStart = 0
            while (searchStart < lower.length) {
                val idx = lower.indexOf(trigger, searchStart)
                if (idx == -1) break

                val scopeStart = idx + trigger.length
                val nextPunct = lower.indexOfAny(charArrayOf(',', ';', '.', '\n'), scopeStart).let { if (it == -1) lower.length else it }
                val cleanedScope = lower.substring(scopeStart, nextPunct).trim()

                negations.add(
                    ParsedNegation(
                        trigger = trigger,
                        scopeText = cleanedScope,
                        certainty = CertaintyLevel.EXPLICIT
                    )
                )
                searchStart = idx + trigger.length
            }
        }

        return negations
    }
}
