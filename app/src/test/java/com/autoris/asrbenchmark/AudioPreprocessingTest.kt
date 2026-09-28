package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.audio.PassthroughAudioPreprocessor
import com.autoris.asrbenchmark.audio.PreprocessingProfile
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class AudioPreprocessingTest {

    @Test
    fun testPreprocessingProfileFromId() {
        assertEquals(PreprocessingProfile.RAW, PreprocessingProfile.fromId("RAW"))
        assertEquals(PreprocessingProfile.RAW, PreprocessingProfile.fromId("raw"))
        assertEquals(PreprocessingProfile.ANDROID_NS, PreprocessingProfile.fromId("ANDROID_NS"))
        assertEquals(PreprocessingProfile.ANDROID_NS_AGC, PreprocessingProfile.fromId("ANDROID_NS_AGC"))
        assertEquals(PreprocessingProfile.DPDFNET, PreprocessingProfile.fromId("DPDFNET"))
        assertEquals(PreprocessingProfile.ANDROID_NS_DPDFNET, PreprocessingProfile.fromId("ANDROID_NS_DPDFNET"))

        // Unknown fallback to RAW
        assertEquals(PreprocessingProfile.RAW, PreprocessingProfile.fromId("UNKNOWN_FILTER"))
    }

    @Test
    fun testPassthroughAudioPreprocessor() {
        val preprocessor = PassthroughAudioPreprocessor()
        assertEquals("Passthrough", preprocessor.name)

        val input = floatArrayOf(0.1f, -0.2f, 0.35f, -0.5f, 0.0f)
        val output = preprocessor.process(input)

        assertNotNull(output)
        assertEquals(input.size, output.size)
        assertArrayEquals(input, output, 0.0001f)

        preprocessor.reset()
        preprocessor.release()
    }

    @Test
    fun testProfilesHaveValidDescriptions() {
        for (profile in PreprocessingProfile.entries) {
            assertNotNull(profile.id)
            assertNotNull(profile.displayName)
            assertNotNull(profile.description)
        }
    }
}
