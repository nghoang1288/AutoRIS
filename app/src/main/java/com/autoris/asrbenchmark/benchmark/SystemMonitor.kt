package com.autoris.asrbenchmark.benchmark

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Debug
import android.os.Process

data class SystemStats(
    val deviceName: String,
    val ramCurrentMb: Int,
    val ramPeakMb: Int,
    val batteryPercent: Int,
    val batteryTempCelsius: Float,
    val sessionDurationSec: Long
)

class SystemMonitor(private val context: Context) {

    private var peakRamMb: Int = 0
    private var ramSamples = mutableListOf<Int>()
    private val sessionStartMs: Long = System.currentTimeMillis()

    fun pollStats(): SystemStats {
        val ramMb = getProcessMemoryMb()
        if (ramMb > peakRamMb) {
            peakRamMb = ramMb
        }
        ramSamples.add(ramMb)
        if (ramSamples.size > 200) ramSamples.removeAt(0)

        val (batteryPct, batteryTemp) = getBatteryInfo()
        val durationSec = (System.currentTimeMillis() - sessionStartMs) / 1000L

        return SystemStats(
            deviceName = getDeviceModel(),
            ramCurrentMb = ramMb,
            ramPeakMb = peakRamMb,
            batteryPercent = batteryPct,
            batteryTempCelsius = batteryTemp,
            sessionDurationSec = durationSec
        )
    }

    fun getAverageRamMb(): Int {
        if (ramSamples.isEmpty()) return getProcessMemoryMb()
        return ramSamples.average().toInt()
    }

    fun getPeakRamMb(): Int = peakRamMb

    private fun getProcessMemoryMb(): Int {
        return try {
            val memInfo = Debug.MemoryInfo()
            Debug.getMemoryInfo(memInfo)
            // Total PSS in KB -> MB
            memInfo.totalPss / 1024
        } catch (e: Exception) {
            val runtime = Runtime.getRuntime()
            ((runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024)).toInt()
        }
    }

    fun getBatteryInfo(): Pair<Int, Float> {
        return try {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus: Intent? = context.registerReceiver(null, filter)
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val pct = if (level >= 0 && scale > 0) (level * 100) / scale else 0

            val rawTemp = batteryStatus?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
            val tempCelsius = rawTemp / 10.0f
            Pair(pct, tempCelsius)
        } catch (e: Exception) {
            Pair(0, 0.0f)
        }
    }

    companion object {
        fun getDeviceModel(): String {
            val manufacturer = Build.MANUFACTURER
            val model = Build.MODEL
            return if (model.startsWith(manufacturer, ignoreCase = true)) {
                model
            } else {
                "$manufacturer $model"
            }
        }
    }
}
