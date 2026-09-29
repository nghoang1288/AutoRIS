package com.autoris.asrbenchmark.benchmark

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Standardized Benchmark Session V2 Schema.
 * Captures acoustic environment, preprocessing profiles, VAD performance,
 * speaker verification, raw/normalized accuracy, and zero-tolerance medical critical errors.
 */
data class BenchmarkSession(
    // Session Identification
    val id: Long = System.currentTimeMillis(),
    val sessionId: String = "session_${System.currentTimeMillis()}",
    val timestamp: String = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date()),

    // Hardware & Device
    val device: String = "Samsung Galaxy S24 Ultra",
    val deviceModel: String = device,
    val androidVersion: String = android.os.Build.VERSION.RELEASE ?: "Unknown",
    val cpuInfo: String = "Snapdragon 8 Gen 3",
    val model: String = "ZipFormer 150M CR-CTC-RNNT (Offline)",
    val modelName: String = model,
    val modelVersion: String = "1.0.0",
    val numThreads: Int = 4,

    // Environment & Acoustic Scenario
    val testId: String? = null,
    val category: String? = null,
    val roomId: String = "ROOM_01",
    val roomType: String = "reading_room",
    val noiseType: String = "clean",
    val noiseLevel: String = "quiet",
    val speakerDistanceCm: Int = 30,
    val micOrientationDeg: Int = 0,

    // Audio & Preprocessing Pipeline
    val preprocessingProfile: String = "RAW",
    val actualPreprocessingProfile: String = preprocessingProfile,
    val policyRecommendedProfile: String? = null,
    val policyConfidence: Float? = null,
    val policyOverride: Boolean = false,
    val audioDurationSec: Float = 0.0f,
    val audioDurationMs: Long = (audioDurationSec * 1000).toLong(),
    val sampleRate: Int = 16000,
    val channels: Int = 1,
    val vadSegmentCount: Int = 1,
    val vadTotalSpeechMs: Long = 0L,

    // Speaker Gate / Voice Lock
    val speakerLockEnabled: Boolean = false,
    val speakerConfidence: Float = 1.0f,
    val speakerRejection: Boolean = false,

    // Transcripts
    val rawTranscript: String = "",
    val normalizedTranscript: String = "",
    val referenceText: String? = null,
    val reference: String? = referenceText,

    // Accuracy Metrics: Raw & Normalized
    val werRaw: Float? = null,
    val cerRaw: Float? = null,
    val werNormalized: Float? = null,
    val cerNormalized: Float? = null,
    val wer: Float? = werNormalized ?: werRaw,
    val cer: Float? = cerNormalized ?: cerRaw,

    // Medical Clinical Accuracies
    val medicalTermAccuracy: Float? = null,
    val numericAccuracy: Float? = null,
    val measurementAccuracy: Float? = null,
    val anatomyAccuracy: Float? = null,
    val lateralityAccuracy: Float? = null,
    val negationAccuracy: Float? = null,
    val spineLevelAccuracy: Float? = null,

    // Critical Error Flags (Zero Tolerance in Radiology)
    val criticalNumericError: Boolean = false,
    val criticalMeasurementError: Boolean = false,
    val criticalNegationError: Boolean = false,
    val criticalLateralityError: Boolean = false,
    val criticalSpineError: Boolean = false,

    // Latency & Processing (Distinct First Segment vs True Partial)
    val firstSegmentResultLatencyMs: Long = 0L,
    val truePartialLatencyMs: Long? = null,
    val firstPartialMs: Long = firstSegmentResultLatencyMs, // backward compatibility
    val finalLatencyMs: Long = 0L,
    val processingMs: Long = 0L,
    val rtf: Float = if (audioDurationMs > 0L) (processingMs.toFloat() / audioDurationMs.toFloat()) else 0.0f,

    // Hardware Telemetry
    val ramPeakMb: Int = 0,
    val ramAvgMb: Int = 0,
    val batteryPercent: Int = 0,
    val batteryTemp: Float = 0.0f,
    val batteryTemperatureC: Float = batteryTemp,

    // Storage & Diagnostic
    val audioPath: String? = null,
    val errors: List<String> = emptyList()
) {
    /**
     * Ensures RTF is calculated correctly and is not 0 when processing took place.
     */
    fun calculateEffectiveRtf(): Float {
        val durMs = if (audioDurationMs > 0) audioDurationMs else (audioDurationSec * 1000).toLong()
        return if (durMs > 0 && processingMs > 0) {
            processingMs.toFloat() / durMs.toFloat()
        } else {
            rtf
        }
    }

    /**
     * Returns true if any clinical critical error occurred.
     */
    fun hasCriticalError(): Boolean {
        return criticalNumericError ||
               criticalMeasurementError ||
               criticalNegationError ||
               criticalLateralityError ||
               criticalSpineError
    }
}
