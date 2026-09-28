package com.autoris.asrbenchmark.noise

import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Current acoustic noise telemetry snapshot.
 */
data class NoiseProfile(
    val noiseFloorDb: Float = -50.0f,
    val currentDb: Float = -60.0f,
    val snrDb: Float = 0.0f,
    val noiseLevel: String = "quiet",
    val speechThresholdDb: Float = -43.0f,
    val silenceThresholdDb: Float = -47.0f
)

/**
 * Adaptive noise floor tracker using a sliding percentile energy window.
 * Continuously adapts to ambient acoustic changes (fans turning on/off, doors opening).
 * Supports rapid 500ms initial calibration.
 */
class AdaptiveNoiseTracker(
    private val windowSizeChunks: Int = 30, // 3.0s at 100ms/chunk
    private val percentile: Float = 0.15f,   // 15th percentile represents ambient noise floor
    private val speechDeltaDb: Float = 7.0f,
    private val silenceDeltaDb: Float = 3.0f
) {
    private val energyWindow = FloatArray(windowSizeChunks) { -50.0f }
    private var windowIndex = 0
    private var chunksCount = 0
    private var isCalibrated = false
    private var currentNoiseFloorDb: Float = -50.0f

    /**
     * Rapidly calibrate the baseline noise floor from ambient silence chunks (e.g. 500ms - 1s).
     */
    fun calibrate(ambientPcmSamples: FloatArray, sampleRate: Int = 16000) {
        if (ambientPcmSamples.isEmpty()) return

        val chunkSize = sampleRate / 10 // 100ms
        val numChunks = ambientPcmSamples.size / chunkSize
        if (numChunks == 0) return

        val chunkDbs = mutableListOf<Float>()
        for (c in 0 until numChunks) {
            val offset = c * chunkSize
            var sumSquare = 0.0
            for (i in 0 until chunkSize) {
                val s = ambientPcmSamples[offset + i]
                sumSquare += (s * s)
            }
            val rms = sqrt(sumSquare / chunkSize)
            val db = if (rms > 0.0) (20 * log10(rms)).toFloat().coerceIn(-90f, 0f) else -90f
            chunkDbs.add(db)
        }

        chunkDbs.sort()
        val pIdx = (chunkDbs.size * percentile).toInt().coerceIn(0, chunkDbs.size - 1)
        val calibratedFloor = chunkDbs[pIdx].coerceIn(-65.0f, -28.0f)

        // Seed window with calibrated baseline
        energyWindow.fill(calibratedFloor)
        currentNoiseFloorDb = calibratedFloor
        isCalibrated = true
    }

    /**
     * Updates tracker with incoming chunk RMS dB.
     */
    fun update(currentDb: Float): NoiseProfile {
        energyWindow[windowIndex] = currentDb
        windowIndex = (windowIndex + 1) % energyWindow.size
        chunksCount++

        val validCount = minOf(chunksCount, energyWindow.size)
        val sorted = FloatArray(validCount)
        for (i in 0 until validCount) {
            sorted[i] = energyWindow[i]
        }
        sorted.sort()

        val pIdx = (validCount * percentile).toInt().coerceIn(0, validCount - 1)
        currentNoiseFloorDb = sorted[pIdx].coerceIn(-65.0f, -28.0f)

        val speechThresh = (currentNoiseFloorDb + speechDeltaDb).coerceIn(-46.0f, -25.0f)
        val silenceThresh = (currentNoiseFloorDb + silenceDeltaDb).coerceIn(-50.0f, -29.0f)
        val snr = maxOf(0.0f, currentDb - currentNoiseFloorDb)

        val level = when {
            currentNoiseFloorDb < -46.0f -> "quiet"
            currentNoiseFloorDb < -37.0f -> "moderate"
            else -> "loud"
        }

        return NoiseProfile(
            noiseFloorDb = currentNoiseFloorDb,
            currentDb = currentDb,
            snrDb = snr,
            noiseLevel = level,
            speechThresholdDb = speechThresh,
            silenceThresholdDb = silenceThresh
        )
    }

    fun getEstimatedNoiseFloor(): Float = currentNoiseFloorDb

    fun reset(initialFloorDb: Float = -50.0f) {
        energyWindow.fill(initialFloorDb)
        windowIndex = 0
        chunksCount = 0
        isCalibrated = false
        currentNoiseFloorDb = initialFloorDb
    }
}
