package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.audio.PreprocessingProfile
import com.autoris.asrbenchmark.noise.NoisePolicyEngine
import com.autoris.asrbenchmark.noise.NoiseProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class NoisePolicyEngineTest {

    private lateinit var engine: NoisePolicyEngine

    @Before
    fun setUp() {
        engine = NoisePolicyEngine(hysteresisCount = 3)
    }

    @Test
    fun testCleanEnvironmentRecommendsRaw() {
        val cleanProfile = NoiseProfile(
            noiseFloorDb = -55.0f,
            currentDb = -20.0f,
            snrDb = 35.0f,
            noiseLevel = "quiet"
        )
        val decision = engine.evaluate(cleanProfile, speakerDistanceCm = 20)
        assertEquals(PreprocessingProfile.RAW, decision.recommendedProfile)
        assertEquals(PreprocessingProfile.RAW, decision.activeProfile)
        assertFalse(decision.isOverride)
    }

    @Test
    fun testModerateNoiseRecommendsAndroidNs() {
        val modProfile = NoiseProfile(
            noiseFloorDb = -45.0f,
            currentDb = -25.0f,
            snrDb = 20.0f,
            noiseLevel = "moderate"
        )
        val (recommended, _, _) = engine.determineOptimalProfile(
            noiseFloorDb = modProfile.noiseFloorDb,
            snrDb = modProfile.snrDb,
            distanceCm = 25,
            clipping = false
        )
        assertEquals(PreprocessingProfile.ANDROID_NS, recommended)
    }

    @Test
    fun testFarSpeakerDistanceRecommendsAndroidNsAgc() {
        val cleanProfile = NoiseProfile(
            noiseFloorDb = -52.0f,
            currentDb = -25.0f,
            snrDb = 27.0f,
            noiseLevel = "quiet"
        )
        val (recommended, _, _) = engine.determineOptimalProfile(
            noiseFloorDb = cleanProfile.noiseFloorDb,
            snrDb = cleanProfile.snrDb,
            distanceCm = 50, // Far distance (>35cm)
            clipping = false
        )
        assertEquals(PreprocessingProfile.ANDROID_NS_AGC, recommended)
    }

    @Test
    fun testHighNoiseLowSnrRecommendsDpdfNet() {
        val mriProfile = NoiseProfile(
            noiseFloorDb = -38.0f, // > -40 dB
            currentDb = -26.0f,
            snrDb = 12.0f,         // < 15 dB
            noiseLevel = "loud"
        )
        val (recommended, _, _) = engine.determineOptimalProfile(
            noiseFloorDb = mriProfile.noiseFloorDb,
            snrDb = mriProfile.snrDb,
            distanceCm = 20,
            clipping = false
        )
        assertEquals(PreprocessingProfile.DPDFNET, recommended)
    }

    @Test
    fun testExtremeNoiseAndClippingRecommendsCascaded() {
        val erProfile = NoiseProfile(
            noiseFloorDb = -30.0f, // > -32 dB
            currentDb = -26.0f,
            snrDb = 4.0f,
            noiseLevel = "loud"
        )
        val (recommended, _, _) = engine.determineOptimalProfile(
            noiseFloorDb = erProfile.noiseFloorDb,
            snrDb = erProfile.snrDb,
            distanceCm = 20,
            clipping = true
        )
        assertEquals(PreprocessingProfile.ANDROID_NS_DPDFNET, recommended)
    }

    @Test
    fun testHysteresisPreventsPrematureSwitching() {
        val cleanProfile = NoiseProfile(noiseFloorDb = -55.0f, snrDb = 35.0f)
        val noisyProfile = NoiseProfile(noiseFloorDb = -38.0f, snrDb = 10.0f)

        // Initial state is RAW
        engine.evaluate(cleanProfile, 20)
        assertEquals(PreprocessingProfile.RAW, engine.getActiveProfile())

        // 1st noisy chunk: recommended is DPDFNET, but active MUST remain RAW
        val d1 = engine.evaluate(noisyProfile, 20)
        assertEquals(PreprocessingProfile.DPDFNET, d1.recommendedProfile)
        assertEquals(PreprocessingProfile.RAW, d1.activeProfile)

        // 2nd noisy chunk: active still RAW
        val d2 = engine.evaluate(noisyProfile, 20)
        assertEquals(PreprocessingProfile.RAW, d2.activeProfile)

        // 3rd consecutive noisy chunk: active transitions to DPDFNET!
        val d3 = engine.evaluate(noisyProfile, 20)
        assertEquals(PreprocessingProfile.DPDFNET, d3.activeProfile)
    }

    @Test
    fun testManualOverrideLocksActiveProfile() {
        engine.setManualOverride(PreprocessingProfile.DPDFNET)
        assertTrue(engine.isOverrideActive())

        val cleanProfile = NoiseProfile(noiseFloorDb = -55.0f, snrDb = 35.0f)
        val decision = engine.evaluate(cleanProfile, 20)

        // Engine recommends RAW, but active is locked to DPDFNET
        assertEquals(PreprocessingProfile.RAW, decision.recommendedProfile)
        assertEquals(PreprocessingProfile.DPDFNET, decision.activeProfile)
        assertTrue(decision.isOverride)

        // Clear override
        engine.clearOverride()
        assertFalse(engine.isOverrideActive())
    }
}
