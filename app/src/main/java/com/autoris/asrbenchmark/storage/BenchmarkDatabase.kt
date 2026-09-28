package com.autoris.asrbenchmark.storage

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.autoris.asrbenchmark.benchmark.BenchmarkSession
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import java.io.File
import java.io.FileWriter

class BenchmarkDatabase(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "asr_benchmark.db"
        private const val DATABASE_VERSION = 1
        private const val TABLE_SESSIONS = "benchmark_sessions"

        private const val COL_ID = "id"
        private const val COL_TIMESTAMP = "timestamp"
        private const val COL_DEVICE = "device"
        private const val COL_MODEL = "model"
        private const val COL_TEST_ID = "test_id"
        private const val COL_CATEGORY = "category"
        private const val COL_AUDIO_DURATION = "audio_duration"
        private const val COL_FIRST_PARTIAL_MS = "first_partial_ms"
        private const val COL_FINAL_LATENCY_MS = "final_latency_ms"
        private const val COL_PROCESSING_MS = "processing_ms"
        private const val COL_RTF = "rtf"
        private const val COL_RAM_PEAK_MB = "ram_peak_mb"
        private const val COL_RAM_AVG_MB = "ram_avg_mb"
        private const val COL_BATTERY_PERCENT = "battery_percent"
        private const val COL_BATTERY_TEMP = "battery_temp"
        private const val COL_RAW_TRANSCRIPT = "raw_transcript"
        private const val COL_NORMALIZED_TRANSCRIPT = "normalized_transcript"
        private const val COL_REFERENCE_TEXT = "reference_text"
        private const val COL_CER = "cer"
        private const val COL_WER = "wer"
        private const val COL_MED_TERM_ACC = "med_term_acc"
        private const val COL_NUMERIC_ACC = "numeric_acc"
        private const val COL_ANATOMY_ACC = "anatomy_acc"
        private const val COL_NEGATION_ACC = "negation_acc"
        private const val COL_AUDIO_PATH = "audio_path"
    }

    override fun onCreate(db: SQLiteDatabase) {
        val createQuery = """
            CREATE TABLE $TABLE_SESSIONS (
                $COL_ID INTEGER PRIMARY KEY,
                $COL_TIMESTAMP TEXT,
                $COL_DEVICE TEXT,
                $COL_MODEL TEXT,
                $COL_TEST_ID TEXT,
                $COL_CATEGORY TEXT,
                $COL_AUDIO_DURATION REAL,
                $COL_FIRST_PARTIAL_MS INTEGER,
                $COL_FINAL_LATENCY_MS INTEGER,
                $COL_PROCESSING_MS INTEGER,
                $COL_RTF REAL,
                $COL_RAM_PEAK_MB INTEGER,
                $COL_RAM_AVG_MB INTEGER,
                $COL_BATTERY_PERCENT INTEGER,
                $COL_BATTERY_TEMP REAL,
                $COL_RAW_TRANSCRIPT TEXT,
                $COL_NORMALIZED_TRANSCRIPT TEXT,
                $COL_REFERENCE_TEXT TEXT,
                $COL_CER REAL,
                $COL_WER REAL,
                $COL_MED_TERM_ACC REAL,
                $COL_NUMERIC_ACC REAL,
                $COL_ANATOMY_ACC REAL,
                $COL_NEGATION_ACC REAL,
                $COL_AUDIO_PATH TEXT
            )
        """.trimIndent()
        db.execSQL(createQuery)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SESSIONS")
        onCreate(db)
    }

    fun insert(session: BenchmarkSession): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COL_ID, session.id)
            put(COL_TIMESTAMP, session.timestamp)
            put(COL_DEVICE, session.device)
            put(COL_MODEL, session.model)
            put(COL_TEST_ID, session.testId)
            put(COL_CATEGORY, session.category)
            put(COL_AUDIO_DURATION, session.audioDurationSec)
            put(COL_FIRST_PARTIAL_MS, session.firstPartialMs)
            put(COL_FINAL_LATENCY_MS, session.finalLatencyMs)
            put(COL_PROCESSING_MS, session.processingMs)
            put(COL_RTF, session.rtf)
            put(COL_RAM_PEAK_MB, session.ramPeakMb)
            put(COL_RAM_AVG_MB, session.ramAvgMb)
            put(COL_BATTERY_PERCENT, session.batteryPercent)
            put(COL_BATTERY_TEMP, session.batteryTemp)
            put(COL_RAW_TRANSCRIPT, session.rawTranscript)
            put(COL_NORMALIZED_TRANSCRIPT, session.normalizedTranscript)
            put(COL_REFERENCE_TEXT, session.referenceText)
            put(COL_CER, session.cer)
            put(COL_WER, session.wer)
            put(COL_MED_TERM_ACC, session.medicalTermAccuracy)
            put(COL_NUMERIC_ACC, session.numericAccuracy)
            put(COL_ANATOMY_ACC, session.anatomyAccuracy)
            put(COL_NEGATION_ACC, session.negationAccuracy)
            put(COL_AUDIO_PATH, session.audioPath)
        }
        return db.insert(TABLE_SESSIONS, null, values)
    }

    fun getAll(): List<BenchmarkSession> {
        val list = mutableListOf<BenchmarkSession>()
        val db = readableDatabase
        val cursor = db.query(TABLE_SESSIONS, null, null, null, null, null, "$COL_ID DESC")

        cursor.use { c ->
            while (c.moveToNext()) {
                val session = BenchmarkSession(
                    id = c.getLong(c.getColumnIndexOrThrow(COL_ID)),
                    timestamp = c.getString(c.getColumnIndexOrThrow(COL_TIMESTAMP)),
                    device = c.getString(c.getColumnIndexOrThrow(COL_DEVICE)),
                    model = c.getString(c.getColumnIndexOrThrow(COL_MODEL)),
                    testId = c.getString(c.getColumnIndexOrThrow(COL_TEST_ID)),
                    category = c.getString(c.getColumnIndexOrThrow(COL_CATEGORY)),
                    audioDurationSec = c.getFloat(c.getColumnIndexOrThrow(COL_AUDIO_DURATION)),
                    firstPartialMs = c.getLong(c.getColumnIndexOrThrow(COL_FIRST_PARTIAL_MS)),
                    finalLatencyMs = c.getLong(c.getColumnIndexOrThrow(COL_FINAL_LATENCY_MS)),
                    processingMs = c.getLong(c.getColumnIndexOrThrow(COL_PROCESSING_MS)),
                    rtf = c.getFloat(c.getColumnIndexOrThrow(COL_RTF)),
                    ramPeakMb = c.getInt(c.getColumnIndexOrThrow(COL_RAM_PEAK_MB)),
                    ramAvgMb = c.getInt(c.getColumnIndexOrThrow(COL_RAM_AVG_MB)),
                    batteryPercent = c.getInt(c.getColumnIndexOrThrow(COL_BATTERY_PERCENT)),
                    batteryTemp = c.getFloat(c.getColumnIndexOrThrow(COL_BATTERY_TEMP)),
                    rawTranscript = c.getString(c.getColumnIndexOrThrow(COL_RAW_TRANSCRIPT)),
                    normalizedTranscript = c.getString(c.getColumnIndexOrThrow(COL_NORMALIZED_TRANSCRIPT)),
                    referenceText = c.getString(c.getColumnIndexOrThrow(COL_REFERENCE_TEXT)),
                    cer = if (c.isNull(c.getColumnIndexOrThrow(COL_CER))) null else c.getFloat(c.getColumnIndexOrThrow(COL_CER)),
                    wer = if (c.isNull(c.getColumnIndexOrThrow(COL_WER))) null else c.getFloat(c.getColumnIndexOrThrow(COL_WER)),
                    medicalTermAccuracy = if (c.isNull(c.getColumnIndexOrThrow(COL_MED_TERM_ACC))) null else c.getFloat(c.getColumnIndexOrThrow(COL_MED_TERM_ACC)),
                    numericAccuracy = if (c.isNull(c.getColumnIndexOrThrow(COL_NUMERIC_ACC))) null else c.getFloat(c.getColumnIndexOrThrow(COL_NUMERIC_ACC)),
                    anatomyAccuracy = if (c.isNull(c.getColumnIndexOrThrow(COL_ANATOMY_ACC))) null else c.getFloat(c.getColumnIndexOrThrow(COL_ANATOMY_ACC)),
                    negationAccuracy = if (c.isNull(c.getColumnIndexOrThrow(COL_NEGATION_ACC))) null else c.getFloat(c.getColumnIndexOrThrow(COL_NEGATION_ACC)),
                    audioPath = c.getString(c.getColumnIndexOrThrow(COL_AUDIO_PATH))
                )
                list.add(session)
            }
        }
        return list
    }

    fun deleteAll() {
        val db = writableDatabase
        db.delete(TABLE_SESSIONS, null, null)
    }

    fun deleteById(id: Long) {
        val db = writableDatabase
        db.delete(TABLE_SESSIONS, "$COL_ID = ?", arrayOf(id.toString()))
    }
}

