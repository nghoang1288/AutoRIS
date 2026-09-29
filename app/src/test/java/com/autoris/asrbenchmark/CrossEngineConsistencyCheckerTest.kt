package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.safety.CrossEngineConsistencyChecker
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CrossEngineConsistencyCheckerTest {

    @Test
    fun testIdenticalTranscriptsAreConsistent() {
        val streaming = "nang thận phải kích thước 15 mm"
        val offline = "nang thận phải kích thước 15 mm"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertTrue(result.isConsistent)
        assertTrue(result.mismatches.isEmpty())
    }

    @Test
    fun testBlankStreamingReturnsConsistentGracefully() {
        val streaming = ""
        val offline = "nang thận phải kích thước 15 mm"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertTrue(result.isConsistent)
        assertTrue(result.mismatches.isEmpty())
    }

    @Test
    fun testMeasurementDiscrepancyFlagsInconsistent() {
        val streaming = "nang thận kích thước 15 mm"
        val offline = "nang thận kích thước 21 mm"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertFalse("Measurement mismatch (15 mm vs 21 mm) must flag inconsistent", result.isConsistent)
        assertTrue(result.mismatches.any { it.contains("Bất đồng số đo") })
    }

    @Test
    fun testDimensionDiscrepancyFlagsInconsistent() {
        val streaming = "khối u gan 21 × 8 mm"
        val offline = "khối u gan 30 × 15 mm"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertFalse("Dimension mismatch must flag inconsistent", result.isConsistent)
        assertTrue(result.mismatches.any { it.contains("Bất đồng kích thước") })
    }

    @Test
    fun testSpineLevelDiscrepancyFlagsInconsistent() {
        val streaming = "thoát vị đĩa đệm tầng L4-L5"
        val offline = "thoát vị đĩa đệm tầng L5-S1"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertFalse("Spine level mismatch must flag inconsistent", result.isConsistent)
        assertTrue(result.mismatches.any { it.contains("Bất đồng tầng cột sống") })
    }

    @Test
    fun testLateralityDiscrepancyFlagsInconsistent() {
        val streaming = "tràn dịch màng phổi phải lượng ít"
        val offline = "tràn dịch màng phổi trái lượng ít"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertFalse("Laterality flip (phải vs trái) must flag inconsistent", result.isConsistent)
        assertTrue(result.mismatches.any { it.contains("Bất đồng định vị bên") })
    }

    @Test
    fun testNegationDiscrepancyFlagsInconsistent() {
        val streaming = "túi mật có sỏi kích thước 8 mm"
        val offline = "túi mật không có sỏi kích thước 8 mm"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertFalse("Negation mismatch (có sỏi vs không có sỏi) must flag inconsistent", result.isConsistent)
        assertTrue(result.mismatches.any { it.contains("Bất đồng phủ định") })
    }

    @Test
    fun testNegationSameTriggerDifferentScopeFlagsInconsistent() {
        val streaming = "không có sỏi túi mật"
        val offline = "không thấy thâm nhiễm mô mềm"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertFalse("Same trigger with different scope must flag inconsistent", result.isConsistent)
        assertTrue(result.mismatches.any { it.contains("Bất đồng phủ định") })
    }

    @Test
    fun testDimensionOrderInvariancePasses() {
        val streaming = "nang gan kích thước 15 x 20 mm"
        val offline = "nang gan kích thước 20 x 15 mm"
        val result = CrossEngineConsistencyChecker.check(streaming, offline)

        assertTrue("Dimension order difference (15x20 vs 20x15 mm) should be consistent", result.isConsistent)
        assertTrue(result.mismatches.isEmpty())
    }
}
