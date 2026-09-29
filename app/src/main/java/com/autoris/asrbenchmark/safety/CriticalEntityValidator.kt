package com.autoris.asrbenchmark.safety

import com.autoris.asrbenchmark.normalizer.CertaintyLevel
import com.autoris.asrbenchmark.normalizer.NormalizedResult
import com.autoris.asrbenchmark.normalizer.ParsedClinicalScore
import com.autoris.asrbenchmark.normalizer.ParsedDimension
import com.autoris.asrbenchmark.normalizer.ParsedLaterality
import com.autoris.asrbenchmark.normalizer.ParsedMeasurement
import com.autoris.asrbenchmark.normalizer.ParsedNegation
import com.autoris.asrbenchmark.normalizer.ParsedSpineLevel

/**
 * Result of structured critical entity validation.
 * Replaces assumption-based validation with explicit proof of entity safety.
 */
data class CriticalEntityValidationResult(
    val status: EvidenceStatus = EvidenceStatus.UNKNOWN,
    val validatorExecuted: Boolean = false,
    val hasInferredCriticalEntities: Boolean = false,
    val hasAmbiguousEntities: Boolean = false,
    val measurements: List<ParsedMeasurement> = emptyList(),
    val dimensions: List<ParsedDimension> = emptyList(),
    val spineLevels: List<ParsedSpineLevel> = emptyList(),
    val lateralities: List<ParsedLaterality> = emptyList(),
    val negations: List<ParsedNegation> = emptyList(),
    val clinicalScores: List<ParsedClinicalScore> = emptyList(),
    val criticalErrors: List<String> = emptyList(),
    val reviewReasons: List<String> = emptyList()
)

/**
 * Structured validator for clinical entities.
 * Evaluates semantic findings, measurements, anatomical lateralities,
 * spine vertebral levels, and diagnostic scores.
 *
 * Rules:
 * - AMBIGUOUS critical entities -> INVALID / REJECTED (fail-closed, safety risk)
 * - INFERRED critical entities (e.g. contextual default mm) -> VALID but REVIEW_REQUIRED (requires doctor confirmation)
 * - Missing or unvalidated entities -> UNKNOWN (fail-closed)
 * - Contradictory lateralities or malformed dimensions -> INVALID / REJECTED
 */
object CriticalEntityValidator {

    fun validate(norm: NormalizedResult?): CriticalEntityValidationResult {
        if (norm == null) {
            return CriticalEntityValidationResult(
                status = EvidenceStatus.UNKNOWN,
                validatorExecuted = false,
                hasInferredCriticalEntities = false,
                hasAmbiguousEntities = false,
                criticalErrors = listOf("NormalizedResult is null: Semantic validation not performed")
            )
        }

        val errors = mutableListOf<String>()
        val reviews = mutableListOf<String>()
        var hasInferred = false
        var hasAmbiguous = false

        // 1. Laterality Validation
        for (lat in norm.lateralities) {
            if (lat.isContradictory) {
                errors.add("Mâu thuẫn định vị bên (phải/trái): ${lat.rawText}")
            }
        }

        // 2. Clinical Scores Validation
        for (score in norm.clinicalScores) {
            if (!score.isValid) {
                errors.add("Phân loại CĐHA không hợp lệ: ${score.raw}")
            }
            if (score.certainty == CertaintyLevel.AMBIGUOUS) {
                hasAmbiguous = true
                errors.add("Phân loại CĐHA mơ hồ: ${score.raw}")
            } else if (score.certainty == CertaintyLevel.INFERRED) {
                hasInferred = true
                reviews.add("Phân loại CĐHA suy diễn từ ngữ cảnh: ${score.raw}")
            }
        }

        // 3. Dimensions Validation
        for (dim in norm.dimensions) {
            if (dim.dims.any { it <= 0f }) {
                errors.add("Kích thước không hợp lệ (<= 0): ${dim.raw}")
            }
            if (dim.certainty == CertaintyLevel.AMBIGUOUS) {
                hasAmbiguous = true
                errors.add("Kích thước mơ hồ/thiếu đơn vị: ${dim.raw}")
            } else if (dim.certainty == CertaintyLevel.INFERRED) {
                hasInferred = true
                reviews.add("Kích thước suy diễn đơn vị lâm sàng mặc định: ${dim.raw}")
            }
        }

        // 4. Measurements Validation
        for (m in norm.measurements) {
            if (m.certainty == CertaintyLevel.AMBIGUOUS) {
                hasAmbiguous = true
                errors.add(m.ambiguityReason ?: "Số đo thiếu đơn vị lâm sàng (mm/cm): ${m.raw}")
            } else if (m.certainty == CertaintyLevel.INFERRED) {
                hasInferred = true
                reviews.add("Số đo suy diễn đơn vị lâm sàng: ${m.raw}")
            }
        }

        // 5. Spine Levels Validation
        for (spine in norm.spineLevels) {
            if (spine.certainty == CertaintyLevel.AMBIGUOUS) {
                hasAmbiguous = true
                errors.add("Tầng cột sống mơ hồ: ${spine.raw}")
            } else if (spine.certainty == CertaintyLevel.INFERRED) {
                hasInferred = true
                reviews.add("Tầng cột sống suy diễn: ${spine.raw}")
            }
        }

        // 6. Negations Validation
        for (neg in norm.negations) {
            if (neg.certainty == CertaintyLevel.AMBIGUOUS) {
                hasAmbiguous = true
                errors.add("Phủ định lâm sàng mơ hồ: ${neg.trigger}")
            }
        }

        // Check if norm has ambiguity flag
        if (norm.hasAmbiguityOrConflict && !hasAmbiguous && errors.isEmpty()) {
            hasAmbiguous = true
            errors.add("Phát hiện xung đột hoặc mơ hồ trong cấu trúc thực thể")
        }

        val status = when {
            errors.isNotEmpty() || hasAmbiguous -> EvidenceStatus.INVALID
            else -> EvidenceStatus.VALID
        }

        return CriticalEntityValidationResult(
            status = status,
            validatorExecuted = true,
            hasInferredCriticalEntities = hasInferred,
            hasAmbiguousEntities = hasAmbiguous,
            measurements = norm.measurements,
            dimensions = norm.dimensions,
            spineLevels = norm.spineLevels,
            lateralities = norm.lateralities,
            negations = norm.negations,
            clinicalScores = norm.clinicalScores,
            criticalErrors = errors,
            reviewReasons = reviews
        )
    }
}
