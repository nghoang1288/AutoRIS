package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.benchmark.BenchmarkSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BenchmarkMetricsTest {

    @Test
    fun testRtfCalculationNotZeroWhenProcessingOccurred() {
        val session = BenchmarkSession(
            audioDurationSec = 5.0f,
            audioDurationMs = 5000L,
            processingMs = 150L,
            firstSegmentResultLatencyMs = 150L
        )

        val rtf = session.calculateEffectiveRtf()
        assertTrue("RTF must be positive when processing took place", rtf > 0.0f)
        assertEquals(0.03f, rtf, 0.001f)
    }

    @Test
    fun testCriticalErrorDetection() {
        val cleanSession = BenchmarkSession(
            criticalNumericError = false,
            criticalMeasurementError = false,
            criticalNegationError = false,
            criticalLateralityError = false,
            criticalSpineError = false
        )
        assertFalse(cleanSession.hasCriticalError())

        val numericErrorSession = cleanSession.copy(criticalNumericError = true)
        assertTrue(numericErrorSession.hasCriticalError())

        val negationErrorSession = cleanSession.copy(criticalNegationError = true)
        assertTrue(negationErrorSession.hasCriticalError())

        val spineErrorSession = cleanSession.copy(criticalSpineError = true)
        assertTrue(spineErrorSession.hasCriticalError())
    }

    @Test
    fun testDistinctLatencyFields() {
        val offlineSession = BenchmarkSession(
            firstSegmentResultLatencyMs = 250L,
            truePartialLatencyMs = null
        )
        assertEquals(250L, offlineSession.firstSegmentResultLatencyMs)
        assertEquals(null, offlineSession.truePartialLatencyMs)
    }

    @Test
    fun testBenchmarkExporterCsvAndJson() {
        val tempDir = java.nio.file.Files.createTempDirectory("benchmark_test").toFile()
        try {
            val session = BenchmarkSession(
                sessionId = "test_sess_001",
                roomId = "ROOM_MRI",
                roomType = "mri_console",
                noiseType = "chiller_fan",
                noiseLevel = "loud",
                preprocessingProfile = "ANDROID_NS",
                rawTranscript = "gan to 15mm",
                normalizedTranscript = "gan to 15 mm",
                criticalMeasurementError = true
            )
            val csvFile = java.io.File(tempDir, "export.csv")
            val jsonFile = java.io.File(tempDir, "export.json")

            com.autoris.asrbenchmark.storage.BenchmarkExporter.exportToCsv(listOf(session), csvFile)
            com.autoris.asrbenchmark.storage.BenchmarkExporter.exportToJson(listOf(session), jsonFile)

            assertTrue(csvFile.exists() && csvFile.length() > 0)
            assertTrue(jsonFile.exists() && jsonFile.length() > 0)

            val csvContent = csvFile.readText()
            assertTrue(csvContent.contains("ROOM_MRI"))
            assertTrue(csvContent.contains("ANDROID_NS"))
            assertTrue(csvContent.contains("CritMeasErr"))

            val jsonContent = jsonFile.readText()
            assertTrue(jsonContent.contains("test_sess_001"))
            assertTrue(jsonContent.contains("chiller_fan"))
        } finally {
            tempDir.deleteRecursively()
        }
    }
}
