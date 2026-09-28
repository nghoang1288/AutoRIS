package com.autoris.asrbenchmark

import com.autoris.asrbenchmark.audio.PreprocessingProfile
import com.autoris.asrbenchmark.noise.NoiseScenario
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ScenarioMatrixTest {

    private fun loadMatrixText(): String {
        val candidates = listOf(
            File("benchmark_scenarios_matrix.json"),
            File("../benchmark_scenarios_matrix.json"),
            File("../../benchmark_scenarios_matrix.json")
        )
        val file = candidates.firstOrNull { it.exists() }
            ?: throw IllegalStateException("benchmark_scenarios_matrix.json not found in paths: $candidates")
        return file.readText()
    }

    @Test
    fun testMatrixFileStructureAndVersion() {
        val text = loadMatrixText()
        assertTrue(text.contains("\"version\": \"2.0.0\""))
        assertTrue(text.contains("\"target_hardware\""))
        assertTrue(text.contains("\"Snapdragon 8 Gen 3\""))
        assertTrue(text.contains("\"rooms\""))
        assertTrue(text.contains("\"preprocessing_profiles\""))
        assertTrue(text.contains("\"scenarios_matrix\""))
    }

    @Test
    fun testAllRoomsPresentInMatrix() {
        val text = loadMatrixText()
        // Verify every NoiseScenario enum constant id is defined in the matrix
        for (scenario in NoiseScenario.entries) {
            assertTrue(
                "Room ${scenario.id} (${scenario.name}) should be in benchmark_scenarios_matrix.json",
                text.contains("\"id\": \"${scenario.id}\"") && text.contains("\"room\": \"${scenario.id}\"")
            )
        }
    }

    @Test
    fun testAllProfilesPresentInMatrix() {
        val text = loadMatrixText()
        // Verify every PreprocessingProfile enum constant is defined in the matrix
        for (profile in PreprocessingProfile.entries) {
            assertTrue(
                "Profile ${profile.id} should be in benchmark_scenarios_matrix.json",
                text.contains("\"id\": \"${profile.id}\"") || text.contains("\"test_profile\": \"${profile.id}\"")
            )
        }
    }

    @Test
    fun testScenarioMatrixEntriesAdhereToConstraints() {
        val text = loadMatrixText()

        // Verify acceptance criteria section exists
        assertTrue(text.contains("\"critical_error_tolerance\": 0"))
        assertTrue(text.contains("\"max_allowed_rtf\": 0.25"))

        // Verify all 12 scenario IDs exist
        for (i in 1..12) {
            val scenId = String.format("SCEN_%02d", i)
            assertTrue("Scenario $scenId must exist", text.contains("\"scenario_id\": \"$scenId\""))
        }

        // Verify all 6 clinical rooms are tested in scenarios_matrix
        val testedRooms = NoiseScenario.entries.count { scenario ->
            text.contains("\"room\": \"${scenario.id}\"")
        }
        assertEquals("All 6 clinical rooms must be included in scenarios matrix", 6, testedRooms)
    }
}
