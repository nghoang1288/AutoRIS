package com.autoris.asrbenchmark.benchmark

import java.util.Locale
import kotlin.math.min

enum class DiffType {
    MATCH,
    INSERTION,
    DELETION,
    SUBSTITUTION
}

data class TokenDiff(
    val type: DiffType,
    val refWord: String?,
    val hypWord: String?
)

data class EvaluationReport(
    val referenceText: String,
    val hypothesisText: String,
    val cer: Float,                     // Character Error Rate [0.0 - 1.0]
    val wer: Float,                     // Word Error Rate [0.0 - 1.0]
    val medicalTermAccuracy: Float,     // [0.0 - 1.0]
    val numericAccuracy: Float,         // [0.0 - 1.0]
    val anatomyAccuracy: Float,         // [0.0 - 1.0]
    val negationAccuracy: Float,        // [0.0 - 1.0]
    val matchedTerms: List<String>,
    val missedTerms: List<String>,
    val matchedNumbers: List<String>,
    val missedNumbers: List<String>,
    val diffTokens: List<TokenDiff>
)

object AccuracyEvaluator {

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

        // Evaluate domain terms
        val keyTerms = testSentence?.keyTerms ?: emptyList()
        val keyNumbers = testSentence?.keyNumbers ?: emptyList()
        val keyAnatomy = testSentence?.keyAnatomy ?: emptyList()
        val keyNegations = testSentence?.keyNegations ?: emptyList()

        val matchedTerms = mutableListOf<String>()
        val missedTerms = mutableListOf<String>()
        for (term in keyTerms) {
            if (cleanHyp.contains(cleanText(term))) {
                matchedTerms.add(term)
            } else {
                missedTerms.add(term)
            }
        }
        val termAcc = if (keyTerms.isNotEmpty()) matchedTerms.size.toFloat() / keyTerms.size else 1.0f

        val matchedNumbers = mutableListOf<String>()
        val missedNumbers = mutableListOf<String>()
        for (num in keyNumbers) {
            val cleanNum = cleanText(num)
            if (cleanHyp.contains(cleanNum) || hypothesis.contains(num)) {
                matchedNumbers.add(num)
            } else {
                missedNumbers.add(num)
            }
        }
        val numAcc = if (keyNumbers.isNotEmpty()) matchedNumbers.size.toFloat() / keyNumbers.size else 1.0f

        var matchedAnatomy = 0
        for (a in keyAnatomy) {
            if (cleanHyp.contains(cleanText(a))) matchedAnatomy++
        }
        val anatomyAcc = if (keyAnatomy.isNotEmpty()) matchedAnatomy.toFloat() / keyAnatomy.size else 1.0f

        var matchedNegations = 0
        for (n in keyNegations) {
            if (cleanHyp.contains(cleanText(n))) matchedNegations++
        }
        val negationAcc = if (keyNegations.isNotEmpty()) matchedNegations.toFloat() / keyNegations.size else 1.0f

        return EvaluationReport(
            referenceText = reference,
            hypothesisText = hypothesis,
            cer = cer,
            wer = wer,
            medicalTermAccuracy = termAcc,
            numericAccuracy = numAcc,
            anatomyAccuracy = anatomyAcc,
            negationAccuracy = negationAcc,
            matchedTerms = matchedTerms,
            missedTerms = missedTerms,
            matchedNumbers = matchedNumbers,
            missedNumbers = missedNumbers,
            diffTokens = diffs
        )
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

    /**
     * Generic Levenshtein distance algorithm.
     */
    private fun <T> levenshteinDistance(s1: Array<T>, s2: Array<T>): Int {
        val dp = Array(s1.size + 1) { IntArray(s2.size + 1) }
        for (i in 0..s1.size) dp[i][0] = i
        for (j in 0..s2.size) dp[0][j] = j

        for (i in 1..s1.size) {
            for (j in 1..s2.size) {
                val cost = if (s1[i - 1] == s2[j - 1]) 0 else 1
                dp[i][j] = minOf(
                    dp[i - 1][j] + 1,       // deletion
                    dp[i][j - 1] + 1,       // insertion
                    dp[i - 1][j - 1] + cost // substitution
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

    /**
     * Backtracks Levenshtein matrix to generate token-level diff for visual display.
     */
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
