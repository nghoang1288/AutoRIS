package com.autoris.asrbenchmark.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autoris.asrbenchmark.MainViewModel
import com.autoris.asrbenchmark.asr.ASRModelType
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
import java.util.Locale

@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val selectedModelType by viewModel.selectedModelType.collectAsState()
    val modelStatus by viewModel.modelStatus.collectAsState()
    val isModelInitializing by viewModel.isModelInitializing.collectAsState()
    val downloadProgress by viewModel.downloadProgress.collectAsState()
    val isSaveAudioEnabled by viewModel.isSaveAudioEnabled.collectAsState()

    val serverUrl by viewModel.serverUrl.collectAsState()
    val isAutoSyncEnabled by viewModel.isAutoSyncEnabled.collectAsState()
    val serverStatus by viewModel.serverStatus.collectAsState()

    var inputServerUrl by remember(serverUrl) { mutableStateOf(serverUrl) }
    var trailingSilence1 by remember { mutableFloatStateOf(viewModel.vadConfig.rule1MinTrailingSilence) }
    var trailingSilence2 by remember { mutableFloatStateOf(viewModel.vadConfig.rule2MinTrailingSilence) }

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
            Text(
                text = "CÀI ĐẶT & THÔNG SỐ",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === MODEL SELECTION SECTION ===
        Text(
            text = "LỰA CHỌN MODEL ASR",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = CyanAccent
        )
        Spacer(modifier = Modifier.height(8.dp))

        ASRModelType.entries.forEach { modelType ->
            val isSelected = (selectedModelType == modelType)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
                    .clickable { viewModel.selectModel(modelType) }
                    .then(
                        if (isSelected) Modifier.border(1.5.dp, CyanAccent, RoundedCornerShape(10.dp))
                        else Modifier
                    ),
                colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) DarkSurfaceVariant else DarkSurface
                ),
                shape = RoundedCornerShape(10.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = modelType.displayName,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) CyanAccent else TextPrimary
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "(${modelType.paramCount})",
                                fontSize = 11.sp,
                                color = EmeraldGreen,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            text = modelType.description,
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Repo: ${modelType.repoId}",
                            fontSize = 10.sp,
                            color = TextMuted,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    if (isSelected) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = "Selected",
                            tint = CyanAccent,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === MODEL STATUS SECTION ===
        Text(
            text = "TRẠNG THÁI MODEL ĐANG CHỌN",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = CyanAccent
        )
        Spacer(modifier = Modifier.height(8.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(10.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "Trạng thái sẵn sàng:", fontSize = 13.sp, color = TextSecondary)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = if (modelStatus.isReady) Icons.Default.CheckCircle else Icons.Default.Error,
                            contentDescription = null,
                            tint = if (modelStatus.isReady) EmeraldGreen else RedError,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (modelStatus.isReady) "SẴN SÀNG" else "CHƯA CÓ TRÊN MÁY",
                            fontWeight = FontWeight.Bold,
                            color = if (modelStatus.isReady) EmeraldGreen else RedError
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "Dung lượng model:", fontSize = 13.sp, color = TextSecondary)
                    Text(
                        text = "${String.format(Locale.ROOT, "%.2f", modelStatus.totalSizeMb)} MB",
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))
                Divider(color = BorderColor)
                Spacer(modifier = Modifier.height(10.dp))

                Text(text = "Chi tiết các file ONNX & Vocab:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = TextMuted)
                Spacer(modifier = Modifier.height(6.dp))

                for (f in modelStatus.details) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(text = f.fileName, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                        Text(
                            text = if (f.exists) "${String.format(Locale.ROOT, "%.2f", f.sizeBytes / (1024f * 1024f))} MB" else "Chưa tải",
                            fontSize = 11.sp,
                            color = if (f.isValid) EmeraldGreen else RedError
                        )
                    }
                }

                if (!modelStatus.isReady || downloadProgress != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    if (downloadProgress != null) {
                        Text(
                            text = downloadProgress ?: "",
                            fontSize = 12.sp,
                            color = CyanAccent,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            color = CyanAccent,
                            trackColor = DarkSurfaceVariant
                        )
                    } else {
                        Button(
                            onClick = { viewModel.downloadModel() },
                            enabled = !isModelInitializing,
                            colors = ButtonDefaults.buttonColors(containerColor = CyanAccent),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.CloudDownload, contentDescription = null, tint = Color.Black)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "TẢI MODEL ${selectedModelType.displayName.uppercase()}",
                                color = Color.Black,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === PC BENCHMARK SERVER SYNC SECTION ===
        Text(
            text = "MÁY CHỦ BENCHMARK (ĐỒNG BỘ VỀ PC)",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = CyanAccent
        )
        Spacer(modifier = Modifier.height(8.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(10.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    text = "Địa chỉ Server PC:",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))

                OutlinedTextField(
                    value = inputServerUrl,
                    onValueChange = {
                        inputServerUrl = it
                        viewModel.setServerUrl(it)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                        focusedBorderColor = CyanAccent,
                        unfocusedBorderColor = BorderColor
                    ),
                    singleLine = true,
                    placeholder = { Text("http://192.168.50.100:8080", color = TextMuted) }
                )

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = {
                            viewModel.testServerConnection { success, msg ->
                                Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                            }
                        },
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Kiểm tra kết nối", fontSize = 12.sp)
                    }

                    Text(
                        text = "Trạng thái: ${serverStatus ?: "Chưa rõ"}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (serverStatus?.contains("Online") == true) EmeraldGreen else RedError
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))
                Divider(color = BorderColor)
                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Tự động gửi kết quả về PC",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary
                        )
                        Text(
                            text = "Tự gửi JSON kết quả + audio sau mỗi lần đọc xong",
                            fontSize = 11.sp,
                            color = TextMuted
                        )
                    }
                    Switch(
                        checked = isAutoSyncEnabled,
                        onCheckedChange = { viewModel.setAutoSyncEnabled(it) },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = EmeraldGreen,
                            checkedTrackColor = EmeraldGreen.copy(alpha = 0.5f)
                        )
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === VAD PARAMETERS SECTION ===
        Text(
            text = "THÔNG SỐ VAD / ENDPOINTING (QUY TẮC NGẮT CÂU)",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = CyanAccent
        )
        Spacer(modifier = Modifier.height(8.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(10.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "Quy tắc 1: Khoảng lặng sau câu ngắn", fontSize = 13.sp, color = TextPrimary)
                    Text(
                        text = "${String.format(Locale.ROOT, "%.2f", trailingSilence1)} s",
                        fontWeight = FontWeight.Bold,
                        color = CyanAccent
                    )
                }
                Slider(
                    value = trailingSilence1,
                    onValueChange = {
                        trailingSilence1 = it
                        viewModel.updateVadConfig(trailing1 = it)
                    },
                    valueRange = 0.5f..5.0f,
                    steps = 17,
                    colors = SliderDefaults.colors(thumbColor = CyanAccent, activeTrackColor = CyanAccent)
                )

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(text = "Quy tắc 2: Khoảng lặng sau câu dài / dứt điểm", fontSize = 13.sp, color = TextPrimary)
                    Text(
                        text = "${String.format(Locale.ROOT, "%.2f", trailingSilence2)} s",
                        fontWeight = FontWeight.Bold,
                        color = CyanAccent
                    )
                }
                Slider(
                    value = trailingSilence2,
                    onValueChange = {
                        trailingSilence2 = it
                        viewModel.updateVadConfig(trailing2 = it)
                    },
                    valueRange = 0.3f..3.0f,
                    steps = 26,
                    colors = SliderDefaults.colors(thumbColor = CyanAccent, activeTrackColor = CyanAccent)
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // === AUDIO STORAGE SECTION ===
        Text(
            text = "LƯU TRỮ AUDIO LOCAL",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = CyanAccent
        )
        Spacer(modifier = Modifier.height(8.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = DarkSurface),
            shape = RoundedCornerShape(10.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Lưu file WAV PCM mono",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Text(
                        text = "Lưu audio vào máy để đánh giá lại và đồng bộ về PC (16kHz WAV)",
                        fontSize = 11.sp,
                        color = TextMuted
                    )
                }
                Switch(
                    checked = isSaveAudioEnabled,
                    onCheckedChange = { viewModel.setSaveAudioEnabled(it) },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = EmeraldGreen,
                        checkedTrackColor = EmeraldGreen.copy(alpha = 0.5f)
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
    }
}
