package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.audio.VoiceLock
import com.autoris.asrbenchmark.audio.VoiceLockState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sin

class VoiceLockTest {

    @Test
    fun testVoiceLockDefaultDisabledPassesAll() {
        val lock = VoiceLock(isEnabled = false)
        assertFalse(lock.isEnabled)
        assertFalse(lock.isEnrolled)

        val dummyAudio = FloatArray(3200) { 0.1f }
        val result = lock.verify(dummyAudio)

        assertTrue(result.isAccepted)
        assertEquals(VoiceLockState.ACCEPT, result.state)
        assertEquals(1.0f, result.confidence, 0.001f)
    }

    @Test
    fun testVoiceLockEnrollmentAndMatching() {
        val lock = VoiceLock(isEnabled = true, acceptThreshold = 0.65f, rejectThreshold = 0.40f)

        // Generate 16000 samples of 400Hz doctor voice
        val sampleRate = 16000
        val doctorAudio = FloatArray(sampleRate * 2) { i ->
            (sin(2.0 * Math.PI * 400.0 * i / sampleRate)).toFloat() * 0.5f
        }

        val enrolled = lock.enroll(doctorAudio)
        assertTrue(enrolled)
        assertTrue(lock.isEnrolled)

        // Verify with same voice
        val testDoctorAudio = FloatArray(sampleRate) { i ->
            (sin(2.0 * Math.PI * 400.0 * i / sampleRate)).toFloat() * 0.45f
        }
        val matchResult = lock.verify(testDoctorAudio)
        assertTrue("Doctor voice must be ACCEPTED", matchResult.isAccepted)
        assertTrue(matchResult.confidence >= 0.65f)

        // Verify with completely different high-frequency noise/interloper voice (3500Hz)
        val interloperAudio = FloatArray(sampleRate) { i ->
            (sin(2.0 * Math.PI * 3500.0 * i / sampleRate)).toFloat() * 0.3f
        }
        val diffResult = lock.verify(interloperAudio)
        assertTrue(diffResult.confidence < matchResult.confidence)

        // Clear enrollment
        lock.clearEnrollment()
        assertFalse(lock.isEnrolled)
    }

    @Test
    fun testThresholdAdjustment() {
        val lock = VoiceLock(isEnabled = true, acceptThreshold = 0.90f, rejectThreshold = 0.50f)
        assertEquals(0.90f, lock.acceptThreshold, 0.001f)
        assertEquals(0.50f, lock.rejectThreshold, 0.001f)
    }
}
