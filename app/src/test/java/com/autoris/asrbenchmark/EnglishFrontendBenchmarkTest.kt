package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.benchmark.AccuracyEvaluator
import com.autoris.asrbenchmark.benchmark.BenchmarkTrack
import com.autoris.asrbenchmark.benchmark.EnglishTestSet
import com.autoris.asrbenchmark.benchmark.SyntheticAudioGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EnglishFrontendBenchmarkTest {

    @Test
    fun testBenchmarkTrack() {
        assertEquals(BenchmarkTrack.VIETNAMESE_RADIOLOGY, BenchmarkTrack.fromId("VIETNAMESE_RADIOLOGY"))
        assertEquals(BenchmarkTrack.ENGLISH_FRONTEND, BenchmarkTrack.fromId("ENGLISH_FRONTEND"))
        assertEquals(BenchmarkTrack.VIETNAMESE_RADIOLOGY, BenchmarkTrack.fromId("UNKNOWN"))
    }

    @Test
    fun testEnglishTestSet() {
        val list = EnglishTestSet.SENTENCES
        assertTrue(list.size >= 8)

        for (s in list) {
            assertNotNull(s.id)
            assertNotNull(s.category)
            assertTrue(s.referenceText.isNotBlank())
        }
    }

    @Test
    fun testSyntheticAudioGenerator() {
        val audio = SyntheticAudioGenerator.generateSyntheticSpeechAudio(durationSec = 0.5f, sampleRate = 16000)
        assertEquals(8000, audio.size)

        var hasNonZero = false
        for (sample in audio) {
            assertFalse("Sample must not be NaN", sample.isNaN())
            assertTrue("Sample within range", sample in -1.0f..1.0f)
            if (kotlin.math.abs(sample) > 0.01f) hasNonZero = true
        }
        assertTrue("Generated audio must have audio energy", hasNonZero)

        val noisy = SyntheticAudioGenerator.addNoise(audio, snrDb = 15.0f)
        assertEquals(audio.size, noisy.size)
    }

    @Test
    fun testEnglishEvaluation() {
        val ref = "No acute intracranial hemorrhage or mass effect."
        val hypExact = "No acute intracranial hemorrhage or mass effect."
        val hypErr = "Acute intracranial hemorrhage or mass effect." // Missing "No"

        val evalExact = AccuracyEvaluator.evaluate(ref, hypExact)
        assertEquals(0.0f, evalExact.wer, 0.001f)
        assertFalse(evalExact.criticalNegationError)

        val evalErr = AccuracyEvaluator.evaluate(ref, hypErr)
        assertTrue(evalErr.wer > 0.0f)
    }
}
