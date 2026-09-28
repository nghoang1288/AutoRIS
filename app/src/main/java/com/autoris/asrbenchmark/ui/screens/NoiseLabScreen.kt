package com.autoris.asrbenchmark.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.autoris.asrbenchmark.MainViewModel
import com.autoris.asrbenchmark.audio.PreprocessingProfile
import com.autoris.asrbenchmark.audio.VoiceLockState
import com.autoris.asrbenchmark.benchmark.BenchmarkTrack
import com.autoris.asrbenchmark.noise.NoiseScenario
import com.autoris.asrbenchmark.ui.theme.DarkBackground
import com.autoris.asrbenchmark.ui.theme.DarkSurface
import com.autoris.asrbenchmark.ui.theme.MedicalBlue
import com.autoris.asrbenchmark.ui.theme.MetricGreen
import com.autoris.asrbenchmark.ui.theme.TextPrimary
import com.autoris.asrbenchmark.ui.theme.TextSecondary
import com.autoris.asrbenchmark.ui.theme.WarningAmber

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoiseLabScreen(
    viewModel: MainViewModel,
    onNavigateBack: () -> Unit
) {
    val selectedScenario by viewModel.selectedScenario.collectAsState()
    val activeProfile by viewModel.preprocessingProfile.collectAsState()
    val benchmarkTrack by viewModel.benchmarkTrack.collectAsState()
    val noiseProfile by viewModel.noiseProfile.collectAsState()
    val speakerLockEnabled by viewModel.speakerLockEnabled.collectAsState()
    val speakerConfidence by viewModel.voiceLockConfidence.collectAsState()
    val voiceLockState by viewModel.voiceLockState.collectAsState()
    val speakerDistCm by viewModel.speakerDistanceCm.collectAsState()
    val statusMsg by viewModel.statusMessage.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Noise Lab & Acoustic Scenarios", color = TextPrimary, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại", tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DarkSurface)
            )
        },
        containerColor = DarkBackground
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Benchmark Track Selection
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Benchmark Track", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            BenchmarkTrack.entries.forEach { track ->
                                FilterChip(
                                    selected = benchmarkTrack == track,
                                    onClick = { viewModel.selectTrack(track) },
                                    label = { Text(track.displayName, fontSize = 13.sp) }
                                )
                            }
                        }
                    }
                }
            }

            // 2. Real-time Acoustic Telemetry & Rapid Calibration
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.GraphicEq, contentDescription = null, tint = MetricGreen)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Acoustic Telemetry & Calibration", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
                        }
                        Spacer(modifier = Modifier.height(12.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            TelemetryBox(title = "Noise Floor", value = "${noiseProfile.noiseFloorDb.toInt()} dB", color = TextPrimary)
                            TelemetryBox(title = "Speech Thresh", value = "${noiseProfile.speechThresholdDb.toInt()} dB", color = MetricGreen)
                            TelemetryBox(title = "Silence Thresh", value = "${noiseProfile.silenceThresholdDb.toInt()} dB", color = WarningAmber)
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = { viewModel.calibrateNoiseFloor() },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = MedicalBlue),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Tune, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Hiệu chuẩn nhanh 1s (Calibrate Ambient)")
                        }
                    }
                }
            }

            // 3. Clinical Acoustic Scenarios
            item {
                Text("Kịch bản Phòng đọc & Độ ồn CĐHA", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
            }

            items(NoiseScenario.entries) { scenario ->
                val isSelected = selectedScenario == scenario
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (isSelected) MedicalBlue.copy(alpha = 0.15f) else DarkSurface
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { viewModel.selectScenario(scenario) }
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(scenario.displayName, fontWeight = FontWeight.Bold, color = if (isSelected) MedicalBlue else TextPrimary, fontSize = 14.sp)
                            Text("${scenario.typicalFloorDb.toInt()} dB", color = WarningAmber, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(scenario.description, color = TextSecondary, fontSize = 12.sp)
                        Spacer(modifier = Modifier.height(6.dp))
                        Text("Recommended: ${scenario.recommendedProfile.displayName}", color = MetricGreen, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }

            // 4. Preprocessing Profiles
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Preprocessing Pipeline Profile", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
                        Spacer(modifier = Modifier.height(8.dp))
                        PreprocessingProfile.entries.forEach { profile ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { viewModel.setPreprocessingProfile(profile.id) }
                                    .padding(vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(profile.displayName, fontWeight = FontWeight.SemiBold, color = if (activeProfile == profile.id) MedicalBlue else TextPrimary, fontSize = 14.sp)
                                    Text(profile.description, color = TextSecondary, fontSize = 11.sp)
                                }
                                if (activeProfile == profile.id) {
                                    Text("✓ Active", color = MedicalBlue, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                            }
                            HorizontalDivider(color = DarkBackground, thickness = 1.dp)
                        }
                    }
                }
            }

            // 5. Voice Lock (Speaker Gate) Controls
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.RecordVoiceOver, contentDescription = null, tint = MedicalBlue)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Voice Lock (Speaker Gate)", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
                            }
                            Switch(
                                checked = speakerLockEnabled,
                                onCheckedChange = { viewModel.setSpeakerLockEnabled(it) }
                            )
                        }

                        if (speakerLockEnabled) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text("Độ tin cậy bác sĩ: ${(speakerConfidence * 100).toInt()}%", color = TextPrimary, fontSize = 13.sp)
                            Text("Trạng thái: $voiceLockState", color = if (voiceLockState == VoiceLockState.ACCEPT) MetricGreen else WarningAmber, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Khoảng cách micro: $speakerDistCm cm", color = TextSecondary, fontSize = 12.sp)
                            Slider(
                                value = speakerDistCm.toFloat(),
                                onValueChange = { viewModel.setSpeakerDistanceCm(it.toInt()) },
                                valueRange = 10f..100f
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TelemetryBox(title: String, value: String, color: Color) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(DarkBackground)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(title, color = TextSecondary, fontSize = 11.sp)
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}
