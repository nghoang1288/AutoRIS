package com.autoris.asrbenchmark.benchmark

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class BenchmarkSession(
    val id: Long = System.currentTimeMillis(),
    val timestamp: String = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date()),
    val device: String = "Samsung Galaxy S24 Ultra",
    val model: String = "Zipformer-30M-RNNT-Streaming-6000h",
    val testId: String? = null,
    val category: String? = null,
    val audioDurationSec: Float = 0.0f,
    val firstPartialMs: Long = 0L,
    val finalLatencyMs: Long = 0L,
    val processingMs: Long = 0L,
    val rtf: Float = 0.0f,
    val ramPeakMb: Int = 0,
    val ramAvgMb: Int = 0,
    val batteryPercent: Int = 0,
    val batteryTemp: Float = 0.0f,
    val rawTranscript: String = "",
    val normalizedTranscript: String = "",
    val referenceText: String? = null,
    val cer: Float? = null,
    val wer: Float? = null,
    val medicalTermAccuracy: Float? = null,
    val numericAccuracy: Float? = null,
    val anatomyAccuracy: Float? = null,
    val negationAccuracy: Float? = null,
    val audioPath: String? = null
)
