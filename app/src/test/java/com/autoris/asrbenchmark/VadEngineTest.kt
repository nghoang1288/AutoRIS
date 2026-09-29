package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.vad.EndpointState
import com.autoris.asrbenchmark.vad.EndpointStateMachine
import com.autoris.asrbenchmark.vad.EnergyVadEngine
import com.autoris.asrbenchmark.vad.NeuralVadEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        assertTrue(neuralVad.name.contains("ENERGY_FALLBACK"))

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

    @Test
    fun testEndpointStateMachineSpeechOnset() {
        val sm = EndpointStateMachine(minSpeechChunksToEnter = 2, minSilenceChunksForPossible = 5, minSilenceChunksForConfirmed = 10)
        assertEquals(EndpointState.SILENCE, sm.state)

        // 1st chunk of speech: tentative
        val s1 = sm.update(isSpeech = true, speechProbability = 0.8f, currentDb = -30f, noiseFloorDb = -50f)
        assertEquals(EndpointState.POSSIBLE_SPEECH, s1)
        assertEquals(1, sm.speechStreak)

        // 2nd chunk of speech: confirmed speech
        val s2 = sm.update(isSpeech = true, speechProbability = 0.85f, currentDb = -28f, noiseFloorDb = -50f)
        assertEquals(EndpointState.SPEECH, s2)
        assertEquals(2, sm.speechStreak)
    }

    @Test
    fun testEndpointStateMachineClickRejection() {
        val sm = EndpointStateMachine(minSpeechChunksToEnter = 2, minSilenceChunksForPossible = 5, minSilenceChunksForConfirmed = 10)
        // 1 isolated click chunk
        val s1 = sm.update(isSpeech = true, speechProbability = 0.9f, currentDb = -25f, noiseFloorDb = -50f)
        assertEquals(EndpointState.POSSIBLE_SPEECH, s1)

        // Followed immediately by silence
        val s2 = sm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
        assertEquals(EndpointState.SILENCE, s2)
        assertEquals(0, sm.speechStreak)
    }

    @Test
    fun testEndpointStateMachineShortPauseResumption() {
        val sm = EndpointStateMachine(minSpeechChunksToEnter = 2, minSilenceChunksForPossible = 5, minSilenceChunksForConfirmed = 10)
        // Reach SPEECH
        sm.update(isSpeech = true, speechProbability = 0.8f, currentDb = -30f, noiseFloorDb = -50f)
        sm.update(isSpeech = true, speechProbability = 0.8f, currentDb = -30f, noiseFloorDb = -50f)
        assertEquals(EndpointState.SPEECH, sm.state)

        // Brief natural pause (2 chunks = 200ms)
        sm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
        sm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
        assertEquals(EndpointState.SPEECH, sm.state) // Should stay in SPEECH

        // Speech resumes
        sm.update(isSpeech = true, speechProbability = 0.9f, currentDb = -28f, noiseFloorDb = -50f)
        assertEquals(EndpointState.SPEECH, sm.state)
        assertEquals(1, sm.speechStreak)
        assertEquals(0, sm.silenceStreak)
    }

    @Test
    fun testEndpointStateMachineTentativePauseAndConfirmation() {
        val sm = EndpointStateMachine(minSpeechChunksToEnter = 2, minSilenceChunksForPossible = 5, minSilenceChunksForConfirmed = 10)
        // Enter speech
        sm.update(isSpeech = true, speechProbability = 0.8f, currentDb = -30f, noiseFloorDb = -50f)
        sm.update(isSpeech = true, speechProbability = 0.8f, currentDb = -30f, noiseFloorDb = -50f)

        // 4 silence chunks: still SPEECH
        repeat(4) {
            sm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
        }
        assertEquals(EndpointState.SPEECH, sm.state)

        // 5th silence chunk: enters POSSIBLE_ENDPOINT (500ms)
        val s5 = sm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
        assertEquals(EndpointState.POSSIBLE_ENDPOINT, s5)

        // 6th to 9th: remains POSSIBLE_ENDPOINT
        repeat(4) {
            val s = sm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
            assertEquals(EndpointState.POSSIBLE_ENDPOINT, s)
        }

        // 10th silence chunk: ENDPOINT_CONFIRMED (1000ms pause)
        val s10 = sm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
        assertEquals(EndpointState.ENDPOINT_CONFIRMED, s10)
    }

    @Test
    fun testEndpointStateMachineConfigurableThresholds() {
        // Fast endpoint: 500ms (5 chunks of silence)
        val fastSm = EndpointStateMachine(minSpeechChunksToEnter = 2, minSilenceChunksForPossible = 3, minSilenceChunksForConfirmed = 5)
        fastSm.update(isSpeech = true, speechProbability = 0.8f, currentDb = -30f, noiseFloorDb = -50f)
        fastSm.update(isSpeech = true, speechProbability = 0.8f, currentDb = -30f, noiseFloorDb = -50f)

        repeat(4) {
            fastSm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
        }
        assertEquals(EndpointState.POSSIBLE_ENDPOINT, fastSm.state)

        val confirmed = fastSm.update(isSpeech = false, speechProbability = 0.1f, currentDb = -52f, noiseFloorDb = -50f)
        assertEquals(EndpointState.ENDPOINT_CONFIRMED, confirmed)
    }

    @Test
    fun testEndpointStateMachineRejectsAcousticBurstWithoutNeuralSpeech() {
        val sm = EndpointStateMachine(minSpeechChunksToEnter = 2, minSilenceChunksForPossible = 5, minSilenceChunksForConfirmed = 10)
        // High energy acoustic burst (e.g. door slam or keyboard clatter at -20dB vs floor -50dB)
        // but neural probability is low (0.10f) and isSpeech is false.
        val state = sm.update(isSpeech = false, speechProbability = 0.10f, currentDb = -20f, noiseFloorDb = -50f)
        assertEquals("Neural VAD must reject high-energy non-speech burst", EndpointState.SILENCE, state)
        assertEquals(0, sm.speechStreak)
    }
}
