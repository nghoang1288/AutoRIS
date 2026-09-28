package com.autoris.asrbenchmark.vad

enum class VadState {
    SILENCE,
    SPEECH,
    ENDPOINT
}

data class VadConfig(
    val silenceThresholdDb: Float = -40.0f,      // dB threshold for energy VAD
    val rule1MinTrailingSilence: Float = 2.4f,   // Sherpa endpoint rule 1 (seconds)
    val rule2MinTrailingSilence: Float = 1.2f,   // Sherpa endpoint rule 2 (seconds)
    val rule3MinUtteranceLength: Float = 25.0f,  // Sherpa endpoint rule 3 (seconds)
    val minSpeechDurationMs: Long = 200L,        // Minimum speech duration to confirm speech start
    val endpointDelayMs: Long = 1000L            // Delay after silence before triggering endpoint
)
