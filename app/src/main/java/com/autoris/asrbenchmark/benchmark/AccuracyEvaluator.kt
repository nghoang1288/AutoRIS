package com.autoris.asrbenchmark.benchmark

import java.util.Locale
import kotlin.math.min

enum class DiffType {
    MATCH,
    INSERTION,
    DELETION,
    SUBSTITUTION
}

enum class FailureMode {
    NUMBER_MISMATCH,
    UNIT_MISMATCH,
    DIMENSION_MISMATCH,
    SPINE_LEVEL_MISMATCH,
    NEGATION_FLIP,
    LATERALITY_MISMATCH,
    CRITICAL_ANATOMY_OMISSION
}

data class TokenDiff(
    val type: DiffType,
    val refWord: String?,
    val hypWord: String?
)

data class MeasurementEntity(
    val value: Float,
    val unit: String
)

data class DimensionEntity(
    val dimensions: List<Float>,
    val unit: String
)

data class SpineLevelEntity(
    val text: String,
    val startLevel: String,
    val endLevel: String?
)

data class NegationEntity(
    val phrase: String
)

data class LateralityEntity(
    val side: String
)

data class EvaluationReport(
    val referenceText: String,
    val hypothesisText: String,
    val cer: Float,                     // Character Error Rate [0.0 - 1.0]
    val wer: Float,                     // Word Error Rate [0.0 - 1.0]
    val werRaw: Float? = null,
    val cerRaw: Float? = null,
    val werNormalized: Float = wer,
    val cerNormalized: Float = cer,
    val medicalTermAccuracy: Float,     // [0.0 - 1.0]
    val numericAccuracy: Float,         // [0.0 - 1.0]
    val measurementAccuracy: Float = numericAccuracy,
    val dimensionAccuracy: Float = 1.0f,
    val unitAccuracy: Float = 1.0f,
    val anatomyAccuracy: Float,         // [0.0 - 1.0]
    val lateralityAccuracy: Float = 1.0f,
    val negationAccuracy: Float,        // [0.0 - 1.0]
    val spineLevelAccuracy: Float = 1.0f,
    val matchedTerms: List<String>,
    val missedTerms: List<String>,
    val matchedNumbers: List<String>,
    val missedNumbers: List<String>,
    val diffTokens: List<TokenDiff>,

    // Zero-Tolerance Clinical Critical Error Flags
    val criticalNumericError: Boolean = false,
    val criticalMeasurementError: Boolean = false,
    val criticalNegationError: Boolean = false,
    val criticalLateralityError: Boolean = false,
    val criticalSpineError: Boolean = false,
    val failureModes: List<FailureMode> = emptyList()
) {
    fun hasCriticalError(): Boolean =
        criticalNumericError ||
        criticalMeasurementError ||
        criticalNegationError ||
        criticalLateralityError ||
        criticalSpineError ||
        failureModes.isNotEmpty()
}

object AccuracyEvaluator {

    private val NEGATION_KEYWORDS = listOf(
        "không thấy", "chưa thấy", "không giãn", "không huyết khối",
        "không ngấm thuốc", "không dày", "không to", "không có", "không tràn dịch", "không tràn khí", "loại trừ"
    )

    private val LATERALITY_KEYWORDS = listOf("phải", "trái", "hai bên", "bên phải", "bên trái")

    /**
     * Cleans text for comparison: lowercases, strips excess punctuation, normalizes spaces.
     */
    fun cleanText(text: String): String {
        return text.lowercase(Locale.ROOT)
            .replace(Regex("[,.:;!?'\"\\-_()]"), " ")
            .replace("\\s+".toRegex(), " ")
            .trim()
    }

