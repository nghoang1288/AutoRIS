package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.vad.EnergyVadEngine
import com.autoris.asrbenchmark.vad.NeuralVadEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class VadEngineTest {

    @Test
    fun testEnergyVadEngine() {
        val vad = EnergyVadEngine(speechProbabilityThreshold = 0.5f)
        assertEquals("EnergyVAD", vad.name)
        assertFalse(vad.isNeural)

        // Seed with ambient silence chunks
        val quietChunk = FloatArray(1600) { 0.001f } // ~ -60 dB
        for (i in 0 until 10) {
            val detected = vad.process(quietChunk)
            assertFalse(detected)
        }
        assertEquals(0.0f, vad.getSpeechProbability(), 0.05f)

        // Speech burst chunk
        val speechChunk = FloatArray(1600) { 0.1f } // ~ -20 dB
        val detected = vad.process(speechChunk)
        assertTrue(detected)
        assertTrue(vad.getSpeechProbability() >= 0.5f)

        vad.reset()
        assertEquals(0.0f, vad.getSpeechProbability(), 0.001f)
        vad.release()
    }

    @Test
    fun testNeuralVadFallback() {
        val nonExistentModel = File("non_existent_silero.onnx")
        val neuralVad = NeuralVadEngine(modelFile = nonExistentModel)

        assertFalse(neuralVad.isModelLoaded)
        assertFalse(neuralVad.isNeural)
        assertTrue(neuralVad.name.contains("Fallback Energy"))

        // Verify fallback detects speech
        val quietChunk = FloatArray(1600) { 0.001f }
        for (i in 0 until 5) {
            neuralVad.process(quietChunk)
        }

        val speechChunk = FloatArray(1600) { 0.15f }
        val speechDetected = neuralVad.process(speechChunk)
        assertTrue(speechDetected)
        assertTrue(neuralVad.getSpeechProbability() > 0.0f)

        neuralVad.reset()
        assertEquals(0.0f, neuralVad.getSpeechProbability(), 0.001f)
        neuralVad.release()
    }
}
