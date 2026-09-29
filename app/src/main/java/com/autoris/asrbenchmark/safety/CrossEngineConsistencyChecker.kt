package com.autoris.asrbenchmark.safety

import com.autoris.asrbenchmark.normalizer.MedicalTextNormalizer
import kotlin.math.abs

data class CrossEngineConsistencyResult(
    val isConsistent: Boolean,
    val streamingTranscript: String,
    val offlineTranscript: String,
    val mismatches: List<String> = emptyList(),
    val checkedEntitiesCount: Int = 0
)

/**
 * Cross-Engine 30M (Streaming) vs 150M (Offline) Semantic Consistency Checker.
 * Extracts critical entities (measurements, dimensions, spine levels, lateralities, negations)
 * from both streaming and offline hypotheses.
 * If there is a critical discrepancy (e.g. 15 mm vs 21 mm, L4-L5 vs L5-S1, phải vs trái, có vs không),
 * flags inconsistency to prevent unverified RIS autofill.
 */
object CrossEngineConsistencyChecker {

    fun check(streamingText: String, offlineText: String): CrossEngineConsistencyResult {
        if (streamingText.isBlank() || offlineText.isBlank()) {
            // Cannot cross-validate if either hypothesis is missing
            return CrossEngineConsistencyResult(
                isConsistent = true,
                streamingTranscript = streamingText,
                offlineTranscript = offlineText,
                mismatches = emptyList(),
                checkedEntitiesCount = 0
            )
        }

        val normStreaming = MedicalTextNormalizer.process(streamingText)
        val normOffline = MedicalTextNormalizer.process(offlineText)

        val mismatches = mutableListOf<String>()
        var checkedCount = 0

        // 1. Dimensions check (2D / 3D) - bidirectional
        for (offDim in normOffline.dimensions) {
            checkedCount++
            val match = normStreaming.dimensions.any { strDim ->
                strDim.dims.sorted() == offDim.dims.sorted() && strDim.unit.equals(offDim.unit, ignoreCase = true)
            }
            if (!match) {
                mismatches.add("Bất đồng kích thước giữa 30M ('${normStreaming.dimensions.map { it.raw }}') và 150M ('${offDim.raw}')")
            }
        }
        for (strDim in normStreaming.dimensions) {
            val match = normOffline.dimensions.any { offDim ->
                offDim.dims.sorted() == strDim.dims.sorted() && offDim.unit.equals(strDim.unit, ignoreCase = true)
            }
            if (!match && !mismatches.any { it.contains("Bất đồng kích thước") }) {
                mismatches.add("Bất đồng kích thước: 30M có '${strDim.raw}' nhưng 150M không có")
            }
        }

        // 2. Measurements check (e.g. 21 mm vs 15 mm)
        for (offM in normOffline.measurements) {
            if (offM.value != null) {
                checkedCount++
                val match = normStreaming.measurements.any { strM ->
                    strM.value != null && abs(strM.value - offM.value) < 0.01f &&
                    (strM.unit == null || offM.unit == null || strM.unit.equals(offM.unit, ignoreCase = true))
                }
                if (!match) {
                    mismatches.add("Bất đồng số đo giữa 30M và 150M ('${offM.raw}')")
                }
            }
        }
        for (strM in normStreaming.measurements) {
            if (strM.value != null && strM.unit != null) {
                val match = normOffline.measurements.any { offM ->
                    offM.value != null && abs(strM.value - offM.value) < 0.01f &&
                    (offM.unit == null || offM.unit.equals(strM.unit, ignoreCase = true))
                }
                if (!match && !mismatches.any { it.contains("Bất đồng số đo") }) {
                    mismatches.add("Bất đồng số đo: 30M có '${strM.raw}' nhưng 150M không có")
                }
            }
        }

        // 3. Spine levels check (e.g. L4-L5 vs L5-S1)
        for (offSpine in normOffline.spineLevels) {
            checkedCount++
            val match = normStreaming.spineLevels.any { strSpine ->
                strSpine.normalized.equals(offSpine.normalized, ignoreCase = true)
            }
            if (!match) {
                mismatches.add("Bất đồng tầng cột sống giữa 30M và 150M ('${offSpine.normalized}')")
            }
        }
        for (strSpine in normStreaming.spineLevels) {
            val match = normOffline.spineLevels.any { offSpine ->
                offSpine.normalized.equals(strSpine.normalized, ignoreCase = true)
            }
            if (!match && !mismatches.any { it.contains("Bất đồng tầng cột sống") }) {
                mismatches.add("Bất đồng tầng cột sống: 30M có '${strSpine.normalized}' nhưng 150M không có")
            }
        }

        // 4. Laterality check (e.g. phải vs trái)
        for (offLat in normOffline.lateralities) {
            checkedCount++
            val match = normStreaming.lateralities.any { strLat ->
                strLat.anatomyTarget == offLat.anatomyTarget && strLat.side == offLat.side
            }
            if (!match) {
                mismatches.add("Bất đồng định vị bên giữa 30M và 150M cho '${offLat.anatomyTarget}' (${offLat.side})")
            }
        }
        for (strLat in normStreaming.lateralities) {
            val match = normOffline.lateralities.any { offLat ->
                offLat.anatomyTarget == strLat.anatomyTarget && offLat.side == strLat.side
            }
            if (!match && !mismatches.any { it.contains("Bất đồng định vị bên") }) {
                mismatches.add("Bất đồng định vị bên: 30M phát hiện '${strLat.anatomyTarget}' (${strLat.side}) nhưng 150M không có")
            }
        }

        // 5. Negation check (e.g. không có sỏi vs có sỏi)
        for (offNeg in normOffline.negations) {
            checkedCount++
            val match = normStreaming.negations.any { strNeg ->
                (strNeg.trigger == offNeg.trigger || strNeg.trigger.contains(offNeg.trigger) || offNeg.trigger.contains(strNeg.trigger)) &&
                (strNeg.scopeText.contains(offNeg.scopeText) || offNeg.scopeText.contains(strNeg.scopeText) || strNeg.scopeText.isEmpty() || offNeg.scopeText.isEmpty())
            }
            if (!match) {
                mismatches.add("Bất đồng phủ định lâm sàng: 150M có '${offNeg.trigger}' nhưng 30M không có")
            }
        }
        for (strNeg in normStreaming.negations) {
            val match = normOffline.negations.any { offNeg ->
                (offNeg.trigger == strNeg.trigger || offNeg.trigger.contains(strNeg.trigger) || strNeg.trigger.contains(offNeg.trigger)) &&
                (offNeg.scopeText.contains(strNeg.scopeText) || strNeg.scopeText.contains(offNeg.scopeText) || offNeg.scopeText.isEmpty() || strNeg.scopeText.isEmpty())
            }
            if (!match && !mismatches.any { it.contains("Bất đồng phủ định lâm sàng") }) {
                mismatches.add("Bất đồng phủ định lâm sàng: 30M có '${strNeg.trigger}' nhưng 150M không có")
            }
        }

        return CrossEngineConsistencyResult(
            isConsistent = mismatches.isEmpty(),
            streamingTranscript = streamingText,
            offlineTranscript = offlineText,
            mismatches = mismatches,
            checkedEntitiesCount = checkedCount
        )
    }
}
