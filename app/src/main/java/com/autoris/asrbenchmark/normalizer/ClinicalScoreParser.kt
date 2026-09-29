package com.autoris.asrbenchmark.normalizer

import java.util.Locale

/**
 * Parser and normalizer for standardized radiology reporting scoring systems:
 * - BI-RADS (Breast Imaging Reporting and Data System, 0-6 with subcategories A, B, C)
 * - TI-RADS (Thyroid Imaging Reporting and Data System, 1-5)
 * - PI-RADS (Prostate Imaging Reporting and Data System, 1-5)
 * - LI-RADS (Liver Imaging Reporting and Data System, 1-5, M, TIV)
 * - ASPECTS (Alberta Stroke Program Early CT Score, 0-10)
 * - EF / LVEF (Ejection Fraction, 10-90%)
 */
object ClinicalScoreParser {

    private val BIRADS_REGEX = Regex("\\b(?:bi[-\\s]*rads?|birads)\\s*([0-6](?:[a-cA-C])?)\\b", RegexOption.IGNORE_CASE)
    private val TIRADS_REGEX = Regex("\\b(?:ti[-\\s]*rads?|tirads)\\s*([1-5])\\b", RegexOption.IGNORE_CASE)
    private val PIRADS_REGEX = Regex("\\b(?:pi[-\\s]*rads?|pirads)\\s*([1-5])\\b", RegexOption.IGNORE_CASE)
    private val LIRADS_REGEX = Regex("\\b(?:li[-\\s]*rads?|lirads)\\s*([1-5]|m|tiv)\\b", RegexOption.IGNORE_CASE)
    private val ASPECTS_REGEX = Regex("\\b(?:aspects?)\\s*([0-9]|10)(?:\\s*điểm)?\\b", RegexOption.IGNORE_CASE)
    private val LVEF_REGEX = Regex("\\b(?:lvef|ef)\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*(?:%|phần\\s*trăm)?\\b", RegexOption.IGNORE_CASE)

    fun parse(text: String): Pair<String, List<ParsedClinicalScore>> {
        var normalized = text
        val scores = mutableListOf<ParsedClinicalScore>()

        // 1. BI-RADS
        normalized = BIRADS_REGEX.replace(normalized) { match ->
            val raw = match.value
            val scoreVal = match.groupValues[1].uppercase(Locale.ROOT)
            val formatted = "BI-RADS $scoreVal"
            scores.add(ParsedClinicalScore(system = "BI-RADS", score = scoreVal, raw = raw, certainty = CertaintyLevel.EXPLICIT, isValid = true))
            formatted
        }

        // 2. TI-RADS
        normalized = TIRADS_REGEX.replace(normalized) { match ->
            val raw = match.value
            val scoreVal = match.groupValues[1]
            val formatted = "TI-RADS $scoreVal"
            scores.add(ParsedClinicalScore(system = "TI-RADS", score = scoreVal, raw = raw, certainty = CertaintyLevel.EXPLICIT, isValid = true))
            formatted
        }

        // 3. PI-RADS
        normalized = PIRADS_REGEX.replace(normalized) { match ->
            val raw = match.value
            val scoreVal = match.groupValues[1]
            val formatted = "PI-RADS $scoreVal"
            scores.add(ParsedClinicalScore(system = "PI-RADS", score = scoreVal, raw = raw, certainty = CertaintyLevel.EXPLICIT, isValid = true))
            formatted
        }

        // 4. LI-RADS
        normalized = LIRADS_REGEX.replace(normalized) { match ->
            val raw = match.value
            val scoreVal = match.groupValues[1].uppercase(Locale.ROOT)
            val formatted = "LI-RADS $scoreVal"
            scores.add(ParsedClinicalScore(system = "LI-RADS", score = scoreVal, raw = raw, certainty = CertaintyLevel.EXPLICIT, isValid = true))
            formatted
        }

        // 5. ASPECTS
        normalized = ASPECTS_REGEX.replace(normalized) { match ->
            val raw = match.value
            val scoreVal = match.groupValues[1]
            val formatted = "ASPECTS $scoreVal"
            scores.add(ParsedClinicalScore(system = "ASPECTS", score = scoreVal, raw = raw, certainty = CertaintyLevel.EXPLICIT, isValid = true))
            formatted
        }

        // 6. EF / LVEF
        normalized = LVEF_REGEX.replace(normalized) { match ->
            val raw = match.value
            val scoreVal = match.groupValues[1]
            val isLvef = raw.uppercase(Locale.ROOT).startsWith("LVEF")
            val system = if (isLvef) "LVEF" else "EF"
            val formatted = "$system $scoreVal%"
            scores.add(ParsedClinicalScore(system = system, score = "$scoreVal%", raw = raw, certainty = CertaintyLevel.EXPLICIT, isValid = true))
            formatted
        }

        return Pair(normalized, scores)
    }
}