    /**
     * Computes full evaluation comparing reference and ASR hypothesis.
     */
    fun evaluate(reference: String, hypothesis: String, testSentence: MedicalTestSentence? = null): EvaluationReport {
        val cleanRef = cleanText(reference)
        val cleanHyp = cleanText(hypothesis)

        val cer = computeCer(cleanRef, cleanHyp)
        val wer = computeWer(cleanRef, cleanHyp)
        val diffs = computeTokenDiff(cleanRef, cleanHyp)

        val failureModes = mutableListOf<FailureMode>()

        // 1. Evaluate key domain terms
        val keyTerms = testSentence?.keyTerms ?: emptyList()
        val keyNumbers = testSentence?.keyNumbers ?: emptyList()
        val keyAnatomy = testSentence?.keyAnatomy ?: emptyList()
        val keyNegations = testSentence?.keyNegations ?: emptyList()

        val matchedTerms = mutableListOf<String>()
        val missedTerms = mutableListOf<String>()
        for (term in keyTerms) {
            val termClean = cleanText(term)
            val termPattern = Regex("\\b" + Regex.escape(termClean) + "\\b")
            if (termPattern.containsMatchIn(cleanHyp)) {
                matchedTerms.add(term)
            } else {
                missedTerms.add(term)
            }
        }
        val termAcc = if (keyTerms.isNotEmpty()) matchedTerms.size.toFloat() / keyTerms.size else 1.0f

        // 2. Numeric comparison: STRICT token-level word boundary match (NO loose substring match)
        val matchedNumbers = mutableListOf<String>()
        val missedNumbers = mutableListOf<String>()
        for (num in keyNumbers) {
            val trimmedNum = num.trim()
            val numPattern = Regex("\\b" + Regex.escape(trimmedNum) + "\\b")
            if (numPattern.containsMatchIn(hypothesis) || numPattern.containsMatchIn(cleanHyp)) {
                matchedNumbers.add(num)
            } else {
                missedNumbers.add(num)
            }
        }
        val numAcc = if (keyNumbers.isNotEmpty()) matchedNumbers.size.toFloat() / keyNumbers.size else 1.0f
        val criticalNumericErr = missedNumbers.isNotEmpty()
        if (criticalNumericErr) {
            failureModes.add(FailureMode.NUMBER_MISMATCH)
        }

        // 3. Anatomy
        var matchedAnatomy = 0
        for (a in keyAnatomy) {
            val aPattern = Regex("\\b" + Regex.escape(cleanText(a)) + "\\b")
            if (aPattern.containsMatchIn(cleanHyp)) matchedAnatomy++
        }
        val anatomyAcc = if (keyAnatomy.isNotEmpty()) matchedAnatomy.toFloat() / keyAnatomy.size else 1.0f
        if (keyAnatomy.isNotEmpty() && matchedAnatomy < keyAnatomy.size) {
            failureModes.add(FailureMode.CRITICAL_ANATOMY_OMISSION)
        }

        // 4. Negations (Zero Tolerance)
        val refNegations = if (keyNegations.isNotEmpty()) keyNegations else extractNegations(reference)
        var matchedNegations = 0
        var criticalNegationErr = false
        for (n in refNegations) {
            val nPattern = Regex("\\b" + Regex.escape(cleanText(n)) + "\\b")
            if (nPattern.containsMatchIn(cleanHyp)) {
                matchedNegations++
            } else {
                criticalNegationErr = true
            }
        }
        val negationAcc = if (refNegations.isNotEmpty()) matchedNegations.toFloat() / refNegations.size else 1.0f
        if (criticalNegationErr) {
            failureModes.add(FailureMode.NEGATION_FLIP)
        }

        // 5. Laterality (Zero Tolerance: Left vs Right flip)
        val refSides = extractLaterality(reference)
        val hypSides = extractLaterality(hypothesis)
        var matchedSides = 0
        var criticalLateralityErr = false
        for (side in refSides) {
            if (hypSides.any { it.side == side.side }) {
                matchedSides++
            } else {
                criticalLateralityErr = true
            }
        }
        val lateralityAcc = if (refSides.isNotEmpty()) matchedSides.toFloat() / refSides.size else 1.0f
        if (criticalLateralityErr) {
            failureModes.add(FailureMode.LATERALITY_MISMATCH)
        }

        // 6. Spine Levels (Zero Tolerance: L4-L5 vs L5-S1)
        val refSpine = extractSpineLevels(reference)
        val hypSpine = extractSpineLevels(hypothesis)
        var matchedSpine = 0
        var criticalSpineErr = false
        for (sp in refSpine) {
            if (hypSpine.any { it.text.equals(sp.text, ignoreCase = true) }) {
                matchedSpine++
            } else {
                criticalSpineErr = true
            }
        }
        val spineAcc = if (refSpine.isNotEmpty()) matchedSpine.toFloat() / refSpine.size else 1.0f
        if (criticalSpineErr) {
            failureModes.add(FailureMode.SPINE_LEVEL_MISMATCH)
        }

        // 7. Structured Dimensions and Units (Zero Tolerance: 21x8 cm vs 21x8 mm)
        val refDims = extractDimensions(reference)
        val hypDims = extractDimensions(hypothesis)
        var matchedDims = 0
        var matchedUnits = 0
        var criticalMeasurementErr = false
        for (dim in refDims) {
            val exactMatch = hypDims.firstOrNull { it.dimensions == dim.dimensions && it.unit.equals(dim.unit, ignoreCase = true) }
            if (exactMatch != null) {
                matchedDims++
                matchedUnits++
            } else {
                criticalMeasurementErr = true
                val unitMismatch = hypDims.firstOrNull { it.dimensions == dim.dimensions && !it.unit.equals(dim.unit, ignoreCase = true) }
                if (unitMismatch != null) {
                    failureModes.add(FailureMode.UNIT_MISMATCH)
                } else {
                    failureModes.add(FailureMode.DIMENSION_MISMATCH)
                }
            }
        }
        val dimensionAcc = if (refDims.isNotEmpty()) matchedDims.toFloat() / refDims.size else 1.0f
        val unitAcc = if (refDims.isNotEmpty()) matchedUnits.toFloat() / refDims.size else 1.0f
        val measurementAcc = if (refDims.isNotEmpty()) dimensionAcc else numAcc

        return EvaluationReport(
            referenceText = reference,
            hypothesisText = hypothesis,
            cer = cer,
            wer = wer,
            werRaw = null,
            cerRaw = null,
            werNormalized = wer,
            cerNormalized = cer,
            medicalTermAccuracy = termAcc,
            numericAccuracy = numAcc,
            measurementAccuracy = measurementAcc,
            dimensionAccuracy = dimensionAcc,
            unitAccuracy = unitAcc,
            anatomyAccuracy = anatomyAcc,
            lateralityAccuracy = lateralityAcc,
            negationAccuracy = negationAcc,
            spineLevelAccuracy = spineAcc,
            matchedTerms = matchedTerms,
            missedTerms = missedTerms,
            matchedNumbers = matchedNumbers,
            missedNumbers = missedNumbers,
            diffTokens = diffs,
            criticalNumericError = criticalNumericErr,
            criticalMeasurementError = criticalMeasurementErr,
            criticalNegationError = criticalNegationErr,
            criticalLateralityError = criticalLateralityErr,
            criticalSpineError = criticalSpineErr,
            failureModes = failureModes
        )
    }

