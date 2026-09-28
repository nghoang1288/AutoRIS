package com.autoris.asrbenchmark.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autoris.asrbenchmark.MainViewModel
import com.autoris.asrbenchmark.ui.theme.BorderColor
import com.autoris.asrbenchmark.ui.theme.CyanAccent
import com.autoris.asrbenchmark.ui.theme.DarkBackground
import com.autoris.asrbenchmark.ui.theme.DarkSurface
import com.autoris.asrbenchmark.ui.theme.DarkSurfaceVariant
import com.autoris.asrbenchmark.ui.theme.EmeraldGreen
import com.autoris.asrbenchmark.ui.theme.OrangeWarning
import com.autoris.asrbenchmark.ui.theme.RedError
import com.autoris.asrbenchmark.ui.theme.TextMuted
import com.autoris.asrbenchmark.ui.theme.TextPrimary
import com.autoris.asrbenchmark.ui.theme.TextSecondary
import com.autoris.asrbenchmark.vad.VadState
import java.util.Locale

@Composable
fun DebugScreen(
    viewModel: MainViewModel,
    onNavigateBack: () -> Unit
) {
    val captureState by viewModel.captureState.collectAsState()
    val livePartial by viewModel.livePartial.collectAsState()
    val finalTranscript by viewModel.finalTranscript.collectAsState()
    val metrics by viewModel.metrics.collectAsState()
    val systemStats by viewModel.systemStats.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onNavigateBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
            }
            Spacer(modifier = Modifier.width(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.BugReport, contentDescription = null, tint = CyanAccent)
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "DEBUG MODE & LOGCAT MONITOR",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Audio pipeline card
        DebugCard(title = "AUDIO PIPELINE") {
            DebugRow("Sample Rate", "16,000 Hz (16kHz Mono 16-bit PCM)")
            DebugRow("Audio Source", "VOICE_RECOGNITION (Samsung Tuned)")
            DebugRow("Chunk Buffer", "1600 samples (100 ms per step)")
            DebugRow("Recording Active", if (captureState.isRecording) "YES" else "NO")
            DebugRow("Audio Duration", "${String.format(Locale.ROOT, "%.2f", captureState.audioDurationSec)} s")
            DebugRow("Samples Captured", "${captureState.samplesRecorded} samples")

            Spacer(modifier = Modifier.height(6.dp))
            Text("Realtime Energy dB: ${String.format(Locale.ROOT, "%.1f", captureState.currentDb)} dB", fontSize = 11.sp, color = TextMuted)
            val normalizedDb = ((captureState.currentDb + 90f) / 90f).coerceIn(0f, 1f)
            LinearProgressIndicator(
                progress = normalizedDb,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp)),
                color = if (normalizedDb > 0.6f) EmeraldGreen else CyanAccent
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // VAD & Decoder state card
        DebugCard(title = "VAD & DECODER STATE") {
            val vadColor = when (captureState.vadState) {
                VadState.SPEECH -> EmeraldGreen
                VadState.ENDPOINT -> OrangeWarning
                VadState.SILENCE -> TextMuted
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "VAD State:", fontSize = 12.sp, color = TextSecondary)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(vadColor))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = captureState.vadState.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = vadColor)
                }
            }

            DebugRow("Decoder State", if (captureState.isRecording) "ACTIVE / DECODING" else "IDLE / FINAL")
            DebugRow("Endpoint Detection", "Sherpa-ONNX Native Transducer Endpointing")
            DebugRow("Rule 1 Min Silence", "${viewModel.vadConfig.rule1MinTrailingSilence} s")
            DebugRow("Rule 2 Min Silence", "${viewModel.vadConfig.rule2MinTrailingSilence} s")
            DebugRow("Rule 3 Max Utterance", "${viewModel.vadConfig.rule3MinUtteranceLength} s")
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Transcription buffers
        DebugCard(title = "TRANSCRIPTION BUFFERS") {
            Text(text = "Current Partial Text:", fontSize = 11.sp, color = CyanAccent, fontWeight = FontWeight.Bold)
            Text(
                text = livePartial.ifEmpty { "[EMPTY]" },
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace,
                color = TextPrimary
            )
            Spacer(modifier = Modifier.height(6.dp))
            Divider(color = BorderColor)
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = "Final Transcript Text:", fontSize = 11.sp, color = EmeraldGreen, fontWeight = FontWeight.Bold)
            Text(
                text = finalTranscript.ifEmpty { "[EMPTY]" },
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace,
                color = TextPrimary
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Benchmark & Latency Measurements
        DebugCard(title = "BENCHMARK LATENCY & RTF") {
            DebugRow("First Partial Latency", "${metrics.firstPartialMs} ms")
            DebugRow("Final Latency", "${metrics.finalLatencyMs} ms")
            DebugRow("Total Processing Time", "${metrics.processingMs} ms")
            DebugRow("Real-Time Factor (RTF)", String.format(Locale.ROOT, "%.4f", metrics.rtf))
            DebugRow("RTF Target Threshold", "< 0.150 (Ideal Realtime)")
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Hardware & Performance
        DebugCard(title = "HARDWARE & THERMAL MONITOR") {
            DebugRow("Target Device", systemStats.deviceName)
            DebugRow("Process PSS Memory", "${systemStats.ramCurrentMb} MB")
            DebugRow("Peak Memory (RAM)", "${metrics.ramPeakMb} MB")
            DebugRow("Battery Level", "${systemStats.batteryPercent} %")
            DebugRow("Battery Temperature", "${String.format(Locale.ROOT, "%.1f", systemStats.batteryTempCelsius)} °C")
            DebugRow("Session Elapsed Time", "${systemStats.sessionDurationSec} s")
        }

        Spacer(modifier = Modifier.height(20.dp))
    }
}

@Composable
fun DebugCard(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        shape = RoundedCornerShape(10.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(text = title, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = CyanAccent)
            Spacer(modifier = Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
fun DebugRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, fontSize = 12.sp, color = TextSecondary)
        Text(text = value, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
    }
}
