package com.autoris.asrbenchmark.storage

import android.util.Log
import com.autoris.asrbenchmark.benchmark.BenchmarkSession
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object BenchmarkSyncClient {
    private const val TAG = "BenchmarkSyncClient"
    private val gson: Gson = GsonBuilder().setPrettyPrinting().create()

    suspend fun checkServer(serverUrl: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val normalizedUrl = serverUrl.trimEnd('/') + "/api/health"
            val url = URL(normalizedUrl)
            val connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 3000
                readTimeout = 3000
                requestMethod = "GET"
            }

            val code = connection.responseCode
            if (code == 200) {
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                connection.disconnect()
                Result.success(response)
            } else {
                connection.disconnect()
                Result.failure(Exception("Server phản hồi mã lỗi HTTP $code"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "checkServer error", e)
            Result.failure(e)
        }
    }

    suspend fun uploadSessions(
        serverUrl: String, 
        sessions: List<BenchmarkSession>,
        maxRetries: Int = 3,
        onRetry: ((attempt: Int, max: Int, err: Throwable) -> Unit)? = null
    ): Result<Int> = withContext(Dispatchers.IO) {
        if (sessions.isEmpty()) return@withContext Result.success(0)

        var lastError: Exception? = null
        for (attempt in 1..maxRetries) {
            try {
                val normalizedUrl = serverUrl.trimEnd('/') + "/api/benchmark/upload"
                val url = URL(normalizedUrl)
                val jsonPayload = gson.toJson(sessions)

                val connection = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 4000
                    readTimeout = 8000
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }

                OutputStreamWriter(connection.outputStream, "UTF-8").use { writer ->
                    writer.write(jsonPayload)
                    writer.flush()
                }

                val code = connection.responseCode
                if (code in 200..299) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    connection.disconnect()
                    Log.i(TAG, "Uploaded ${sessions.size} sessions successfully (attempt $attempt): $response")
                    return@withContext Result.success(sessions.size)
                } else {
                    val err = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                    connection.disconnect()
                    lastError = Exception("Server phản hồi lỗi (HTTP $code): ${err.take(150)}")
                }
            } catch (e: Exception) {
                Log.w(TAG, "uploadSessions attempt $attempt/$maxRetries failed: ${e.message}")
                lastError = e
            }

            if (attempt < maxRetries) {
                onRetry?.invoke(attempt, maxRetries, lastError ?: Exception("Unknown error"))
                kotlinx.coroutines.delay(attempt * 700L)
            }
        }
        Result.failure(lastError ?: Exception("Upload thất bại sau $maxRetries lần thử"))
    }

    suspend fun uploadAudio(serverUrl: String, sessionId: Long, audioFile: File): Result<Boolean> = withContext(Dispatchers.IO) {
        if (!audioFile.exists() || audioFile.length() == 0L) {
            return@withContext Result.failure(Exception("File audio không tồn tại hoặc rỗng"))
        }

        try {
            val encodedName = java.net.URLEncoder.encode(audioFile.name, "UTF-8")
            val normalizedUrl = serverUrl.trimEnd('/') + "/api/benchmark/upload_audio?id=$sessionId&filename=$encodedName"
            val url = URL(normalizedUrl)

            val connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 5000
                readTimeout = 15000
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "audio/wav")
                setFixedLengthStreamingMode(audioFile.length())
            }

            connection.outputStream.use { out ->
                FileInputStream(audioFile).use { input ->
                    input.copyTo(out)
                }
                out.flush()
            }

            val code = connection.responseCode
            if (code in 200..299) {
                connection.disconnect()
                Result.success(true)
            } else {
                connection.disconnect()
                Result.failure(Exception("Upload audio thất bại (HTTP $code)"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "uploadAudio error", e)
            Result.failure(e)
        }
    }
}
