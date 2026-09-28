package com.autoris.asrbenchmark.ui.screens

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.autoris.asrbenchmark.MainViewModel
import com.autoris.asrbenchmark.benchmark.BenchmarkSession
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
fun HistoryScreen(
    viewModel: MainViewModel,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val sessions by viewModel.historySessions.collectAsState()
    val isSyncing by viewModel.isSyncing.collectAsState()
    var showDeleteDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                }
                Spacer(modifier = Modifier.width(6.dp))
                Column {
                    Text(
                        text = "LỊCH SỬ BENCHMARK",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Text(
                        text = "${sessions.size} lượt test đã lưu",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }
            }

            if (sessions.isNotEmpty()) {
                IconButton(onClick = { showDeleteDialog = true }) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete All", tint = RedError)
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Export & Sync Buttons
        if (sessions.isNotEmpty()) {
            Button(
                onClick = {
                    viewModel.syncAllHistoryToServer { success, msg ->
                        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                    }
                },
                enabled = !isSyncing,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = CyanAccent),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (isSyncing) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.Black, strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("ĐANG GỬI VỀ PC...", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                } else {
                    Icon(Icons.Default.CloudUpload, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("GỬI TOÀN BỘ KẾT QUẢ VỀ MÁY TÍNH (PC)", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        val file = viewModel.exportHistory(asJson = true)
                        if (file != null) {
                            Toast.makeText(context, "Đã xuất JSON: ${file.name}", Toast.LENGTH_LONG).show()
                            shareExportedFile(context, file, "application/json")
                        }
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.FileDownload, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("EXPORT JSON", fontSize = 11.sp)
                }

                Button(
                    onClick = {
                        val file = viewModel.exportHistory(asJson = false)
                        if (file != null) {
                            Toast.makeText(context, "Đã xuất CSV: ${file.name}", Toast.LENGTH_LONG).show()
                            shareExportedFile(context, file, "text/csv")
                        }
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceVariant),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.FileDownload, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("EXPORT CSV", fontSize = 11.sp)
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        if (sessions.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text("Chưa có lượt test nào được lưu", color = TextMuted, fontSize = 14.sp)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(sessions) { session ->
                    SessionCard(session)
                }
            }
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Xóa tất cả dữ liệu test?") },
            text = { Text("Toàn bộ lịch sử benchmark và kết quả đo sẽ bị xóa vĩnh viễn khỏi thiết bị.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteAllHistory()
                        showDeleteDialog = false
                    }
                ) {
                    Text("XÓA HẾT", color = RedError, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("HỦY", color = TextSecondary)
                }
            }
        )
    }
}

@Composable
fun SessionCard(session: BenchmarkSession) {
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
                Text(
                    text = session.testId ?: "TEST TỰ DO",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = CyanAccent
                )
                Text(
                    text = session.timestamp,
                    fontSize = 11.sp,
                    color = TextMuted
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            if (session.referenceText != null) {
                Text(text = "REF: ${session.referenceText}", fontSize = 12.sp, color = TextMuted)
                Spacer(modifier = Modifier.height(2.dp))
            }
            Text(
                text = "ASR: ${session.rawTranscript}",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = TextPrimary
            )

            Spacer(modifier = Modifier.height(8.dp))
            Divider(color = DarkSurfaceVariant)
            Spacer(modifier = Modifier.height(8.dp))

            // Metrics Grid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                MetricItem("Duration", "${String.format(Locale.ROOT, "%.1f", session.audioDurationSec)} s")
                MetricItem("RTF", String.format(Locale.ROOT, "%.3f", session.rtf))
                MetricItem("First Part", "${session.firstPartialMs} ms")
                MetricItem("Final Lat", "${session.finalLatencyMs} ms")
                MetricItem("RAM", "${session.ramPeakMb} MB")
            }

            if (session.wer != null) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    MetricItem("WER", String.format(Locale.ROOT, "%.1f%%", session.wer * 100))
                    MetricItem("CER", String.format(Locale.ROOT, "%.1f%%", session.cer!! * 100))
                    MetricItem("Term Acc", String.format(Locale.ROOT, "%.0f%%", (session.medicalTermAccuracy ?: 1.0f) * 100))
                    MetricItem("Num Acc", String.format(Locale.ROOT, "%.0f%%", (session.numericAccuracy ?: 1.0f) * 100))
                }
            }
        }
    }
}

private fun shareExportedFile(context: android.content.Context, file: java.io.File, mimeType: String) {
    try {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(shareIntent, "Chia sẻ kết quả benchmark"))
    } catch (e: Exception) {
        // Fallback
    }
}
