package com.autoris.asrbenchmark.asr

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

enum class ASRModelType(
    val id: String,
    val displayName: String,
    val description: String,
    val isStreaming: Boolean,
    val paramCount: String,
    val dirName: String,
    val repoId: String
) {
    ZIPFORMER_30M_STREAMING(
        id = "zipformer_30m",
        displayName = "Zipformer 30M RNN-T (Streaming)",
        description = "Nhận diện thời gian thực (trễ ~880ms, RTF ~0.044, RAM nhẹ)",
        isStreaming = true,
        paramCount = "~30 Triệu",
        dirName = "zipformer_30m_streaming",
        repoId = "hynt/Zipformer-30M-RNNT-Streaming-6000h"
    ),
    ZIPFORMER_150M_OFFLINE(
        id = "zipformer_150m",
        displayName = "ZipFormer 150M CR-CTC-RNNT (Offline)",
        description = "Độ chính xác cao nhất (VLSP SOTA, chuẩn thuật ngữ & số đo CĐHA)",
        isStreaming = false,
        paramCount = "~153 Triệu",
        dirName = "zipformer_150m_offline",
        repoId = "hynt/ZipFormer-150M-CR-CTC-RNNT-6000h"
    );

    companion object {
        fun fromId(id: String): ASRModelType {
            return entries.firstOrNull { it.id == id } ?: ZIPFORMER_150M_OFFLINE
        }
    }
}

data class ModelFileInfo(
    val fileName: String,
    val expectedSize: Long,
    val expectedSha256: String,
    val downloadUrl: String,
    val localServerRelativePath: String
)

data class ModelStatus(
    val modelType: ASRModelType,
    val isReady: Boolean,
    val source: String, // "assets" or "local_storage"
    val totalSizeMb: Float,
    val encoderPath: String,
    val decoderPath: String,
    val joinerPath: String,
    val tokensPath: String,
    val bpePath: String? = null,
    val details: List<FileStatusDetail>
)

data class FileStatusDetail(
    val fileName: String,
    val exists: Boolean,
    val sizeBytes: Long,
    val sha256: String,
    val isValid: Boolean
)

object ModelManager {

    val FILES_30M = listOf(
        ModelFileInfo(
            fileName = "tokens.txt",
            expectedSize = 23238L,
            expectedSha256 = "ca8171f8bbd516c050b627582f2125c8f5f1f6ed967ab41b0fa9aae2cf61b492",
            downloadUrl = "https://huggingface.co/hynt/Zipformer-30M-RNNT-Streaming-6000h/raw/main/config.json",
            localServerRelativePath = "models/zipformer-30m/tokens.txt"
        ),
        ModelFileInfo(
            fileName = "encoder.onnx",
            expectedSize = 46174648L,
            expectedSha256 = "c15ee636e2f89ce80d9ef94a2e21b32a7e8469dd5e3bcac950885b35530ce9d8",
            downloadUrl = "https://huggingface.co/hynt/Zipformer-30M-RNNT-Streaming-6000h/resolve/main/encoder-epoch-31-avg-11-chunk-16-left-128.fp16.onnx",
            localServerRelativePath = "models/zipformer-30m/encoder.onnx"
        ),
        ModelFileInfo(
            fileName = "decoder.onnx",
            expectedSize = 2584449L,
            expectedSha256 = "12274189a3ef638905e0d966a4f1ab090c96447f165190c4aa6b8053ac49b014",
            downloadUrl = "https://huggingface.co/hynt/Zipformer-30M-RNNT-Streaming-6000h/resolve/main/decoder-epoch-31-avg-11-chunk-16-left-128.fp16.onnx",
            localServerRelativePath = "models/zipformer-30m/decoder.onnx"
        ),
        ModelFileInfo(
            fileName = "joiner.onnx",
            expectedSize = 2052891L,
            expectedSha256 = "54f469ec6841deca336e33808514640be9bc1cb222dedfda312cdb2155ae37df",
            downloadUrl = "https://huggingface.co/hynt/Zipformer-30M-RNNT-Streaming-6000h/resolve/main/joiner-epoch-31-avg-11-chunk-16-left-128.fp16.onnx",
            localServerRelativePath = "models/zipformer-30m/joiner.onnx"
        )
    )