object BenchmarkExporter {

    private val gson: Gson = GsonBuilder().setPrettyPrinting().create()

    fun exportToJson(sessions: List<BenchmarkSession>, file: File) {
        FileWriter(file).use { writer ->
            gson.toJson(sessions, writer)
        }
    }

    fun exportToCsv(sessions: List<BenchmarkSession>, file: File) {
        FileWriter(file).use { writer ->
            // CSV Header
            writer.write(
                "ID,Timestamp,Device,Model,TestID,Category,AudioDurationSec,FirstPartialMs,FinalLatencyMs,ProcessingMs,RTF,RamPeakMb,BatteryPct,BatteryTemp,CER,WER,MedTermAcc,NumericAcc,RawTranscript,NormalizedTranscript,ReferenceText\n"
            )

            for (s in sessions) {
                val line = listOf(
                    s.id.toString(),
                    escapeCsv(s.timestamp),
                    escapeCsv(s.device),
                    escapeCsv(s.model),
                    escapeCsv(s.testId ?: ""),
                    escapeCsv(s.category ?: ""),
                    s.audioDurationSec.toString(),
                    s.firstPartialMs.toString(),
                    s.finalLatencyMs.toString(),
                    s.processingMs.toString(),
                    s.rtf.toString(),
                    s.ramPeakMb.toString(),
                    s.batteryPercent.toString(),
                    s.batteryTemp.toString(),
                    s.cer?.toString() ?: "",
                    s.wer?.toString() ?: "",
                    s.medicalTermAccuracy?.toString() ?: "",
                    s.numericAccuracy?.toString() ?: "",
                    escapeCsv(s.rawTranscript),
                    escapeCsv(s.normalizedTranscript),
                    escapeCsv(s.referenceText ?: "")
                ).joinToString(",")

                writer.write(line)
                writer.write("\n")
            }
        }
    }

    private fun escapeCsv(str: String): String {
        return "\"" + str.replace("\"", "\"\"") + "\""
    }
}
