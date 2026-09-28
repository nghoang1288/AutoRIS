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

    @Test
    fun testDpdfNetGracefulFallbackWhenModelAbsent() {
        val nonExistentFile = java.io.File("non_existent_dpdfnet.onnx")
        val dpdf = com.autoris.asrbenchmark.audio.DpdfNetAudioPreprocessor(modelFile = nonExistentFile)

        assertEquals("DPDFNet", dpdf.name)
        org.junit.Assert.assertFalse(dpdf.isModelLoaded)

        val input = floatArrayOf(0.05f, -0.1f, 0.4f)
        val output = dpdf.process(input)
        assertArrayEquals(input, output, 0.0001f)

        dpdf.reset()
        dpdf.release()
    }

    @Test
    fun testAudioPreprocessorFactory() {
        val rawPrep = com.autoris.asrbenchmark.audio.AudioPreprocessorFactory.create(PreprocessingProfile.RAW)
        assertEquals("Passthrough", rawPrep.name)

        val nsPrep = com.autoris.asrbenchmark.audio.AudioPreprocessorFactory.create(PreprocessingProfile.ANDROID_NS)
        assertEquals("Passthrough", nsPrep.name)

        val dpdfPrep = com.autoris.asrbenchmark.audio.AudioPreprocessorFactory.create(PreprocessingProfile.DPDFNET)
        assertEquals("DPDFNet", dpdfPrep.name)

        val cascadePrep = com.autoris.asrbenchmark.audio.AudioPreprocessorFactory.create(PreprocessingProfile.ANDROID_NS_DPDFNET)
        assertEquals("DPDFNet", cascadePrep.name)
    }
}
