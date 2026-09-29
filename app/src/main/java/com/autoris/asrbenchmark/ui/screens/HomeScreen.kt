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
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autoris.asrbenchmark.AppOperatingMode
import com.autoris.asrbenchmark.MainViewModel
import com.autoris.asrbenchmark.safety.SafetyGateStatus
import com.autoris.asrbenchmark.ui.theme.BorderColor
import com.autoris.asrbenchmark.ui.theme.CyanAccent
import com.autoris.asrbenchmark.ui.theme.DarkBackground
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

private data class SafetyBadgeConfig(
    val bg: Color,
    val border: Color,
    val title: String,
    val icon: ImageVector
)

@Composable
fun HomeScreen(
    viewModel: MainViewModel,
    onNavigateToTestSet: () -> Unit,
    onNavigateToHistory: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToDebug: () -> Unit,
    onNavigateToNoiseLab: () -> Unit
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
    val modelStatus by viewModel.modelStatus.collectAsState()
    val selectedModelType by viewModel.selectedModelType.collectAsState()
    val selectedScenario by viewModel.selectedScenario.collectAsState()
    val activeProfile by viewModel.preprocessingProfile.collectAsState()
    val operatingMode by viewModel.operatingMode.collectAsState()
    val safetyGateDecision by viewModel.safetyGateDecision.collectAsState()

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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "AUTORIS ASR",
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(DarkSurface)
                            .border(1.dp, BorderColor, RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "150M SOTA",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = CyanAccent
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val statusDotColor = when {
                        captureState.isRecording -> RedError
                        statusMessage.contains("Sẵn sàng") || modelStatus.isReady -> EmeraldGreen
                        else -> OrangeWarning
                    }
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(statusDotColor)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = if (captureState.isRecording) "Đang thu (${captureState.currentDb.toInt()} dB)" else statusMessage,
                        fontSize = 11.sp,
                        color = if (captureState.isRecording) RedError else TextSecondary
                    )
                }
            }
            Row {
                IconButton(onClick = onNavigateToNoiseLab) {
                    Icon(Icons.Default.GraphicEq, contentDescription = "Noise Lab", tint = CyanAccent)
                }
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

        // === OPERATING MODE SELECTOR (CLINICAL SAFE VS BENCHMARK) ===
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(DarkSurface),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            val isClinical = operatingMode == AppOperatingMode.CLINICAL_SAFE
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isClinical) CyanAccent else Color.Transparent)
                    .clickable { viewModel.setOperatingMode(AppOperatingMode.CLINICAL_SAFE) }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "🏥 LÂM SÀNG (PACS/RIS)",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (isClinical) Color.Black else TextSecondary
                )
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (!isClinical) CyanAccent else Color.Transparent)
                    .clickable { viewModel.setOperatingMode(AppOperatingMode.BENCHMARK) }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "🔬 BENCHMARK & METRICS",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (!isClinical) Color.Black else TextSecondary
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Compact Acoustic Room & DSP Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(6.dp))
                .background(DarkSurface)
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.GraphicEq, contentDescription = null, tint = CyanAccent, modifier = Modifier.size(14.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "${selectedScenario.displayName} • DSP: $activeProfile (Tự động thích ứng)",
                fontSize = 11.sp,
                color = TextSecondary
            )
        }

        Spacer(modifier = Modifier.height(10.dp))

        // === BENCHMARK ONLY: REFERENCE TEST SENTENCE CARD ===
        if (operatingMode == AppOperatingMode.BENCHMARK && selectedSentence != null) {
            val allSentences = com.autoris.asrbenchmark.benchmark.MedicalTestSet.SENTENCES
            val sIndex = allSentences.indexOfFirst { it.id == selectedSentence!!.id }
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
                            text = "${selectedSentence!!.id} (${if (sIndex >= 0) sIndex + 1 else 1}/${allSentences.size}) • ${selectedSentence!!.category}",
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

            Spacer(modifier = Modifier.height(8.dp))

            // Prominent "CÂU TEST TIẾP THEO" Button (Sequential, non-repeating)
            Button(
                onClick = { viewModel.nextTestSentence() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(46.dp),
                colors = ButtonDefaults.buttonColors(containerColor = CyanAccent),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(
                    text = "⏭️ CÂU TIẾP THEO (KHÔNG TRÙNG)",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.Black
                )
            }

            Spacer(modifier = Modifier.height(10.dp))
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
                    "⏹ DỪNG THU ÂM (${String.format(Locale.ROOT, "%.1f", captureState.audioDurationSec)}s)"
                else
                    "🎙 BẮT ĐẦU ĐỌC",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === TRANSCRIPT DISPLAY ===
        val rawText = finalTranscript.ifEmpty { livePartial }
        val displayTranscript = if (!captureState.isRecording && normalizedResult != null && normalizedResult!!.normalizedSuggestion.isNotBlank()) {
            normalizedResult!!.normalizedSuggestion
        } else {
            rawText
        }

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .border(
                    1.dp,
                    if (captureState.isRecording) RedError.copy(alpha = 0.8f) else if (displayTranscript.isNotEmpty()) EmeraldGreen else BorderColor,
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
                            text = if (displayTranscript != rawText && displayTranscript.isNotBlank()) "KẾT QUẢ ĐÃ CHUẨN HÓA CĐHA" else "KẾT QUẢ PHIÊN ÂM",
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
                    text = displayTranscript.ifEmpty {
                        if (captureState.isRecording) "🎙️ Đang lắng nghe... Hãy đọc câu của bạn (nghỉ 1s máy tự nhận diện câu tiếp theo)"
                        else "Nhấn nút màu xanh bên trên để bắt đầu đọc..."
                    },
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.SansSerif,
                    color = if (displayTranscript.isNotEmpty()) TextPrimary else TextMuted,
                    lineHeight = 24.sp
                )

                // Normalized Suggestion Log
                if (normalizedResult != null && normalizedResult!!.suggestionsLog.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    HorizontalDivider(color = BorderColor)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "✨ HIỆU CHỈNH CHUẨN HÓA CĐHA / ĐO ĐẠC / GIẢI PHẪU:",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = OrangeWarning
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    for (log in normalizedResult!!.suggestionsLog) {
                        Text(text = "• $log", fontSize = 11.sp, color = TextSecondary)
                    }
                }
            }
        }

        // === SAFETY GATE DECISION BADGE ===
        if (safetyGateDecision != null) {
            Spacer(modifier = Modifier.height(12.dp))
            val decision = safetyGateDecision!!
            val cfg = when (decision.status) {
                SafetyGateStatus.SAFE_TO_AUTOFILL -> SafetyBadgeConfig(
                    bg = EmeraldGreen.copy(alpha = 0.15f),
                    border = EmeraldGreen,
                    title = "✓ AN TOÀN TỰ ĐỘNG ĐẨY VÀO PACS/RIS",
                    icon = Icons.Default.Check
                )
                SafetyGateStatus.REVIEW_REQUIRED -> SafetyBadgeConfig(
                    bg = OrangeWarning.copy(alpha = 0.15f),
                    border = OrangeWarning,
                    title = "⚠ YÊU CẦU BÁC SĨ RÀ SOÁT THỦ CÔNG",
                    icon = Icons.Default.Warning
                )
                SafetyGateStatus.REJECTED -> SafetyBadgeConfig(
                    bg = RedError.copy(alpha = 0.15f),
                    border = RedError,
                    title = "⛔ CẢNH BÁO NGUY HIỂM - TỪ CHỐI TỰ ĐỘNG",
                    icon = Icons.Default.Security
                )
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.5.dp, cfg.border, RoundedCornerShape(12.dp)),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(cfg.bg),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(cfg.icon, contentDescription = null, tint = cfg.border, modifier = Modifier.size(18.dp))
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = cfg.title,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = cfg.border
                        )
                    }

                    if (decision.reasons.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        for (reason in decision.reasons) {
                            Text(
                                text = "• $reason",
                                fontSize = 12.sp,
                                color = if (decision.status == SafetyGateStatus.REJECTED) RedError else TextSecondary,
                                lineHeight = 18.sp
                            )
                        }
                    }
                }
            }
        }

        // === CLINICAL WARNING BOX IF CONFLICT OR AMBIGUITY ===
        if (normalizedResult?.hasAmbiguityOrConflict == true) {
            Spacer(modifier = Modifier.height(10.dp))
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, RedError, RoundedCornerShape(10.dp)),
                colors = CardDefaults.cardColors(containerColor = RedError.copy(alpha = 0.1f)),
                shape = RoundedCornerShape(10.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "⚠ PHÁT HIỆN DẤU HIỆU LÂM SÀNG BẤT THƯỜNG / MÂU THUẪN:",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = RedError
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Có số đo thiếu đơn vị (mm/cm) hoặc mâu thuẫn vị trí trái/phải. Hãy kiểm tra lại kết quả trước khi ký duyệt.",
                        fontSize = 12.sp,
                        color = TextPrimary,
                        lineHeight = 18.sp
                    )
                }
            }
        }

        // === CLINICAL MODE: RIS/PACS EXPORT ACTION BUTTONS ===
        if (operatingMode == AppOperatingMode.CLINICAL_SAFE) {
            Spacer(modifier = Modifier.height(14.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { viewModel.resetTest() },
                    modifier = Modifier
                        .weight(0.35f)
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("XOÁ", fontSize = 12.sp)
                }

                Button(
                    onClick = { viewModel.exportToRis() },
                    modifier = Modifier
                        .weight(0.65f)
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (safetyGateDecision?.status == SafetyGateStatus.REJECTED) TextMuted else CyanAccent
                    ),
                    shape = RoundedCornerShape(10.dp),
                    enabled = displayTranscript.isNotEmpty()
                ) {
                    Icon(Icons.Default.Send, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "GỬI SANG RIS/PACS",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.Black
                    )
                }
            }
        }

        // === BENCHMARK MODE ONLY: ACCURACY METRICS & ACTION BUTTONS ===
        if (operatingMode == AppOperatingMode.BENCHMARK) {
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

            // Metrics Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MetricCardBg),
                shape = RoundedCornerShape(10.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "BENCHMARK METRICS",
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

            // Action Buttons
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
