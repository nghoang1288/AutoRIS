package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.noise.AdaptiveNoiseTracker
import com.autoris.asrbenchmark.noise.NoiseScenario
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AdaptiveNoiseTrackerTest {

    @Test
    fun testNoiseScenarios() {
        val standard = NoiseScenario.fromId("ROOM_01")
        assertEquals(NoiseScenario.ROOM_READING_STANDARD, standard)
        assertEquals("reading_room", standard.roomType)

        val mri = NoiseScenario.fromId("ROOM_MRI")
        assertEquals(NoiseScenario.ROOM_MRI_CONSOLE, mri)
        assertEquals("mri_console", mri.roomType)

        val unknown = NoiseScenario.fromId("UNKNOWN")
        assertEquals(NoiseScenario.ROOM_READING_STANDARD, unknown)

        for (scenario in NoiseScenario.entries) {
            assertNotNull(scenario.id)
            assertNotNull(scenario.displayName)
            assertNotNull(scenario.recommendedProfile)
            assertTrue(scenario.typicalFloorDb < 0.0f)
        }
    }

    @Test
    fun testAdaptiveNoiseTrackerDynamicFloor() {
        val tracker = AdaptiveNoiseTracker(windowSizeChunks = 10, percentile = 0.15f)

        // Feed quiet room ambient chunks (~ -50 dB)
        for (i in 0 until 10) {
            tracker.update(-50.0f)
        }

        var profile = tracker.update(-50.0f)
        assertEquals(-50.0f, profile.noiseFloorDb, 1.0f)
        assertEquals("quiet", profile.noiseLevel)
        assertTrue(profile.speechThresholdDb > profile.noiseFloorDb)
        assertTrue(profile.silenceThresholdDb > profile.noiseFloorDb)
        assertTrue(profile.speechThresholdDb > profile.silenceThresholdDb)

        // Loud speech burst (-25 dB)
        val speechProfile = tracker.update(-25.0f)
        assertEquals(25.0f, speechProfile.snrDb, 1.5f)
    }

    @Test
    fun testRapidCalibration() {
        val tracker = AdaptiveNoiseTracker()

        // Create 1.0s of ambient silence around -42 dB (e.g. MRI console noise)
        // 16000 samples with small amplitude
        val samples = FloatArray(16000) { 0.008f } // 20*log10(0.008) ~= -42 dB
        tracker.calibrate(samples, sampleRate = 16000)

        val estimatedFloor = tracker.getEstimatedNoiseFloor()
        assertTrue(estimatedFloor in -45.0f..-38.0f)

        tracker.reset(-50.0f)
        assertEquals(-50.0f, tracker.getEstimatedNoiseFloor(), 0.1f)
    }

    @Test
    fun testNoiseFloorFreezesDuringSpeech() {
        val tracker = AdaptiveNoiseTracker(windowSizeChunks = 10, percentile = 0.15f)

        // Seed with ambient noise floor around -50 dB
        repeat(10) {
            tracker.update(-50.0f, isSpeech = false)
        }
        assertEquals(-50.0f, tracker.getEstimatedNoiseFloor(), 1.0f)

        // Doctor speaks loudly at -18 dB for 20 chunks (2.0s)
        repeat(20) {
            val prof = tracker.update(-18.0f, isSpeech = true)
            // Baseline noise floor should remain frozen at -50 dB
            assertEquals(-50.0f, prof.noiseFloorDb, 1.0f)
            assertTrue(prof.snrDb >= 30.0f)
        }

        // Noise floor remains frozen after speech burst
        assertEquals(-50.0f, tracker.getEstimatedNoiseFloor(), 1.0f)
    }
}
