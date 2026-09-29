package com.autoris.asrbenchmark.asr

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineTransducerModelConfig
import java.io.File

/**
 * Native Offline ASR Engine for hynt/ZipFormer-150M-CR-CTC-RNNT-6000h.
 * High-accuracy ~153M parameter model for medical radiology transcription.
 */
class Zipformer150MOfflineEngine(
    private val context: Context,
    private val numThreads: Int = 4
) : ASREngine {

    companion object {
        private const val TAG = "Zipformer150MOffline"
    }

    override val name: String = "ZipFormer 150M CR-CTC-RNNT (Offline)"
    override val isStreaming: Boolean = false

    private var recognizer: OfflineRecognizer? = null
    private var _isReady: Boolean = false
    override val isReady: Boolean get() = _isReady

    private val audioChunks = mutableListOf<FloatArray>()
    private var totalSamplesBuffered: Int = 0
    private var resultText: String = ""
    private var lastProcessingTimeMs: Long = 0L

    override fun init(): Boolean {
        return try {
            val status = ModelManager.getModelStatus(context, ASRModelType.ZIPFORMER_150M_OFFLINE)
            if (!status.isReady) {
                Log.w(TAG, "ZipFormer 150M model files not ready")
                return false
            }

            val featConfig = FeatureConfig(
                sampleRate = 16000,
                featureDim = 80
            )

            val transducerConfig = OfflineTransducerModelConfig(
                encoder = status.encoderPath,
                decoder = status.decoderPath,
                joiner = status.joinerPath
            )

            val modelConfig = OfflineModelConfig(
                transducer = transducerConfig,
                tokens = status.tokensPath,
                numThreads = numThreads,
                provider = "cpu",
                debug = false
            )

            val config = OfflineRecognizerConfig(
                featConfig = featConfig,
                modelConfig = modelConfig,
                decodingMethod = "greedy_search"
            )

            recognizer?.release()
            recognizer = OfflineRecognizer(assetManager = null, config = config)
            _isReady = true
            Log.i(TAG, "ZipFormer 150M Offline engine initialized successfully with $numThreads threads")
            true
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to initialize ZipFormer 150M Offline engine", e)
            _isReady = false
            false
        }
    }

    override fun start(): Boolean {
        if (!_isReady || recognizer == null) return false
        synchronized(audioChunks) {
            audioChunks.clear()
            totalSamplesBuffered = 0
        }
        resultText = ""
        lastProcessingTimeMs = 0L
        return true
    }

    override fun acceptAudio(samples: FloatArray) {
        if (samples.isEmpty()) return
        synchronized(audioChunks) {
            audioChunks.add(samples.clone())
            totalSamplesBuffered += samples.size
        }
    }

    override fun decodeStep(): Long {
        // Offline engine decodes upon stop/endpoint
        return 0L
    }

    override fun isEndpoint(): Boolean = false

    override fun getPartialResult(): String {
        return if (totalSamplesBuffered > 0) {
            val sec = totalSamplesBuffered / 16000.0f
            String.format("🎙️ Đang ghi âm (%.1fs)... Sẽ nhận diện chính xác khi dừng nói", sec)
        } else ""
    }

    override fun getFinalResult(): String = resultText

    override fun reset() {
        synchronized(audioChunks) {
            audioChunks.clear()
            totalSamplesBuffered = 0
        }
        resultText = ""
        lastProcessingTimeMs = 0L
    }

    override fun stop() {
        val rec = recognizer ?: return
        val samples: FloatArray
        synchronized(audioChunks) {
            if (totalSamplesBuffered == 0) return
            samples = FloatArray(totalSamplesBuffered)
            var offset = 0
            for (chunk in audioChunks) {
                System.arraycopy(chunk, 0, samples, offset, chunk.size)
                offset += chunk.size
            }
        }
        if (samples.isEmpty()) return

        val t0 = SystemClock.elapsedRealtime()
        try {
            val stream = rec.createStream()
            stream.acceptWaveform(samples, 16000)
            rec.decode(stream)
            val res = rec.getResult(stream)
            resultText = res.text.trim()
            lastProcessingTimeMs = SystemClock.elapsedRealtime() - t0
            stream.release()
            Log.i(TAG, "Decoded ${samples.size / 16000f}s in ${lastProcessingTimeMs}ms: $resultText")
        } catch (e: Exception) {
            Log.e(TAG, "Offline decode error", e)
        }
    }

    override fun decodeSegment(samples: FloatArray): Pair<String, Long> {
        val rec = recognizer ?: return Pair("", 0L)
        if (samples.isEmpty()) return Pair("", 0L)
        val t0 = SystemClock.elapsedRealtime()
        return try {
            val stream = rec.createStream()
            stream.acceptWaveform(samples, 16000)
            rec.decode(stream)
            val res = rec.getResult(stream)
            val text = res.text.trim()
            val costMs = SystemClock.elapsedRealtime() - t0
            stream.release()
            Pair(text, costMs)
        } catch (e: Exception) {
            Log.e(TAG, "Segment decode error", e)
            Pair("", 0L)
        }
    }

    override fun release() {
        recognizer?.release()
        recognizer = null
        _isReady = false
        synchronized(audioChunks) {
            audioChunks.clear()
            totalSamplesBuffered = 0
        }
    }
}
