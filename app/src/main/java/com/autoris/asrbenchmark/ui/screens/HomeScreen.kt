package com.autoris.asrbenchmark.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autoris.asrbenchmark.AppOperatingMode
import com.autoris.asrbenchmark.MainViewModel
import com.autoris.asrbenchmark.SyncState
import com.autoris.asrbenchmark.safety.SafetyGateStatus
import com.autoris.asrbenchmark.ui.theme.WarmAmberBg
import com.autoris.asrbenchmark.ui.theme.WarmAmberWarning
import com.autoris.asrbenchmark.ui.theme.WarmCardBorder
import com.autoris.asrbenchmark.ui.theme.WarmCrimson
import com.autoris.asrbenchmark.ui.theme.WarmEspresso
import com.autoris.asrbenchmark.ui.theme.WarmGreenAccent
import com.autoris.asrbenchmark.ui.theme.WarmGreenBg
import com.autoris.asrbenchmark.ui.theme.WarmGreenText
import com.autoris.asrbenchmark.ui.theme.WarmLinenBg
import com.autoris.asrbenchmark.ui.theme.WarmPaperWhite
import com.autoris.asrbenchmark.ui.theme.WarmPillBg
import com.autoris.asrbenchmark.ui.theme.WarmStoneMuted
import com.autoris.asrbenchmark.ui.theme.WarmStoneSecondary
import com.autoris.asrbenchmark.ui.theme.WarmStoneText
import com.autoris.asrbenchmark.ui.theme.WarmSubSurface
import java.util.Locale

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
    val operatingMode by viewModel.operatingMode.collectAsState()
    val safetyGateDecision by viewModel.safetyGateDecision.collectAsState()
    val syncState by viewModel.syncState.collectAsState()
    val isLiveAutoSendEnabled by viewModel.isLiveAutoSendEnabled.collectAsState()

    val scrollState = rememberScrollState()

    // Văn bản hiển thị và bộ soạn thảo
    val rawText = finalTranscript.ifEmpty { livePartial }
    val displayTranscript = if (!captureState.isRecording && normalizedResult != null && normalizedResult!!.normalizedSuggestion.isNotBlank()) {
        normalizedResult!!.normalizedSuggestion
    } else {
        rawText
    }

    var editedTranscript by rememberSaveable { mutableStateOf("") }
    var isEditingByUser by rememberSaveable { mutableStateOf(false) }
    var showNormalizationDetails by remember { mutableStateOf(false) }

    LaunchedEffect(displayTranscript, captureState.isRecording) {
        if (captureState.isRecording) {
            isEditingByUser = false
            editedTranscript = ""
        } else if (!isEditingByUser && displayTranscript.isNotBlank()) {
            editedTranscript = displayTranscript
        }
    }

    val currentTextToSend = if (isEditingByUser && editedTranscript.isNotBlank()) editedTranscript.trim()
                           else displayTranscript.trim()
    val hasEdited = isEditingByUser && editedTranscript.trim() != displayTranscript.trim() && editedTranscript.isNotBlank()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(WarmLinenBg)
            .padding(horizontal = 18.dp, vertical = 14.dp)
            .verticalScroll(scrollState)
    ) {
        // =========================================================================
        // 1. TOP HEADER (NORDIC LINEN: TỐI GIẢN • HIỆN ĐẠI • SANG TRỌNG)
        // =========================================================================
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "AutoRIS",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    color = WarmStoneText,
                    letterSpacing = (-0.5).sp
                )
                Spacer(modifier = Modifier.width(10.dp))
                // Chấm trạng thái kết nối server/model
                val isReady = modelStatus.isReady
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isReady) WarmGreenBg else WarmAmberBg)
                        .border(1.dp, if (isReady) WarmGreenAccent.copy(alpha = 0.4f) else WarmAmberWarning.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(if (isReady) WarmGreenAccent else WarmAmberWarning)
                        )
                        Spacer(modifier = Modifier.width(5.dp))
                        Text(
                            text = if (captureState.isRecording) "${captureState.currentDb.toInt()} dB"
                                   else if (isReady) "Sẵn sàng"
                                   else "Khởi tạo...",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isReady) WarmGreenText else WarmAmberWarning
                        )
                    }
                }
            }

            // Các nút phụ bên phải (Lịch sử & Cài đặt)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onNavigateToHistory) {
                    Icon(Icons.Default.History, contentDescription = "Lịch sử", tint = WarmStoneSecondary)
                }
                IconButton(onClick = onNavigateToSettings) {
                    Icon(Icons.Default.Settings, contentDescription = "Cài đặt", tint = WarmStoneSecondary)
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // =========================================================================
        // 2. CHỌN CHẾ ĐỘ & CHUYỂN TỰ ĐỘNG GỬI (MODE PILL & LIVE AUTO-SEND)
        // =========================================================================
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Mode Pill
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(WarmPillBg)
                    .padding(3.dp)
            ) {
                val isClinical = operatingMode == AppOperatingMode.CLINICAL_SAFE
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (isClinical) WarmPaperWhite else Color.Transparent)
                        .clickable { viewModel.setOperatingMode(AppOperatingMode.CLINICAL_SAFE) }
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "🏥 Đọc ca RIS",
                        fontSize = 12.sp,
                        fontWeight = if (isClinical) FontWeight.Bold else FontWeight.Medium,
                        color = if (isClinical) WarmStoneText else WarmStoneSecondary
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (!isClinical) WarmPaperWhite else Color.Transparent)
                        .clickable { viewModel.setOperatingMode(AppOperatingMode.BENCHMARK) }
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "🔬 Benchmark",
                        fontSize = 12.sp,
                        fontWeight = if (!isClinical) FontWeight.Bold else FontWeight.Medium,
                        color = if (!isClinical) WarmStoneText else WarmStoneSecondary
                    )
                }
            }

            // Nút Bật/Tắt tự động gửi theo thời gian thực (Live Auto-Send)
            if (operatingMode == AppOperatingMode.CLINICAL_SAFE) {
                Box(
                    modifier = Modifier
                        .width(108.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (isLiveAutoSendEnabled) WarmGreenBg else WarmSubSurface)
                        .border(
                            1.dp,
                            if (isLiveAutoSendEnabled) WarmGreenAccent.copy(alpha = 0.5f) else WarmCardBorder,
                            RoundedCornerShape(16.dp)
                        )
                        .clickable { viewModel.toggleLiveAutoSend() }
                        .padding(vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isLiveAutoSendEnabled) "⚡ Tự gửi: BẬT" else "⚪ Tự gửi: TẮT",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isLiveAutoSendEnabled) WarmGreenText else WarmStoneSecondary
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // =========================================================================
        // 3. BENCHMARK ONLY: CÂU MẪU ĐÁNH GIÁ (NẾU ĐANG Ở CHẾ ĐỘ BENCHMARK)
        // =========================================================================
        if (operatingMode == AppOperatingMode.BENCHMARK && selectedSentence != null) {
            val allSentences = com.autoris.asrbenchmark.benchmark.MedicalTestSet.SENTENCES
            val sIndex = allSentences.indexOfFirst { it.id == selectedSentence!!.id }
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = WarmPaperWhite),
                border = androidx.compose.foundation.BorderStroke(1.dp, WarmCardBorder),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${selectedSentence!!.id} (${if (sIndex >= 0) sIndex + 1 else 1}/${allSentences.size})",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = WarmGreenAccent
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(
                                onClick = { viewModel.previousTestSentence() },
                                modifier = Modifier.height(28.dp)
                            ) {
                                Text("⏮️ Trước", fontSize = 10.sp, color = WarmStoneText)
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                            OutlinedButton(
                                onClick = { viewModel.selectTestSentence(null) },
                                modifier = Modifier.height(28.dp)
                            ) {
                                Text("Đóng", fontSize = 10.sp, color = WarmStoneText)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = selectedSentence!!.referenceText,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = WarmStoneText,
                        lineHeight = 22.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = { viewModel.nextTestSentence() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp),
                colors = ButtonDefaults.buttonColors(containerColor = WarmEspresso),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = "⏭️ CÂU TIẾP THEO",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }

            Spacer(modifier = Modifier.height(10.dp))
        }

        // =========================================================================
        // 5. KHUNG LỜI ĐỌC LÂM SÀNG (WARM PAPER CANVAS & SOẠN THẢO)
        // =========================================================================
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .border(
                    1.dp,
                    if (captureState.isRecording) WarmCrimson.copy(alpha = 0.7f)
                    else if (displayTranscript.isNotBlank()) WarmGreenAccent.copy(alpha = 0.5f)
                    else WarmCardBorder,
                    RoundedCornerShape(22.dp)
                ),
            colors = CardDefaults.cardColors(containerColor = WarmPaperWhite),
            shape = RoundedCornerShape(22.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                // Tiêu đề khung & Trạng thái đồng bộ / dB
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (isEditingByUser && editedTranscript != displayTranscript) "📝 Đang sửa tay"
                               else if (captureState.isRecording) "🎙️ Đang nghe bác sĩ đọc..."
                               else if (displayTranscript.isNotBlank()) "✅ Kết quả nhận diện"
                               else "💬 Lời đọc lâm sàng",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isEditingByUser && editedTranscript != displayTranscript) WarmAmberWarning
                               else if (captureState.isRecording) WarmCrimson
                               else if (displayTranscript.isNotBlank()) WarmGreenAccent
                               else WarmStoneMuted
                    )

                    // Hiển thị trạng thái Sync hoặc dB + Mini Waveform
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (captureState.isRecording) {
                            Text(
                                text = "${captureState.currentDb.toInt()} dB",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = WarmCrimson
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            val infiniteTransition = rememberInfiniteTransition(label = "miniWave")
                            val anim1 by infiniteTransition.animateFloat(
                                initialValue = 4f, targetValue = 14f,
                                animationSpec = infiniteRepeatable(tween(350, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "w1"
                            )
                            val anim2 by infiniteTransition.animateFloat(
                                initialValue = 12f, targetValue = 4f,
                                animationSpec = infiniteRepeatable(tween(450, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "w2"
                            )
                            val anim3 by infiniteTransition.animateFloat(
                                initialValue = 6f, targetValue = 16f,
                                animationSpec = infiniteRepeatable(tween(300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "w3"
                            )
                            Box(modifier = Modifier.width(2.5.dp).height(anim1.dp).clip(RoundedCornerShape(1.dp)).background(WarmCrimson))
                            Spacer(modifier = Modifier.width(2.dp))
                            Box(modifier = Modifier.width(2.5.dp).height(anim2.dp).clip(RoundedCornerShape(1.dp)).background(WarmCrimson))
                            Spacer(modifier = Modifier.width(2.dp))
                            Box(modifier = Modifier.width(2.5.dp).height(anim3.dp).clip(RoundedCornerShape(1.dp)).background(WarmCrimson))
                        } else {
                            when (val state = syncState) {
                                is SyncState.Syncing -> {
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(WarmGreenBg)
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Default.Sync, contentDescription = null, tint = WarmGreenAccent, modifier = Modifier.size(12.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Đang gửi RIS...", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = WarmGreenText)
                                    }
                                }
                                is SyncState.Retrying -> {
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(WarmAmberBg)
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Default.Refresh, contentDescription = null, tint = WarmAmberWarning, modifier = Modifier.size(12.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Gửi lại (${state.attempt}/${state.max})...", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = WarmAmberWarning)
                                    }
                                }
                                is SyncState.Success -> {
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(WarmGreenBg)
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Default.Check, contentDescription = null, tint = WarmGreenText, modifier = Modifier.size(12.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Đã gửi RIS ✓", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = WarmGreenText)
                                    }
                                }
                                is SyncState.Error -> {
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(Color(0xFFFEE2E2))
                                            .clickable { if (currentTextToSend.isNotBlank()) viewModel.exportToRis(currentTextToSend) }
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Default.Warning, contentDescription = null, tint = WarmCrimson, modifier = Modifier.size(12.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Lỗi gửi (Thử lại)", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = WarmCrimson)
                                    }
                                }
                                else -> {
                                    if (displayTranscript.isNotBlank()) {
                                        Text(
                                            text = "Chạm để sửa",
                                            fontSize = 11.sp,
                                            color = WarmStoneMuted
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Vùng nhập & hiển thị nội dung thống nhất (Unified Editor, không bao giờ bị giật nhảy layout)
                val editorText = if (captureState.isRecording) displayTranscript
                                 else if (isEditingByUser) editedTranscript
                                 else displayTranscript

                OutlinedTextField(
                    value = editorText,
                    onValueChange = {
                        if (!captureState.isRecording) {
                            editedTranscript = it
                            isEditingByUser = true
                        }
                    },
                    readOnly = captureState.isRecording,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 140.dp),
                    textStyle = TextStyle(
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Normal,
                        fontFamily = FontFamily.SansSerif,
                        color = WarmStoneText,
                        lineHeight = 24.sp
                    ),
                    placeholder = {
                        Text(
                            text = if (captureState.isRecording) "Đang lắng nghe... Hãy đọc mô tả tổn thương (Ví dụ: Gan hạ phân thùy VII có nốt...)"
                                   else "Chạm nút 'BẮT ĐẦU ĐỌC' bên dưới hoặc chạm vào đây để gõ nội dung...",
                            color = WarmStoneMuted,
                            fontSize = 15.sp,
                            lineHeight = 22.sp
                        )
                    },
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = WarmGreenAccent,
                        unfocusedBorderColor = Color.Transparent,
                        focusedContainerColor = WarmSubSurface.copy(alpha = 0.5f),
                        unfocusedContainerColor = WarmSubSurface.copy(alpha = 0.25f)
                    )
                )

                // Chi tiết tự động phân bổ kết luận
                if (normalizedResult != null && normalizedResult!!.suggestionsLog.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(WarmSubSurface)
                            .clickable { showNormalizationDetails = !showNormalizationDetails }
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "✨ Đã chuẩn hóa ${normalizedResult!!.suggestionsLog.size} thực thể y khoa ${if (showNormalizationDetails) "▲" else "▼"}",
                            fontSize = 11.sp,
                            color = WarmGreenAccent,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    if (showNormalizationDetails) {
                        Spacer(modifier = Modifier.height(6.dp))
                        for (log in normalizedResult!!.suggestionsLog) {
                            Text(text = "• $log", fontSize = 11.sp, color = WarmStoneSecondary)
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // =========================================================================
        // 7. CỤM NÚT ĐIỀU KHIỂN CHÍNH (RECORD HERO & LUÔN CHO PHÉP GỬI RIS)
        // =========================================================================
        // Nút Ghi Âm Hero
        Button(
            onClick = { viewModel.toggleRecording() },
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (captureState.isRecording) WarmCrimson else WarmEspresso
            ),
            shape = RoundedCornerShape(20.dp),
            elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = if (captureState.isRecording) Icons.Default.Stop else Icons.Default.Mic,
                    contentDescription = null,
                    modifier = Modifier.size(26.dp),
                    tint = Color.White
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = if (captureState.isRecording)
                            "DỪNG THU (${String.format(Locale.ROOT, "%.1f", captureState.audioDurationSec)}s)"
                        else
                            "BẮT ĐẦU ĐỌC",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = if (captureState.isRecording)
                            if (isLiveAutoSendEnabled) "Đang tự động gửi sang RIS..." else "Nghỉ 1s máy tự chốt câu"
                        else
                            "Chạm để thu âm giọng nói",
                        fontSize = 11.sp,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // CỤM NÚT THAO TÁC: XOÁ & GỬI SANG RIS (LUÔN SẴN SÀNG, BẤM ĐƯỢC CẢ KHI ĐANG ĐỌC)
        if (operatingMode == AppOperatingMode.CLINICAL_SAFE) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Nút Xóa
                OutlinedButton(
                    onClick = {
                        isEditingByUser = false
                        editedTranscript = ""
                        viewModel.resetTest()
                    },
                    modifier = Modifier
                        .weight(0.3f)
                        .height(52.dp),
                    shape = RoundedCornerShape(16.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, WarmCardBorder),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = WarmPaperWhite,
                        contentColor = WarmStoneSecondary
                    )
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("XÓA", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                // Nút GỬI SANG RIS: Luôn bấm được ngay cả khi đang thu âm!
                val canSend = currentTextToSend.isNotBlank()
                Button(
                    onClick = {
                        if (canSend) {
                            viewModel.exportToRis(currentTextToSend)
                        }
                    },
                    enabled = canSend,
                    modifier = Modifier
                        .weight(0.7f)
                        .height(52.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (hasEdited) WarmAmberWarning else WarmGreenAccent,
                        disabledContainerColor = WarmSubSurface
                    ),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Icon(
                        imageVector = if (hasEdited) Icons.Default.Refresh else Icons.Default.Send,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (captureState.isRecording) "GỬI NGAY CÂU NÀY"
                               else if (hasEdited) "GỬI BẢN ĐÃ SỬA"
                               else "GỬI SANG RIS 🚀",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }

        // =========================================================================
        // 8. BENCHMARK MODE ONLY: METRICS & CÔNG CỤ ĐÁNH GIÁ
        // =========================================================================
        if (operatingMode == AppOperatingMode.BENCHMARK) {
            Spacer(modifier = Modifier.height(12.dp))
            if (evaluationReport != null) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = WarmPaperWhite),
                    border = androidx.compose.foundation.BorderStroke(1.dp, WarmCardBorder),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "ĐỘ CHÍNH XÁC (ACCURACY)",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = WarmGreenAccent
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
                Spacer(modifier = Modifier.height(10.dp))
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = WarmPaperWhite),
                border = androidx.compose.foundation.BorderStroke(1.dp, WarmCardBorder),
                shape = RoundedCornerShape(14.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "HIỆU NĂNG MÁY (DEVICE METRICS)",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = WarmStoneMuted
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        MetricItem("Audio", "${String.format(Locale.ROOT, "%.1f", metrics.audioDurationSec)} s")
                        MetricItem("First partial", "${metrics.firstPartialMs} ms")
                        MetricItem("Latency", "${metrics.finalLatencyMs} ms")
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        MetricItem("RTF", String.format(Locale.ROOT, "%.3f", metrics.rtf))
                        MetricItem("RAM Peak", "${metrics.ramPeakMb} MB")
                        MetricItem("Nhiệt độ", "${String.format(Locale.ROOT, "%.1f", systemStats.batteryTempCelsius)} °C")
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { viewModel.saveCurrentTestSession() },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = WarmEspresso),
                    shape = RoundedCornerShape(10.dp),
                    enabled = finalTranscript.isNotEmpty()
                ) {
                    Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("LƯU", fontSize = 12.sp)
                }

                Button(
                    onClick = { viewModel.resetTest() },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = WarmStoneSecondary),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("XÓA", fontSize = 12.sp)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = onNavigateToTestSet,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp),
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, WarmCardBorder),
                colors = ButtonDefaults.outlinedButtonColors(containerColor = WarmPaperWhite)
            ) {
                Icon(Icons.Default.FormatListBulleted, contentDescription = null, modifier = Modifier.size(18.dp), tint = WarmStoneText)
                Spacer(modifier = Modifier.width(8.dp))
                Text("📋 CHỌN BỘ CÂU TEST CĐHA (55 CÂU)", fontSize = 12.sp, color = WarmStoneText, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(28.dp))
    }
}

@Composable
fun MetricItem(label: String, value: String) {
    Column {
        Text(text = label, fontSize = 10.sp, color = WarmStoneMuted)
        Text(text = value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = WarmStoneText)
    }
}