    val FILES_150M = listOf(
        ModelFileInfo(
            fileName = "tokens.txt",
            expectedSize = 23238L,
            expectedSha256 = "",
            downloadUrl = "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/raw/main/config.json",
            localServerRelativePath = "models/zipformer-150m/tokens.txt"
        ),
        ModelFileInfo(
            fileName = "bpe.model",
            expectedSize = 268106L,
            expectedSha256 = "",
            downloadUrl = "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/resolve/main/bpe.model",
            localServerRelativePath = "models/zipformer-150m/bpe.model"
        ),
        ModelFileInfo(
            fileName = "encoder.onnx",
            expectedSize = 154670000L,
            expectedSha256 = "",
            downloadUrl = "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/resolve/main/encoder-epoch-11-avg-2.int8.onnx",
            localServerRelativePath = "models/zipformer-150m/encoder.onnx"
        ),
        ModelFileInfo(
            fileName = "decoder.onnx",
            expectedSize = 1308700L,
            expectedSha256 = "",
            downloadUrl = "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/resolve/main/decoder-epoch-11-avg-2.int8.onnx",
            localServerRelativePath = "models/zipformer-150m/decoder.onnx"
        ),
        ModelFileInfo(
            fileName = "joiner.onnx",
            expectedSize = 1033400L,
            expectedSha256 = "",
            downloadUrl = "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/resolve/main/joiner-epoch-11-avg-2.int8.onnx",
            localServerRelativePath = "models/zipformer-150m/joiner.onnx"
        )
    )

    fun getModelFiles(type: ASRModelType): List<ModelFileInfo> {
        return when (type) {
            ASRModelType.ZIPFORMER_30M_STREAMING -> FILES_30M
            ASRModelType.ZIPFORMER_150M_OFFLINE -> FILES_150M
        }
    }

