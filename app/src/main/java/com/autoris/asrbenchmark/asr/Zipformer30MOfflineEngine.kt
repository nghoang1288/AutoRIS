package com.autoris.asrbenchmark.asr

import android.content.Context
import android.util.Log

/**
 * Placeholder / reserved implementation for Zipformer 30M Offline / Non-streaming ASR.
 * Allows seamless switching and A/B benchmark comparison in subsequent iterations.
 */
class Zipformer30MOfflineEngine(
    private val context: Context
) : ASREngine {

    companion object {
        private const val TAG = "ZipformerOffline"
    }

    override val name: String = "Zipformer 30M Offline (Reserved)"
    override val isStreaming: Boolean = false
    override val isReady: Boolean = false

    private val audioBuffer = mutableListOf<Float>()
    private var resultText: String = ""

    override fun init(): Boolean {
        Log.i(TAG, "Offline engine stub initialized (reserved for Phase 2)")
        return true
    }

    override fun start(): Boolean {
        audioBuffer.clear()
        resultText = ""
        return true
    }

    override fun acceptAudio(samples: FloatArray) {
        synchronized(audioBuffer) {
            for (s in samples) {
                audioBuffer.add(s)
            }
        }
    }

    override fun decodeStep(): Long {
        // Non-streaming engines decode on stop/endpoint, not on partial steps
        return 0L
    }

    override fun isEndpoint(): Boolean = false

    override fun getPartialResult(): String = ""

    override fun getFinalResult(): String {
        return resultText
    }

    override fun reset() {
        synchronized(audioBuffer) {
            audioBuffer.clear()
        }
        resultText = ""
    }

    override fun stop() {
        Log.i(TAG, "Offline decode triggered for ${audioBuffer.size} samples")
        // Offline decode implementation will run here
    }

    override fun release() {
        audioBuffer.clear()
    }
}
