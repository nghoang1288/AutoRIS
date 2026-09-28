package com.autoris.asrbenchmark.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import com.autoris.asrbenchmark.benchmark.SystemMonitor
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
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.vector.ImageVector
import com.autoris.asrbenchmark.ui.theme.DarkSurface
import com.autoris.asrbenchmark.ui.theme.DarkSurfaceVariant
import com.autoris.asrbenchmark.ui.theme.EmeraldGreen
import com.autoris.asrbenchmark.ui.theme.MetricCardBg
import com.autoris.asrbenchmark.ui.theme.OrangeWarning
import com.autoris.asrbenchmark.ui.theme.RedError
import com.autoris.asrbenchmark.ui.theme.TextMuted
import com.autoris.asrbenchmark.ui.theme.TextPrimary
import com.autoris.asrbenchmark.ui.theme.TextSecondary
import com.autoris.asrbenchmark.vad.VadState
import java.util.Locale

@Composable
fun HomeScreen(
    viewModel: MainViewModel,
    onNavigateToTestSet: () -> Unit,
    onNavigateToHistory: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToDebug: () -> Unit
) {
    val captureState by viewModel.captureState.collectAsState()
    val livePartial by viewModel.livePartial.collectAsState()
    val finalTranscript by viewModel.finalTranscript.collectAsState()
    val normalizedResult by viewModel.normalizedResult.collectAsState()
    val metrics by viewModel.metrics.collectAsState()
    val systemStats by viewModel.systemStats.collectAsState()
    val selectedSentence by viewModel.selectedTestSentence.collectAsState()
    val evaluationReport by viewModel.evaluationReport.collectAsState()
    val statusMessage by viewModel.statusMessage.collectAsState()
    val selectedModelType by viewModel.selectedModelType.collectAsState()

    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
            .verticalScroll(scrollState)
    ) {
        // === HEADER ===
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "VI ASR BENCHMARK",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Text(
                    text = SystemMonitor.getDeviceModel(),
                    fontSize = 12.sp,
                    color = CyanAccent,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Row {
                IconButton(onClick = onNavigateToDebug) {
                    Icon(Icons.Default.BugReport, contentDescription = "Debug", tint = TextSecondary)
                }
                IconButton(onClick = onNavigateToHistory) {
                    Icon(Icons.Default.History, contentDescription = "History", tint = TextSecondary)
                }
                IconButton(onClick = onNavigateToSettings) {
                    Icon(Icons.Default.Settings, contentDescription = "Settings", tint = TextSecondary)
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Model & Status Card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .clickable { onNavigateToSettings() },
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(10.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = "Model đang chạy (Nhấn để đổi):", fontSize = 11.sp, color = TextMuted)
                    Text(
                        text = selectedModelType.displayName,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = CyanAccent
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val statusDotColor = when {
                        captureState.isRecording -> RedError
                        statusMessage.contains("Sẵn sàng") -> EmeraldGreen
                        else -> OrangeWarning
                    }
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(statusDotColor)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (captureState.isRecording) "Thu âm (${captureState.currentDb.toInt()} dB)" else statusMessage,
                        fontSize = 12.sp,
                        color = if (captureState.isRecording) RedError else TextSecondary
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === REFERENCE (IF TEST SELECTED) ===
        if (selectedSentence != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant),
                shape = RoundedCornerShape(10.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${selectedSentence!!.id} • ${selectedSentence!!.category}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = CyanAccent
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(
                                onClick = { viewModel.previousTestSentence() },
                                modifier = Modifier.height(28.dp),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp)
                            ) {
                                Text("⏮️ Trước", fontSize = 11.sp)
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                            OutlinedButton(
                                onClick = { viewModel.selectTestSentence(null) },
                                modifier = Modifier.height(28.dp),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp)
                            ) {
                                Text("Đóng", fontSize = 11.sp)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "VĂN BẢN MẪU (REFERENCE):",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextMuted
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = selectedSentence!!.referenceText,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = TextPrimary,
                        lineHeight = 22.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Prominent "CÂU TEST TIẾP THEO" Button
            Button(
                onClick = { viewModel.nextTestSentence() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp),
                colors = ButtonDefaults.buttonColors(containerColor = CyanAccent),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(
                    text = "🎲 CÂU TIẾP THEO (NGẪU NHIÊN)",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.Black
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
        }

        // === MAIN MIC BUTTON ===
        Button(
            onClick = { viewModel.toggleRecording() },
            modifier = Modifier
                .fillMaxWidth()
                .height(60.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (captureState.isRecording) RedError else EmeraldGreen
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(
                imageVector = if (captureState.isRecording) Icons.Default.Stop else Icons.Default.Mic,
                contentDescription = null,
                modifier = Modifier.size(26.dp),
                tint = Color.White
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = if (captureState.isRecording)
                    "⏹ DỪNG THU ÂM (${String.format(Locale.ROOT, "%.1f", captureState.audioDurationSec)}s) - LƯU & GỬI PC"
                else
                    "🎙 BẮT ĐẦU ĐỌC",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === TRANSCRIPT DISPLAY ===
        val currentText = finalTranscript.ifEmpty { livePartial }
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .border(
                    1.dp,
                    if (captureState.isRecording) RedError.copy(alpha = 0.8f) else if (currentText.isNotEmpty()) EmeraldGreen else BorderColor,
                    RoundedCornerShape(12.dp)
                ),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (captureState.isRecording) RedError else EmeraldGreen)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "KẾT QUẢ PHIÊN ÂM",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (captureState.isRecording) CyanAccent else EmeraldGreen
                        )
                    }
                    if (captureState.isRecording) {
                        Text(
                            text = "VAD: ${captureState.vadState.name}",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = when (captureState.vadState) {
                                VadState.SPEECH -> EmeraldGreen
                                VadState.ENDPOINT -> OrangeWarning
                                else -> TextMuted
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = currentText.ifEmpty {
                        if (captureState.isRecording) "🎙️ Đang lắng nghe... Hãy đọc câu của bạn (nghỉ 1-2s máy sẽ tự động hiện kết quả)"
                        else "Nhấn nút màu xanh bên trên để bắt đầu đọc liên tục..."
                    },
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.SansSerif,
                    color = if (currentText.isNotEmpty()) TextPrimary else TextMuted,
                    lineHeight = 24.sp
                )

                // Normalized Suggestion Log
                if (normalizedResult != null && normalizedResult!!.suggestionsLog.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Divider(color = BorderColor)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "✨ ĐÃ CHUẨN HÓA CĐHA / ĐO ĐẠC / GIẢI PHẪU:",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = OrangeWarning
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = normalizedResult!!.normalizedSuggestion,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = EmeraldGreen,
                        lineHeight = 22.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    for (log in normalizedResult!!.suggestionsLog) {
                        Text(text = "• $log", fontSize = 11.sp, color = TextSecondary)
                    }
                }
            }
        }

        // === ACCURACY EVALUATION (IF TEST SELECTED & FINISHED) ===
        if (evaluationReport != null) {
            Spacer(modifier = Modifier.height(10.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = DarkSurfaceVariant),
                shape = RoundedCornerShape(10.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "KẾT QUẢ ĐÁNH GIÁ ĐỘ CHÍNH XÁC",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = CyanAccent
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        MetricItem("WER", String.format(Locale.ROOT, "%.1f%%", evaluationReport!!.wer * 100))
                        MetricItem("CER", String.format(Locale.ROOT, "%.1f%%", evaluationReport!!.cer * 100))
                        MetricItem("Term Acc", String.format(Locale.ROOT, "%.0f%%", evaluationReport!!.medicalTermAccuracy * 100))
                        MetricItem("Num Acc", String.format(Locale.ROOT, "%.0f%%", evaluationReport!!.numericAccuracy * 100))
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === METRICS CARD ===
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MetricCardBg),
            shape = RoundedCornerShape(10.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    text = "METRICS",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextMuted
                )
                Spacer(modifier = Modifier.height(10.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MetricItem("Audio duration", "${String.format(Locale.ROOT, "%.1f", metrics.audioDurationSec)} s")
                    MetricItem("First partial", "${metrics.firstPartialMs} ms")
                    MetricItem("Final latency", "${metrics.finalLatencyMs} ms")
                }
                Spacer(modifier = Modifier.height(10.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MetricItem("Processing time", "${metrics.processingMs} ms")
                    MetricItem("RTF", String.format(Locale.ROOT, "%.3f", metrics.rtf))
                    MetricItem("Peak RAM", "${metrics.ramPeakMb} MB")
                }
                Spacer(modifier = Modifier.height(10.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MetricItem("Battery", "${systemStats.batteryPercent} %")
                    MetricItem("Temperature", "${String.format(Locale.ROOT, "%.1f", systemStats.batteryTempCelsius)} °C")
                    MetricItem("Avg RAM", "${systemStats.ramCurrentMb} MB")
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === ACTION BUTTONS ===
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = { viewModel.saveCurrentTestSession() },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                shape = RoundedCornerShape(8.dp),
                enabled = finalTranscript.isNotEmpty()
            ) {
                Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("LƯU TEST", fontSize = 12.sp)
            }

            Button(
                onClick = { viewModel.resetTest() },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("XÓA", fontSize = 12.sp)
            }

            Button(
                onClick = {
                    viewModel.resetTest()
                    viewModel.startRecording()
                },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("TEST LẠI", fontSize = 12.sp)
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Navigation to Test Set
        OutlinedButton(
            onClick = onNavigateToTestSet,
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp),
            shape = RoundedCornerShape(8.dp)
        ) {
            Icon(Icons.Default.FormatListBulleted, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("📋 CHỌN BỘ CÂU TEST CĐHA (55 CÂU)", fontSize = 13.sp)
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
fun MetricItem(label: String, value: String) {
    Column {
        Text(text = label, fontSize = 10.sp, color = TextMuted)
        Text(text = value, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
    }
}
