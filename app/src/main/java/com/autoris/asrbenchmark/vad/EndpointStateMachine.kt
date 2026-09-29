package com.autoris.asrbenchmark.vad

/**
 * Robust VAD Endpoint State Machine.
 * Prevents premature sentence truncation and phantom utterances in noisy radiology reading rooms.
 * States:
 * SILENCE -> POSSIBLE_SPEECH -> SPEECH -> POSSIBLE_ENDPOINT -> ENDPOINT_CONFIRMED
 */
enum class EndpointState {
    SILENCE,
    POSSIBLE_SPEECH,
    SPEECH,
    POSSIBLE_ENDPOINT,
    ENDPOINT_CONFIRMED
}

class EndpointStateMachine(
    val minSpeechChunksToEnter: Int = 2,       // 200ms (2 chunks * 100ms) to confirm genuine speech
    val minSilenceChunksForPossible: Int = 5,  // 500ms (5 chunks) to enter tentative pause
    val minSilenceChunksForConfirmed: Int = 10 // 1000ms (10 chunks) to trigger natural sentence boundary
) {
    var state: EndpointState = EndpointState.SILENCE
        private set

    var speechStreak: Int = 0
        private set

    var silenceStreak: Int = 0
        private set

    var totalSpeechChunksInUtterance: Int = 0
        private set

    /**
     * Updates state machine with the latest 100ms chunk observation.
     * Incorporates speech probability and adaptive SNR thresholding to resist false triggers.
     */
    fun update(
        isSpeech: Boolean,
        speechProbability: Float,
        currentDb: Float,
        noiseFloorDb: Float
    ): EndpointState {
        // Effective speech detection requires either neural probability >= 0.50 OR energy >= floor + 7dB
        val effectiveSpeech = isSpeech || (speechProbability >= 0.50f) || (currentDb >= (noiseFloorDb + 7.0f))

        if (effectiveSpeech) {
            speechStreak++
            silenceStreak = 0
            totalSpeechChunksInUtterance++

            state = when (state) {
                EndpointState.SILENCE -> {
                    if (speechStreak >= minSpeechChunksToEnter) EndpointState.SPEECH else EndpointState.POSSIBLE_SPEECH
                }
                EndpointState.POSSIBLE_SPEECH -> {
                    if (speechStreak >= minSpeechChunksToEnter) EndpointState.SPEECH else EndpointState.POSSIBLE_SPEECH
                }
                EndpointState.SPEECH -> EndpointState.SPEECH
                EndpointState.POSSIBLE_ENDPOINT -> {
                    // Resumed speaking during tentative pause; recover to SPEECH
                    EndpointState.SPEECH
                }
                EndpointState.ENDPOINT_CONFIRMED -> {
                    // Start of new phrase
                    EndpointState.POSSIBLE_SPEECH
                }
            }
        } else {
            silenceStreak++
            speechStreak = 0

            state = when (state) {
                EndpointState.SILENCE -> EndpointState.SILENCE
                EndpointState.POSSIBLE_SPEECH -> {
                    // False trigger / brief click; revert to SILENCE
                    EndpointState.SILENCE
                }
                EndpointState.SPEECH -> {
                    if (silenceStreak >= minSilenceChunksForConfirmed) {
                        EndpointState.ENDPOINT_CONFIRMED
                    } else if (silenceStreak >= minSilenceChunksForPossible) {
                        EndpointState.POSSIBLE_ENDPOINT
                    } else {
                        EndpointState.SPEECH
                    }
                }
                EndpointState.POSSIBLE_ENDPOINT -> {
                    if (silenceStreak >= minSilenceChunksForConfirmed) {
                        EndpointState.ENDPOINT_CONFIRMED
                    } else {
                        EndpointState.POSSIBLE_ENDPOINT
                    }
                }
                EndpointState.ENDPOINT_CONFIRMED -> {
                    EndpointState.SILENCE
                }
            }
        }

        return state
    }

    /**
     * Resets state for a new utterance or recording session.
     */
    fun reset() {
        state = EndpointState.SILENCE
        speechStreak = 0
        silenceStreak = 0
        totalSpeechChunksInUtterance = 0
    }
}
