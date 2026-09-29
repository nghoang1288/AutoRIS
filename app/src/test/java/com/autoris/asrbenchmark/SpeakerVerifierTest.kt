package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.audio.SpectralEmbeddingSpeakerVerifier
import com.autoris.asrbenchmark.audio.VoiceLock
import com.autoris.asrbenchmark.audio.VoiceLockState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class SpeakerVerifierTest {

    private lateinit var verifier: SpectralEmbeddingSpeakerVerifier
    private lateinit var legacyVoiceLock: VoiceLock

    @Before
    fun setUp() {
        verifier = SpectralEmbeddingSpeakerVerifier(
            acceptThreshold = 0.70f,
            rejectThreshold = 0.48f,
            minUtteranceCount = 3,
            minTotalDurationSec = 3.0f // Lowered to 3s for unit test speed
        )
        legacyVoiceLock = VoiceLock()
    }

    /**
     * Synthesizes synthetic speech for a given fundamental pitch and vocal tract formant.
     */
    private fun synthesizeSpeech(f0: Float, durationSec: Float, sampleRate: Int = 16000, amplitude: Float = 0.5f): FloatArray {
        val numSamples = (durationSec * sampleRate).toInt()
        val samples = FloatArray(numSamples)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            // Harmonic sum: F0 + F1 (formant 1) + F2 (formant 2)
            val s = amplitude * (
                sin(2 * PI * f0 * t) +
                0.5 * sin(2 * PI * (f0 * 2.5) * t) +
                0.25 * sin(2 * PI * (f0 * 4.2) * t)
            )
            samples[i] = s.toFloat().coerceIn(-1.0f, 1.0f)
        }
        return samples
    }

    // =========================================================================
    // ENROLLMENT & QUALITY TESTS
    // =========================================================================

    @Test
    fun testEnrollmentFailsWhenTooFewUtterances() {
        val u1 = synthesizeSpeech(130f, 2.0f)
        val u2 = synthesizeSpeech(130f, 2.0f)
        val result = verifier.enroll(listOf(u1, u2)) // Only 2 utterances

        assertFalse("Enrollment should fail with only 2 utterances", result.isValid)
        assertFalse(verifier.isEnrolled)
        assertTrue(result.rejectionReason!!.contains("Insufficient utterances"))
    }

    @Test
    fun testEnrollmentFailsWhenAudioClipped() {
        val clipped = FloatArray(16000 * 2) { 1.0f } // 100% clipping
        val result = verifier.enroll(listOf(clipped, clipped, clipped))

        assertFalse("Enrollment should reject clipped audio", result.isValid)
        assertTrue(result.rejectionReason!!.contains("Audio clipping detected"))
    }

    @Test
    fun testEnrollmentFailsWhenAudioWhisperOrSilent() {
        val whisper = synthesizeSpeech(130f, 1.5f, amplitude = 0.001f) // very quiet
        val result = verifier.enroll(listOf(whisper, whisper, whisper))

        assertFalse("Enrollment should reject whispering/silence", result.isValid)
        assertTrue(result.rejectionReason!!.contains("Speech energy too low"))
    }

    @Test
    fun testEnrollmentSucceedsWithValidUtterances() {
        val u1 = synthesizeSpeech(130f, 1.5f, amplitude = 0.4f)
        val u2 = synthesizeSpeech(132f, 1.5f, amplitude = 0.4f)
        val u3 = synthesizeSpeech(128f, 1.5f, amplitude = 0.4f)

        val result = verifier.enroll(listOf(u1, u2, u3))
        assertTrue("Enrollment should succeed", result.isValid)
        assertTrue(verifier.isEnrolled)
        assertEquals(3, verifier.enrolledSegmentCount)
    }

    // =========================================================================
    // FAIL-CLOSED VERIFICATION TESTS
    // =========================================================================

    @Test
    fun testFailClosedWhenNotEnrolled() {
        // Must NEVER return ACCEPT if verifier is un-enrolled
        assertFalse(verifier.isEnrolled)
        val speech = synthesizeSpeech(130f, 1.0f)
        val result = verifier.verify(speech)

        assertEquals("Unenrolled verifier must return REJECT", VoiceLockState.REJECT, result.state)
        assertEquals(0.0f, result.confidence, 1e-6f)
    }

    @Test
    fun testLegacyVoiceLockFailClosedWhenEnabledWithoutEnrollment() {
        legacyVoiceLock.isEnabled = true
        assertFalse(legacyVoiceLock.isEnrolled)

        val speech = synthesizeSpeech(130f, 1.0f)
        val result = legacyVoiceLock.verify(speech)

        assertEquals("Legacy VoiceLock when enabled without enrollment must REJECT", VoiceLockState.REJECT, result.state)
        assertEquals(0.0f, result.confidence, 1e-6f)
    }

    // =========================================================================
    // SPEAKER DISCRIMINATION & FAR / FRR TEST
    // =========================================================================

    @Test
    fun testSpeakerVerificationAcceptsDoctorAndRejectsOtherPersons() {
        // Enroll DOCTOR (Pitch ~130Hz)
        val docU1 = synthesizeSpeech(130f, 1.5f)
        val docU2 = synthesizeSpeech(131f, 1.5f)
        val docU3 = synthesizeSpeech(129f, 1.5f)
        verifier.enroll(listOf(docU1, docU2, docU3))
        assertTrue(verifier.isEnrolled)

        // Test 1: DOCTOR same speaker (130Hz) -> Must ACCEPT
        val doctorTestAudio = synthesizeSpeech(130.5f, 2.0f)
        val docResult = verifier.verify(doctorTestAudio)
        assertEquals("Doctor speech must be ACCEPTED", VoiceLockState.ACCEPT, docResult.state)
        assertTrue("Similarity should be high", docResult.similarity >= 0.70f)

        // Test 2: OTHER_PERSON_1 (Female/high pitch ~240Hz) -> Must REJECT
        val other1 = synthesizeSpeech(240f, 2.0f)
        val other1Result = verifier.verify(other1)
        assertEquals("Different speaker (240Hz) must be REJECTED", VoiceLockState.REJECT, other1Result.state)

        // Test 3: OTHER_PERSON_2 (Low pitch ~85Hz) -> Must REJECT
        val other2 = synthesizeSpeech(85f, 2.0f)
        val other2Result = verifier.verify(other2)
        assertEquals("Different speaker (85Hz) must be REJECTED", VoiceLockState.REJECT, other2Result.state)
    }

    @Test
    fun testFarFrrBenchmarkMetrics() {
        // Enroll Doctor
        verifier.enroll(listOf(
            synthesizeSpeech(140f, 1.5f),
            synthesizeSpeech(142f, 1.5f),
            synthesizeSpeech(139f, 1.5f)
        ))

        var falseRejects = 0
        var totalDoctorTrials = 10
        for (i in 0 until totalDoctorTrials) {
            val trial = synthesizeSpeech(140f + (i * 0.2f), 1.0f)
            val res = verifier.verify(trial)
            if (res.state == VoiceLockState.REJECT) falseRejects++
        }
        val frr = falseRejects.toFloat() / totalDoctorTrials
        assertTrue("FRR (False Reject Rate) should be low (<= 10%)", frr <= 0.10f)

        var falseAccepts = 0
        val intruderPitches = listOf(80f, 95f, 210f, 230f, 260f, 300f, 350f, 400f, 450f, 500f)
        for (p in intruderPitches) {
            val trial = synthesizeSpeech(p, 1.0f)
            val res = verifier.verify(trial)
            if (res.state == VoiceLockState.ACCEPT) falseAccepts++
        }
        val far = falseAccepts.toFloat() / intruderPitches.size
        assertEquals("FAR (False Acceptance Rate) must be 0% on distinct intruder voices", 0.0f, far, 1e-6f)
    }
}
