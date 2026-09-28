package com.autoris.asrbenchmark.asr

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.autoris.asrbenchmark.vad.VadConfig
import com.k2fsa.sherpa.onnx.EndpointConfig
import com.k2fsa.sherpa.onnx.EndpointRule
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import java.io.File

class Zipformer30MStreamingEngine(
    private val context: Context,
    private val vadConfig: VadConfig = VadConfig(),
    private val numThreads: Int = 2
) : ASREngine {

    companion object {
        private const val TAG = "ZipformerStreaming"
    }

    override val name: String = "Zipformer 30M RNNT Streaming 6000h"
    override val isStreaming: Boolean = true

    private var recognizer: OnlineRecognizer? = null
    private var stream: OnlineStream? = null
    private var _isReady: Boolean = false
    override val isReady: Boolean get() = _isReady

    private var latestPartial: String = ""
    private var latestFinal: String = ""

    override fun init(): Boolean {
        return try {
            val status = ModelManager.getModelStatus(context, ASRModelType.ZIPFORMER_30M_STREAMING)
            if (!status.isReady) {
                Log.w(TAG, "Model files not ready in filesDir, checking status...")
                return false
            }

            val featConfig = FeatureConfig(
                sampleRate = 16000,
                featureDim = 80
            )

            val transducerConfig = OnlineTransducerModelConfig(
                encoder = status.encoderPath,
                decoder = status.decoderPath,
                joiner = status.joinerPath
            )

            val modelConfig = OnlineModelConfig(
                transducer = transducerConfig,
                tokens = status.tokensPath,
                numThreads = numThreads,
                provider = "cpu"
            )

            val endpointConfig = EndpointConfig(
                rule1 = EndpointRule(
                    mustContainNonSilence = false,
                    minTrailingSilence = vadConfig.rule1MinTrailingSilence,
                    minUtteranceLength = 0.0f
                ),
                rule2 = EndpointRule(
                    mustContainNonSilence = true,
                    minTrailingSilence = vadConfig.rule2MinTrailingSilence,
                    minUtteranceLength = 0.0f
                ),
                rule3 = EndpointRule(
                    mustContainNonSilence = false,
                    minTrailingSilence = 0.0f,
                    minUtteranceLength = vadConfig.rule3MinUtteranceLength
                )
            )

            val recognizerConfig = OnlineRecognizerConfig(
                featConfig = featConfig,
                modelConfig = modelConfig,
                endpointConfig = endpointConfig,
                enableEndpoint = true,
                decodingMethod = "greedy_search"
            )

            recognizer?.release()
            recognizer = OnlineRecognizer(
                assetManager = null,
                config = recognizerConfig
            )

            _isReady = true
            Log.i(TAG, "OnlineRecognizer initialized successfully!")
            true
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to initialize OnlineRecognizer", e)
            _isReady = false
            false
        }
    }

    override fun start(): Boolean {
        if (!_isReady || recognizer == null) {
            if (!init()) return false
        }
        try {
            stream?.release()
            stream = recognizer?.createStream()
            latestPartial = ""
            latestFinal = ""
            return stream != null
        } catch (e: Exception) {
            Log.e(TAG, "Error starting stream", e)
            return false
        }
    }

    override fun acceptAudio(samples: FloatArray) {
        val s = stream ?: return
        try {
            s.acceptWaveform(samples, 16000)
        } catch (e: Exception) {
            Log.e(TAG, "Error accepting waveform", e)
        }
    }

    override fun decodeStep(): Long {
        val rec = recognizer ?: return 0L
        val s = stream ?: return 0L
        val startTime = SystemClock.elapsedRealtimeNanos()

        try {
            while (rec.isReady(s)) {
                rec.decode(s)
            }
            val res = rec.getResult(s)
            val text = res.text.trim()
            if (text.isNotEmpty()) {
                latestPartial = text
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error during decode step", e)
        }

        val elapsedNanos = SystemClock.elapsedRealtimeNanos() - startTime
        return elapsedNanos / 1_000_000 // Convert to ms
    }

    override fun isEndpoint(): Boolean {
        val rec = recognizer ?: return false
        val s = stream ?: return false
        return try {
            rec.isEndpoint(s)
        } catch (e: Exception) {
            false
        }
    }

    override fun getPartialResult(): String {
        return latestPartial
    }

    override fun getFinalResult(): String {
        val rec = recognizer ?: return latestPartial
        val s = stream ?: return latestPartial
        return try {
            val res = rec.getResult(s)
            val text = res.text.trim()
            if (text.isNotEmpty()) {
                latestFinal = text
            } else {
                latestFinal = latestPartial
            }
            latestFinal
        } catch (e: Exception) {
            latestPartial
        }
    }

    override fun reset() {
        val rec = recognizer
        val s = stream
        if (rec != null && s != null) {
            try {
                rec.reset(s)
            } catch (e: Exception) {
                Log.e(TAG, "Error resetting stream", e)
            }
        }
        latestPartial = ""
    }

    override fun stop() {
        val s = stream
        if (s != null) {
            try {
                s.inputFinished()
                decodeStep()
            } catch (e: Exception) {
                Log.e(TAG, "Error finishing input", e)
            }
        }
    }

    override fun release() {
        try {
            stream?.release()
            stream = null
            recognizer?.release()
            recognizer = null
            _isReady = false
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing engine", e)
        }
    }
}
