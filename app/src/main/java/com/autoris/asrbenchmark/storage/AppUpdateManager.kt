package com.autoris.asrbenchmark.storage

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

data class AppUpdateInfo(
    val hasUpdate: Boolean = false,
    val versionName: String = "",
    val versionCode: Int = 0,
    val currentVersionName: String = "",
    val currentVersionCode: Int = 0,
    val apkUrl: String = "",
    val releaseNotes: String = "",
    val isDownloading: Boolean = false,
    val downloadProgress: Float = 0f,
    val downloadError: String? = null
)

object AppUpdateManager {
    private const val TAG = "AppUpdateManager"
    private val gson = Gson()

    suspend fun checkUpdate(context: Context, serverUrl: String): Result<AppUpdateInfo> = withContext(Dispatchers.IO) {
        try {
            val normalizedUrl = serverUrl.trimEnd('/') + "/api/app/version?t=" + System.currentTimeMillis()
            val url = URL(normalizedUrl)
            val connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 4000
                readTimeout = 4000
                requestMethod = "GET"
            }

            val code = connection.responseCode
            if (code == 200) {
                val json = connection.inputStream.bufferedReader().use { it.readText() }
                connection.disconnect()

                val root = gson.fromJson(json, Map::class.java) as Map<*, *>
                val remoteVersionName = (root["version_name"] as? String) ?: ""
                val remoteVersionCode = (root["version_code"] as? Number)?.toInt() ?: 0
                val apkPath = (root["apk_url"] as? String) ?: "/autoris.apk"
                val notes = (root["release_notes"] as? String) ?: ""

                val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
                } else {
                    @Suppress("DEPRECATION")
                    context.packageManager.getPackageInfo(context.packageName, 0)
                }

                val currentVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    (packageInfo.longVersionCode and 0xFFFFFFFFL).toInt()
                } else {
                    @Suppress("DEPRECATION")
                    packageInfo.versionCode
                }
                val currentVersionName = packageInfo.versionName ?: "1.0.0"

                val hasUpdate = remoteVersionCode > currentVersionCode

                val fullApkUrl = if (apkPath.startsWith("http")) apkPath else serverUrl.trimEnd('/') + apkPath

                val info = AppUpdateInfo(
                    hasUpdate = hasUpdate,
                    versionName = remoteVersionName,
                    versionCode = remoteVersionCode,
                    currentVersionName = currentVersionName,
                    currentVersionCode = currentVersionCode,
                    apkUrl = fullApkUrl,
                    releaseNotes = notes
                )
                Result.success(info)
            } else {
                connection.disconnect()
                Result.failure(Exception("HTTP $code khi kiểm tra phiên bản"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Lỗi kiểm tra cập nhật", e)
            Result.failure(e)
        }
    }

    suspend fun downloadAndInstall(
        context: Context,
        apkDownloadUrl: String,
        onProgress: (Float) -> Unit
    ): Result<File> = withContext(Dispatchers.IO) {
        try {
            val url = URL(apkDownloadUrl)
            val connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 60000
                requestMethod = "GET"
            }

            val responseCode = connection.responseCode
            if (responseCode !in 200..299) {
                connection.disconnect()
                return@withContext Result.failure(Exception("Tải APK thất bại, mã HTTP $responseCode"))
            }

            val totalBytes = connection.contentLength.toLong()
            val downloadDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.cacheDir
            val destFile = File(downloadDir, "AutoRIS_update.apk")
            if (destFile.exists()) {
                destFile.delete()
            }

            connection.inputStream.use { input ->
                FileOutputStream(destFile).use { output ->
                    val buffer = ByteArray(16 * 1024)
                    var bytesRead: Int
                    var totalRead = 0L

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalRead += bytesRead
                        if (totalBytes > 0) {
                            val progress = (totalRead.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f)
                            onProgress(progress)
                        }
                    }
                    output.flush()
                }
            }
            connection.disconnect()
            onProgress(1f)

            // Kích hoạt trình cài đặt hệ thống Android
            withContext(Dispatchers.Main) {
                launchInstaller(context, destFile)
            }

            Result.success(destFile)
        } catch (e: Exception) {
            Log.e(TAG, "Lỗi tải và cài đặt APK", e)
            Result.failure(e)
        }
    }

    fun launchInstaller(context: Context, apkFile: File) {
        try {
            val contentUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Không thể mở file APK để cài đặt", e)
        }
    }
}
