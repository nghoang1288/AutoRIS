package com.autoris.asrbenchmark.normalizer

/**
 * Three-tier certainty architecture for clinical radiology semantic parsing.
 * - EXPLICIT: Text directly contained the full unit, value, or explicit syntactic construct.
 * - INFERRED: Value inferred with high confidence from radiology context (e.g., default mm).
 * - AMBIGUOUS: Missing critical units, contextually incomplete, or conflicting semantics.
 */
enum class CertaintyLevel {
    EXPLICIT,
    INFERRED,
    AMBIGUOUS
}

enum class LateralityType {
    RIGHT,
    LEFT,
    BILATERAL,
    UNSPECIFIED
}

data class ParsedMeasurement(
    val raw: String,
    val normalized: String,
    val value: Float?,
    val unit: String?,
    val certainty: CertaintyLevel,
    val ambiguityReason: String? = null
)

data class ParsedDimension(
    val raw: String,
    val normalized: String,
    val dims: List<Float>,
    val unit: String,
    val certainty: CertaintyLevel
)

data class ParsedSpineLevel(
    val raw: String,
    val normalized: String,
    val certainty: CertaintyLevel
)

data class ParsedLaterality(
    val side: LateralityType,
    val anatomyTarget: String,
    val rawText: String,
    val isContradictory: Boolean = false
)

data class ParsedNegation(
    val trigger: String,
    val scopeText: String,
    val certainty: CertaintyLevel
)

data class ParsedClinicalScore(
    val system: String,
    val score: String,
    val raw: String,
    val certainty: CertaintyLevel,
    val isValid: Boolean = true
)