    /**
     * Extracts structured dimensions (e.g. "21 × 8 mm", "10 × 15 × 20 mm", "21 x 8 mm").
     */
    fun extractDimensions(text: String): List<DimensionEntity> {
        val list = mutableListOf<DimensionEntity>()
        val regex3D = Regex("(\\d+(?:\\.\\d+)?)\\s*[×x]\\s*(\\d+(?:\\.\\d+)?)\\s*[×x]\\s*(\\d+(?:\\.\\d+)?)(?:\\s*(mm|cm|m))?", RegexOption.IGNORE_CASE)
        regex3D.findAll(text).forEach { m ->
            val v1 = m.groupValues[1].toFloatOrNull() ?: 0f
            val v2 = m.groupValues[2].toFloatOrNull() ?: 0f
            val v3 = m.groupValues[3].toFloatOrNull() ?: 0f
            val unit = m.groupValues[4].ifEmpty { "mm" }
            list.add(DimensionEntity(listOf(v1, v2, v3), unit))
        }

        val regex2D = Regex("(\\d+(?:\\.\\d+)?)\\s*[×x]\\s*(\\d+(?:\\.\\d+)?)(?!\\s*[×x])(?:\\s*(mm|cm|m))?", RegexOption.IGNORE_CASE)
        regex2D.findAll(text).forEach { m ->
            val v1 = m.groupValues[1].toFloatOrNull() ?: 0f
            val v2 = m.groupValues[2].toFloatOrNull() ?: 0f
            val unit = m.groupValues[3].ifEmpty { "mm" }
            list.add(DimensionEntity(listOf(v1, v2), unit))
        }
        return list
    }

    /**
     * Extracts spine level entities (e.g. "L4-L5", "L5-S1", "C4-C5", "D12-L1").
     */
    fun extractSpineLevels(text: String): List<SpineLevelEntity> {
        val list = mutableListOf<SpineLevelEntity>()
        val regex = Regex("\\b([LCDSTlcdst])(\\d+)(?:-([LCDSTlcdst])?(\\d+))?\\b")
        regex.findAll(text).forEach { m ->
            val p1 = m.groupValues[1].uppercase(Locale.ROOT)
            val d1 = m.groupValues[2]
            val p2 = m.groupValues[3].ifEmpty { p1 }.uppercase(Locale.ROOT)
            val d2 = m.groupValues[4]
            val full = m.value.uppercase(Locale.ROOT)
            list.add(SpineLevelEntity(text = full, startLevel = "$p1$d1", endLevel = if (d2.isNotEmpty()) "$p2$d2" else null))
        }
        return list
    }