    fun getModelDir(context: Context, type: ASRModelType): File {
        val dir = File(context.filesDir, type.dirName)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    suspend fun ensureModelReady(
        context: Context,
        type: ASRModelType,
        onProgress: (step: String, currentBytes: Long, totalBytes: Long) -> Unit = { _, _, _ -> }
    ): Boolean = withContext(Dispatchers.IO) {
        val modelDir = getModelDir(context, type)
        val files = getModelFiles(type)

        // 1. Check if already extracted / downloaded
        var allPresent = true
        for (f in files) {
            val file = File(modelDir, f.fileName)
            if (!file.exists() || file.length() == 0L) {
                allPresent = false
                break
            }
        }
        if (allPresent) return@withContext true

        // 2. If 30M model, check assets/model
        if (type == ASRModelType.ZIPFORMER_30M_STREAMING) {
            var assetsAvailable = true
            try {
                val assetList = context.assets.list("model") ?: emptyArray()
                for (f in files) {
                    if (!assetList.contains(f.fileName)) {
                        assetsAvailable = false
                        break
                    }
                }
            } catch (e: Exception) {
                assetsAvailable = false
            }

            if (assetsAvailable) {
                onProgress("Trích xuất model 30M từ assets...", 0L, 100L)
                for (f in files) {
                    val outFile = File(modelDir, f.fileName)
                    context.assets.open("model/${f.fileName}").use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                }
                onProgress("Hoàn thành trích xuất model 30M", 100L, 100L)
                return@withContext true
            }
        }

        false
    }

    suspend fun downloadModel(
        context: Context,
        type: ASRModelType,
        serverBaseUrl: String? = null,
        onProgress: (fileName: String, bytesDownloaded: Long, totalBytes: Long, percent: Int) -> Unit
    ): Result<Unit> = withContext(Dispatchers.IO) {
        val modelDir = getModelDir(context, type)
        val files = getModelFiles(type)

        try {
            for (info in files) {
                val targetFile = File(modelDir, info.fileName)
                val tempFile = File(modelDir, "${info.fileName}.downloading")

                // Try local PC server first if available, then fallback to Hugging Face
                val urlsToTry = mutableListOf<String>()
                if (!serverBaseUrl.isNullOrBlank()) {
                    val normalizedBase = serverBaseUrl.trimEnd('/')
                    urlsToTry.add("$normalizedBase/${info.localServerRelativePath}")
                }
                urlsToTry.add(info.downloadUrl)

                var downloadSuccess = false
                var lastException: Exception? = null

                for (urlStr in urlsToTry) {
                    try {
                        val url = URL(urlStr)
                        val conn = (url.openConnection() as HttpURLConnection).apply {
                            connectTimeout = 15000
                            readTimeout = 60000
                            instanceFollowRedirects = true
                            setRequestProperty("User-Agent", "AutoRIS-Benchmark-Android")
                        }

                        if (conn.responseCode in 200..299) {
                            val totalSize = conn.contentLengthLong.takeIf { it > 0 } ?: info.expectedSize
                            var downloaded = 0L

                            conn.inputStream.use { input ->
                                FileOutputStream(tempFile).use { output ->
                                    val buffer = ByteArray(64 * 1024)
                                    var bytesRead: Int
                                    while (input.read(buffer).also { bytesRead = it } != -1) {
                                        output.write(buffer, 0, bytesRead)
                                        downloaded += bytesRead
                                        val pct = if (totalSize > 0) ((downloaded * 100) / totalSize).toInt() else 0
                                        onProgress(info.fileName, downloaded, totalSize, pct)
                                    }
                                }
                            }

                            if (tempFile.exists() && tempFile.length() > 0 && (totalSize <= 0 || tempFile.length() == totalSize)) {
                                if (targetFile.exists()) targetFile.delete()
                                tempFile.renameTo(targetFile)
                                downloadSuccess = true
                                break
                            }
                        } else {
                            conn.disconnect()
                        }
                    } catch (e: Exception) {
                        lastException = e
                    }
                }

                if (!downloadSuccess) {
                    return@withContext Result.failure(
                        lastException ?: Exception("Không thể tải file ${info.fileName}")
                    )
                }
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    val DPDFNET_FILE_INFO = ModelFileInfo(
        fileName = "dpdfnet.onnx",
        expectedSize = 14856000L,
        expectedSha256 = "",
        downloadUrl = "https://huggingface.co/csukuangfj/sherpa-onnx-dpdfnet/resolve/main/dpdfnet.onnx",
        localServerRelativePath = "models/dpdfnet.onnx"
    )

    fun isDpdfNetReady(context: Context): Boolean {
        val file = File(context.filesDir, "models/${DPDFNET_FILE_INFO.fileName}")
        return file.exists() && file.length() > 1000L
    }

    fun computeSha256(file: File): String {
        if (!file.exists() || file.length() == 0L) return ""
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(64 * 1024)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
            }
            digest.digest().joinToString("") { "%02x".format(it) }
        } catch (_: Exception) {
            ""
        }
    }

    fun getModelStatus(context: Context, type: ASRModelType, verifyHashes: Boolean = false): ModelStatus {
        val modelDir = getModelDir(context, type)
        val files = getModelFiles(type)
        val details = mutableListOf<FileStatusDetail>()
        var allValid = true
        var totalBytes = 0L

        for (info in files) {
            val file = File(modelDir, info.fileName)
            val exists = file.exists() && file.length() > 0
            val size = if (exists) file.length() else 0L
            totalBytes += size

            val hash = if (verifyHashes && exists) computeSha256(file) else ""
            val hashMatch = if (verifyHashes && info.expectedSha256.isNotBlank() && hash.isNotBlank()) {
                hash.equals(info.expectedSha256, ignoreCase = true)
            } else true

            val sizeMatch = if (info.expectedSize > 0L) {
                size >= info.expectedSize
            } else size > 1000L

            val isValid = exists && sizeMatch && hashMatch
            if (!isValid) allValid = false

            details.add(
                FileStatusDetail(
                    fileName = info.fileName,
                    exists = exists,
                    sizeBytes = size,
                    sha256 = hash,
                    isValid = isValid
                )
            )
        }

        val bpeFile = File(modelDir, "bpe.model")

        return ModelStatus(
            modelType = type,
            isReady = allValid,
            source = "local_storage",
            totalSizeMb = totalBytes / (1024f * 1024f),
            encoderPath = File(modelDir, "encoder.onnx").absolutePath,
            decoderPath = File(modelDir, "decoder.onnx").absolutePath,
            joinerPath = File(modelDir, "joiner.onnx").absolutePath,
            tokensPath = File(modelDir, "tokens.txt").absolutePath,
            bpePath = if (bpeFile.exists()) bpeFile.absolutePath else null,
            details = details
        )
    }
}
