package com.autoris.asrbenchmark.ui.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Haptic feedback helper for subtle physical feedback on dictation start/stop.
 */
object HapticHelper {

    /**
     * Crisp subtle tick when dictation begins (40ms, subtle amplitude)
     */
    fun vibrateStart(context: Context) {
        vibrate(context, durationMs = 40L, amplitude = 90)
    }

    /**
     * Crisp double-tap / release confirmation when dictation stops (60ms, medium amplitude)
     */
    fun vibrateStop(context: Context) {
        vibrate(context, durationMs = 60L, amplitude = 120)
    }

    private fun vibrate(context: Context, durationMs: Long, amplitude: Int) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(
                    VibrationEffect.createOneShot(durationMs, amplitude.coerceIn(1, 255))
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                vibrator?.vibrate(
                    VibrationEffect.createOneShot(durationMs, amplitude.coerceIn(1, 255))
                )
            } else {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                vibrator?.vibrate(durationMs)
            }
        } catch (_: Throwable) {
            // Silently ignore if device doesn't have vibrator
        }
    }
}