    /**
     * Extracts laterality entities ("phải", "trái", "hai bên").
     */
    fun extractLaterality(text: String): List<LateralityEntity> {
        val clean = cleanText(text)
        val list = mutableListOf<LateralityEntity>()
        if (clean.contains("hai bên")) {
            list.add(LateralityEntity("hai bên"))
        } else {
            if (Regex("\\b(phải|bên phải)\\b").containsMatchIn(clean)) {
                list.add(LateralityEntity("phải"))
            }
            if (Regex("\\b(trái|bên trái)\\b").containsMatchIn(clean)) {
                list.add(LateralityEntity("trái"))
            }
        }
        return list
    }

    /**
     * Extracts negation phrases.
     */
    fun extractNegations(text: String): List<String> {
        val clean = cleanText(text)
        val matches = mutableListOf<String>()
        for (kw in NEGATION_KEYWORDS) {
            if (clean.contains(kw)) matches.add(kw)
        }
        val genericNegationRegex = Regex("\\b(không|chưa)\\s+([a-zA-ZÀ-ỹ0-9]+(?:\\s+[a-zA-ZÀ-ỹ0-9]+)?)\\b")
        genericNegationRegex.findAll(clean).forEach { m ->
            val phrase = m.value.trim()
            if (matches.none { it.contains(phrase) || phrase.contains(it) }) {
                matches.add(phrase)
            }
        }
        return matches
    }

    /**
     * Character Error Rate via Levenshtein distance on characters.
     */
    fun computeCer(ref: String, hyp: String): Float {
        if (ref.isEmpty()) return if (hyp.isEmpty()) 0.0f else 1.0f
        val dist = levenshteinDistance(ref.toCharArray(), hyp.toCharArray())
        return min(dist.toFloat() / ref.length, 1.0f)
    }

    /**
     * Word Error Rate via Levenshtein distance on words.
     */
    fun computeWer(ref: String, hyp: String): Float {
        val refWords = if (ref.isEmpty()) emptyList() else ref.split(" ")
        val hypWords = if (hyp.isEmpty()) emptyList() else hyp.split(" ")
        if (refWords.isEmpty()) return if (hypWords.isEmpty()) 0.0f else 1.0f

        val dist = levenshteinDistance(refWords.toTypedArray(), hypWords.toTypedArray())
        return min(dist.toFloat() / refWords.size, 1.0f)
    }

    private fun <T> levenshteinDistance(s1: Array<T>, s2: Array<T>): Int {
        val dp = Array(s1.size + 1) { IntArray(s2.size + 1) }
        for (i in 0..s1.size) dp[i][0] = i
        for (j in 0..s2.size) dp[0][j] = j

        for (i in 1..s1.size) {
            for (j in 1..s2.size) {
                val cost = if (s1[i - 1] == s2[j - 1]) 0 else 1
                dp[i][j] = minOf(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                )
            }
        }
        return dp[s1.size][s2.size]
    }

    private fun levenshteinDistance(s1: CharArray, s2: CharArray): Int {
        val dp = Array(s1.size + 1) { IntArray(s2.size + 1) }
        for (i in 0..s1.size) dp[i][0] = i
        for (j in 0..s2.size) dp[0][j] = j

        for (i in 1..s1.size) {
            for (j in 1..s2.size) {
                val cost = if (s1[i - 1] == s2[j - 1]) 0 else 1
                dp[i][j] = minOf(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                )
            }
        }
        return dp[s1.size][s2.size]
    }

    fun computeTokenDiff(ref: String, hyp: String): List<TokenDiff> {
        val refWords = if (ref.isEmpty()) emptyList() else ref.split(" ")
        val hypWords = if (hyp.isEmpty()) emptyList() else hyp.split(" ")

        val n = refWords.size
        val m = hypWords.size
        val dp = Array(n + 1) { IntArray(m + 1) }

        for (i in 0..n) dp[i][0] = i
        for (j in 0..m) dp[0][j] = j

        for (i in 1..n) {
            for (j in 1..m) {
                val cost = if (refWords[i - 1] == hypWords[j - 1]) 0 else 1
                dp[i][j] = minOf(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                )
            }
        }

        val result = mutableListOf<TokenDiff>()
        var i = n
        var j = m

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && refWords[i - 1] == hypWords[j - 1]) {
                result.add(TokenDiff(DiffType.MATCH, refWords[i - 1], hypWords[j - 1]))
                i--
                j--
            } else if (i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + 1) {
                result.add(TokenDiff(DiffType.SUBSTITUTION, refWords[i - 1], hypWords[j - 1]))
                i--
                j--
            } else if (j > 0 && dp[i][j] == dp[i][j - 1] + 1) {
                result.add(TokenDiff(DiffType.INSERTION, null, hypWords[j - 1]))
                j--
            } else if (i > 0) {
                result.add(TokenDiff(DiffType.DELETION, refWords[i - 1], null))
                i--
            } else {
                break
            }
        }

        return result.reversed()
    }
}
