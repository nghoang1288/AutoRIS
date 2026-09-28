package com.autoris.asrbenchmark.storage

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.autoris.asrbenchmark.benchmark.BenchmarkSession
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import java.io.File
import java.io.FileWriter

class BenchmarkDatabase(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "asr_benchmark.db"
        private const val DATABASE_VERSION = 2
        private const val TABLE_SESSIONS = "benchmark_sessions"

        // Column constants
        private const val COL_ID = "id"
        private const val COL_SESSION_ID = "session_id"
        private const val COL_TIMESTAMP = "timestamp"
        private const val COL_DEVICE = "device"
        private const val COL_DEVICE_MODEL = "device_model"
        private const val COL_ANDROID_VERSION = "android_version"
        private const val COL_CPU_INFO = "cpu_info"
        private const val COL_MODEL = "model"
        private const val COL_MODEL_NAME = "model_name"
        private const val COL_MODEL_VERSION = "model_version"
        private const val COL_NUM_THREADS = "num_threads"
        private const val COL_TEST_ID = "test_id"
        private const val COL_CATEGORY = "category"
        private const val COL_ROOM_ID = "room_id"
        private const val COL_ROOM_TYPE = "room_type"
        private const val COL_NOISE_TYPE = "noise_type"
        private const val COL_NOISE_LEVEL = "noise_level"
        private const val COL_SPEAKER_DISTANCE_CM = "speaker_distance_cm"
        private const val COL_MIC_ORIENTATION_DEG = "mic_orientation_deg"
        private const val COL_PREPROCESSING_PROFILE = "preprocessing_profile"
        private const val COL_AUDIO_DURATION = "audio_duration"
        private const val COL_AUDIO_DURATION_MS = "audio_duration_ms"
        private const val COL_SAMPLE_RATE = "sample_rate"
        private const val COL_CHANNELS = "channels"
        private const val COL_VAD_SEGMENT_COUNT = "vad_segment_count"
        private const val COL_VAD_TOTAL_SPEECH_MS = "vad_total_speech_ms"
        private const val COL_SPEAKER_LOCK_ENABLED = "speaker_lock_enabled"
        private const val COL_SPEAKER_CONFIDENCE = "speaker_confidence"
        private const val COL_SPEAKER_REJECTION = "speaker_rejection"
        private const val COL_RAW_TRANSCRIPT = "raw_transcript"
        private const val COL_NORMALIZED_TRANSCRIPT = "normalized_transcript"
        private const val COL_REFERENCE_TEXT = "reference_text"
        private const val COL_WER_RAW = "wer_raw"
        private const val COL_CER_RAW = "cer_raw"
        private const val COL_WER_NORMALIZED = "wer_normalized"
        private const val COL_CER_NORMALIZED = "cer_normalized"
        private const val COL_CER = "cer"
        private const val COL_WER = "wer"
        private const val COL_MED_TERM_ACC = "med_term_acc"
        private const val COL_NUMERIC_ACC = "numeric_acc"
        private const val COL_MEASUREMENT_ACC = "measurement_acc"
        private const val COL_ANATOMY_ACC = "anatomy_acc"
        private const val COL_LATERALITY_ACC = "laterality_acc"
        private const val COL_NEGATION_ACC = "negation_acc"
        private const val COL_SPINE_LEVEL_ACC = "spine_level_acc"
        private const val COL_CRIT_NUMERIC_ERR = "crit_numeric_err"
        private const val COL_CRIT_MEASUREMENT_ERR = "crit_measurement_err"
        private const val COL_CRIT_NEGATION_ERR = "crit_negation_err"
        private const val COL_CRIT_LATERALITY_ERR = "crit_laterality_err"
        private const val COL_CRIT_SPINE_ERR = "crit_spine_err"
        private const val COL_FIRST_SEGMENT_LATENCY_MS = "first_segment_latency_ms"
        private const val COL_TRUE_PARTIAL_LATENCY_MS = "true_partial_latency_ms"
        private const val COL_FIRST_PARTIAL_MS = "first_partial_ms"
        private const val COL_FINAL_LATENCY_MS = "final_latency_ms"
        private const val COL_PROCESSING_MS = "processing_ms"
        private const val COL_RTF = "rtf"
        private const val COL_RAM_PEAK_MB = "ram_peak_mb"
        private const val COL_RAM_AVG_MB = "ram_avg_mb"
        private const val COL_BATTERY_PERCENT = "battery_percent"
        private const val COL_BATTERY_TEMP = "battery_temp"
        private const val COL_AUDIO_PATH = "audio_path"
        private const val COL_ERRORS = "errors"

        private val gson = Gson()
    }

    override fun onCreate(db: SQLiteDatabase) {
        val createQuery = """
            CREATE TABLE $TABLE_SESSIONS (
                $COL_ID INTEGER PRIMARY KEY,
                $COL_SESSION_ID TEXT,
                $COL_TIMESTAMP TEXT,
                $COL_DEVICE TEXT,
                $COL_DEVICE_MODEL TEXT,
                $COL_ANDROID_VERSION TEXT,
                $COL_CPU_INFO TEXT,
                $COL_MODEL TEXT,
                $COL_MODEL_NAME TEXT,
                $COL_MODEL_VERSION TEXT,
                $COL_NUM_THREADS INTEGER,
                $COL_TEST_ID TEXT,
                $COL_CATEGORY TEXT,
                $COL_ROOM_ID TEXT,
                $COL_ROOM_TYPE TEXT,
                $COL_NOISE_TYPE TEXT,
                $COL_NOISE_LEVEL TEXT,
                $COL_SPEAKER_DISTANCE_CM INTEGER,
                $COL_MIC_ORIENTATION_DEG INTEGER,
                $COL_PREPROCESSING_PROFILE TEXT,
                $COL_AUDIO_DURATION REAL,
                $COL_AUDIO_DURATION_MS INTEGER,
                $COL_SAMPLE_RATE INTEGER,
                $COL_CHANNELS INTEGER,
                $COL_VAD_SEGMENT_COUNT INTEGER,
                $COL_VAD_TOTAL_SPEECH_MS INTEGER,
                $COL_SPEAKER_LOCK_ENABLED INTEGER,
                $COL_SPEAKER_CONFIDENCE REAL,
                $COL_SPEAKER_REJECTION INTEGER,
                $COL_RAW_TRANSCRIPT TEXT,
                $COL_NORMALIZED_TRANSCRIPT TEXT,
                $COL_REFERENCE_TEXT TEXT,
                $COL_WER_RAW REAL,
                $COL_CER_RAW REAL,
                $COL_WER_NORMALIZED REAL,
                $COL_CER_NORMALIZED REAL,
                $COL_CER REAL,
                $COL_WER REAL,
                $COL_MED_TERM_ACC REAL,
                $COL_NUMERIC_ACC REAL,
                $COL_MEASUREMENT_ACC REAL,
                $COL_ANATOMY_ACC REAL,
                $COL_LATERALITY_ACC REAL,
                $COL_NEGATION_ACC REAL,
                $COL_SPINE_LEVEL_ACC REAL,
                $COL_CRIT_NUMERIC_ERR INTEGER,
                $COL_CRIT_MEASUREMENT_ERR INTEGER,
                $COL_CRIT_NEGATION_ERR INTEGER,
                $COL_CRIT_LATERALITY_ERR INTEGER,
                $COL_CRIT_SPINE_ERR INTEGER,
                $COL_FIRST_SEGMENT_LATENCY_MS INTEGER,
                $COL_TRUE_PARTIAL_LATENCY_MS INTEGER,
                $COL_FIRST_PARTIAL_MS INTEGER,
                $COL_FINAL_LATENCY_MS INTEGER,
                $COL_PROCESSING_MS INTEGER,
                $COL_RTF REAL,
                $COL_RAM_PEAK_MB INTEGER,
                $COL_RAM_AVG_MB INTEGER,
                $COL_BATTERY_PERCENT INTEGER,
                $COL_BATTERY_TEMP REAL,
                $COL_AUDIO_PATH TEXT,
                $COL_ERRORS TEXT
            )
        """.trimIndent()
        db.execSQL(createQuery)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            val alterStatements = listOf(
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_SESSION_ID TEXT",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_DEVICE_MODEL TEXT",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_ANDROID_VERSION TEXT",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CPU_INFO TEXT",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_MODEL_NAME TEXT",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_MODEL_VERSION TEXT",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_NUM_THREADS INTEGER DEFAULT 4",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_ROOM_ID TEXT DEFAULT 'ROOM_01'",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_ROOM_TYPE TEXT DEFAULT 'reading_room'",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_NOISE_TYPE TEXT DEFAULT 'clean'",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_NOISE_LEVEL TEXT DEFAULT 'quiet'",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_SPEAKER_DISTANCE_CM INTEGER DEFAULT 30",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_MIC_ORIENTATION_DEG INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_PREPROCESSING_PROFILE TEXT DEFAULT 'RAW'",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_AUDIO_DURATION_MS INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_SAMPLE_RATE INTEGER DEFAULT 16000",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CHANNELS INTEGER DEFAULT 1",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_VAD_SEGMENT_COUNT INTEGER DEFAULT 1",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_VAD_TOTAL_SPEECH_MS INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_SPEAKER_LOCK_ENABLED INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_SPEAKER_CONFIDENCE REAL DEFAULT 1.0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_SPEAKER_REJECTION INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_WER_RAW REAL",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CER_RAW REAL",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_WER_NORMALIZED REAL",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CER_NORMALIZED REAL",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_MEASUREMENT_ACC REAL",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_LATERALITY_ACC REAL",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_SPINE_LEVEL_ACC REAL",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CRIT_NUMERIC_ERR INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CRIT_MEASUREMENT_ERR INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CRIT_NEGATION_ERR INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CRIT_LATERALITY_ERR INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_CRIT_SPINE_ERR INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_FIRST_SEGMENT_LATENCY_MS INTEGER DEFAULT 0",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_TRUE_PARTIAL_LATENCY_MS INTEGER",
                "ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_ERRORS TEXT"
            )
            for (stmt in alterStatements) {
                try {
                    db.execSQL(stmt)
                } catch (_: Exception) {
                    // Ignored if column already exists
                }
            }
        }
    }

    fun insert(session: BenchmarkSession): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COL_ID, session.id)
            put(COL_SESSION_ID, session.sessionId)
            put(COL_TIMESTAMP, session.timestamp)
            put(COL_DEVICE, session.device)
            put(COL_DEVICE_MODEL, session.deviceModel)
            put(COL_ANDROID_VERSION, session.androidVersion)
            put(COL_CPU_INFO, session.cpuInfo)
            put(COL_MODEL, session.model)
            put(COL_MODEL_NAME, session.modelName)
            put(COL_MODEL_VERSION, session.modelVersion)
            put(COL_NUM_THREADS, session.numThreads)
            put(COL_TEST_ID, session.testId)
            put(COL_CATEGORY, session.category)
            put(COL_ROOM_ID, session.roomId)
            put(COL_ROOM_TYPE, session.roomType)
            put(COL_NOISE_TYPE, session.noiseType)
            put(COL_NOISE_LEVEL, session.noiseLevel)
            put(COL_SPEAKER_DISTANCE_CM, session.speakerDistanceCm)
            put(COL_MIC_ORIENTATION_DEG, session.micOrientationDeg)
            put(COL_PREPROCESSING_PROFILE, session.preprocessingProfile)
            put(COL_AUDIO_DURATION, session.audioDurationSec)
            put(COL_AUDIO_DURATION_MS, session.audioDurationMs)
            put(COL_SAMPLE_RATE, session.sampleRate)
            put(COL_CHANNELS, session.channels)
            put(COL_VAD_SEGMENT_COUNT, session.vadSegmentCount)
            put(COL_VAD_TOTAL_SPEECH_MS, session.vadTotalSpeechMs)
            put(COL_SPEAKER_LOCK_ENABLED, if (session.speakerLockEnabled) 1 else 0)
            put(COL_SPEAKER_CONFIDENCE, session.speakerConfidence)
            put(COL_SPEAKER_REJECTION, if (session.speakerRejection) 1 else 0)
            put(COL_RAW_TRANSCRIPT, session.rawTranscript)
            put(COL_NORMALIZED_TRANSCRIPT, session.normalizedTranscript)
            put(COL_REFERENCE_TEXT, session.referenceText)
            put(COL_WER_RAW, session.werRaw)
            put(COL_CER_RAW, session.cerRaw)
            put(COL_WER_NORMALIZED, session.werNormalized)
            put(COL_CER_NORMALIZED, session.cerNormalized)
            put(COL_CER, session.cer)
            put(COL_WER, session.wer)
            put(COL_MED_TERM_ACC, session.medicalTermAccuracy)
            put(COL_NUMERIC_ACC, session.numericAccuracy)
            put(COL_MEASUREMENT_ACC, session.measurementAccuracy)
            put(COL_ANATOMY_ACC, session.anatomyAccuracy)
            put(COL_LATERALITY_ACC, session.lateralityAccuracy)
            put(COL_NEGATION_ACC, session.negationAccuracy)
            put(COL_SPINE_LEVEL_ACC, session.spineLevelAccuracy)
            put(COL_CRIT_NUMERIC_ERR, if (session.criticalNumericError) 1 else 0)
            put(COL_CRIT_MEASUREMENT_ERR, if (session.criticalMeasurementError) 1 else 0)
            put(COL_CRIT_NEGATION_ERR, if (session.criticalNegationError) 1 else 0)
            put(COL_CRIT_LATERALITY_ERR, if (session.criticalLateralityError) 1 else 0)
            put(COL_CRIT_SPINE_ERR, if (session.criticalSpineError) 1 else 0)
            put(COL_FIRST_SEGMENT_LATENCY_MS, session.firstSegmentResultLatencyMs)
            put(COL_TRUE_PARTIAL_LATENCY_MS, session.truePartialLatencyMs)
            put(COL_FIRST_PARTIAL_MS, session.firstPartialMs)
            put(COL_FINAL_LATENCY_MS, session.finalLatencyMs)
            put(COL_PROCESSING_MS, session.processingMs)
            put(COL_RTF, session.calculateEffectiveRtf())
            put(COL_RAM_PEAK_MB, session.ramPeakMb)
            put(COL_RAM_AVG_MB, session.ramAvgMb)
            put(COL_BATTERY_PERCENT, session.batteryPercent)
            put(COL_BATTERY_TEMP, session.batteryTemp)
            put(COL_AUDIO_PATH, session.audioPath)
            put(COL_ERRORS, if (session.errors.isNotEmpty()) gson.toJson(session.errors) else null)
        }
        return db.insert(TABLE_SESSIONS, null, values)
    }

    fun getAll(): List<BenchmarkSession> {
        val list = mutableListOf<BenchmarkSession>()
        val db = readableDatabase
        val cursor = db.query(TABLE_SESSIONS, null, null, null, null, null, "$COL_ID DESC")

        cursor.use { c ->
            while (c.moveToNext()) {
                val errorsJson = c.getStringOrNull(COL_ERRORS)
                val errorList: List<String> = if (!errorsJson.isNullOrBlank()) {
                    try {
                        val type = object : TypeToken<List<String>>() {}.type
                        gson.fromJson(errorsJson, type) ?: emptyList()
                    } catch (_: Exception) {
                        emptyList()
                    }
                } else {
                    emptyList()
                }

                val session = BenchmarkSession(
                    id = c.getLongOrDefault(COL_ID, System.currentTimeMillis()),
                    sessionId = c.getStringOrDefault(COL_SESSION_ID, "session_${c.getLongOrDefault(COL_ID, 0L)}"),
                    timestamp = c.getStringOrDefault(COL_TIMESTAMP, ""),
                    device = c.getStringOrDefault(COL_DEVICE, "Unknown Device"),
                    deviceModel = c.getStringOrDefault(COL_DEVICE_MODEL, c.getStringOrDefault(COL_DEVICE, "Unknown Device")),
                    androidVersion = c.getStringOrDefault(COL_ANDROID_VERSION, "Unknown"),
                    cpuInfo = c.getStringOrDefault(COL_CPU_INFO, "Snapdragon 8 Gen 3"),
                    model = c.getStringOrDefault(COL_MODEL, ""),
                    modelName = c.getStringOrDefault(COL_MODEL_NAME, c.getStringOrDefault(COL_MODEL, "")),
                    modelVersion = c.getStringOrDefault(COL_MODEL_VERSION, "1.0.0"),
                    numThreads = c.getIntOrDefault(COL_NUM_THREADS, 4),
                    testId = c.getStringOrNull(COL_TEST_ID),
                    category = c.getStringOrNull(COL_CATEGORY),
                    roomId = c.getStringOrDefault(COL_ROOM_ID, "ROOM_01"),
                    roomType = c.getStringOrDefault(COL_ROOM_TYPE, "reading_room"),
                    noiseType = c.getStringOrDefault(COL_NOISE_TYPE, "clean"),
                    noiseLevel = c.getStringOrDefault(COL_NOISE_LEVEL, "quiet"),
                    speakerDistanceCm = c.getIntOrDefault(COL_SPEAKER_DISTANCE_CM, 30),
                    micOrientationDeg = c.getIntOrDefault(COL_MIC_ORIENTATION_DEG, 0),
                    preprocessingProfile = c.getStringOrDefault(COL_PREPROCESSING_PROFILE, "RAW"),
                    audioDurationSec = c.getFloatOrDefault(COL_AUDIO_DURATION, 0.0f),
                    audioDurationMs = c.getLongOrDefault(COL_AUDIO_DURATION_MS, (c.getFloatOrDefault(COL_AUDIO_DURATION, 0.0f) * 1000).toLong()),
                    sampleRate = c.getIntOrDefault(COL_SAMPLE_RATE, 16000),
                    channels = c.getIntOrDefault(COL_CHANNELS, 1),
                    vadSegmentCount = c.getIntOrDefault(COL_VAD_SEGMENT_COUNT, 1),
                    vadTotalSpeechMs = c.getLongOrDefault(COL_VAD_TOTAL_SPEECH_MS, 0L),
                    speakerLockEnabled = c.getIntOrDefault(COL_SPEAKER_LOCK_ENABLED, 0) == 1,
                    speakerConfidence = c.getFloatOrDefault(COL_SPEAKER_CONFIDENCE, 1.0f),
                    speakerRejection = c.getIntOrDefault(COL_SPEAKER_REJECTION, 0) == 1,
                    rawTranscript = c.getStringOrDefault(COL_RAW_TRANSCRIPT, ""),
                    normalizedTranscript = c.getStringOrDefault(COL_NORMALIZED_TRANSCRIPT, ""),
                    referenceText = c.getStringOrNull(COL_REFERENCE_TEXT),
                    reference = c.getStringOrNull(COL_REFERENCE_TEXT),
                    werRaw = c.getFloatOrNull(COL_WER_RAW),
                    cerRaw = c.getFloatOrNull(COL_CER_RAW),
                    werNormalized = c.getFloatOrNull(COL_WER_NORMALIZED) ?: c.getFloatOrNull(COL_WER),
                    cerNormalized = c.getFloatOrNull(COL_CER_NORMALIZED) ?: c.getFloatOrNull(COL_CER),
                    cer = c.getFloatOrNull(COL_CER),
                    wer = c.getFloatOrNull(COL_WER),
                    medicalTermAccuracy = c.getFloatOrNull(COL_MED_TERM_ACC),
                    numericAccuracy = c.getFloatOrNull(COL_NUMERIC_ACC),
                    measurementAccuracy = c.getFloatOrNull(COL_MEASUREMENT_ACC) ?: c.getFloatOrNull(COL_NUMERIC_ACC),
                    anatomyAccuracy = c.getFloatOrNull(COL_ANATOMY_ACC),
                    lateralityAccuracy = c.getFloatOrNull(COL_LATERALITY_ACC),
                    negationAccuracy = c.getFloatOrNull(COL_NEGATION_ACC),
                    spineLevelAccuracy = c.getFloatOrNull(COL_SPINE_LEVEL_ACC),
                    criticalNumericError = c.getIntOrDefault(COL_CRIT_NUMERIC_ERR, 0) == 1,
                    criticalMeasurementError = c.getIntOrDefault(COL_CRIT_MEASUREMENT_ERR, 0) == 1,
                    criticalNegationError = c.getIntOrDefault(COL_CRIT_NEGATION_ERR, 0) == 1,
                    criticalLateralityError = c.getIntOrDefault(COL_CRIT_LATERALITY_ERR, 0) == 1,
                    criticalSpineError = c.getIntOrDefault(COL_CRIT_SPINE_ERR, 0) == 1,
                    firstSegmentResultLatencyMs = c.getLongOrDefault(COL_FIRST_SEGMENT_LATENCY_MS, c.getLongOrDefault(COL_FIRST_PARTIAL_MS, 0L)),
                    truePartialLatencyMs = c.getLongOrNull(COL_TRUE_PARTIAL_LATENCY_MS),
                    firstPartialMs = c.getLongOrDefault(COL_FIRST_PARTIAL_MS, 0L),
                    finalLatencyMs = c.getLongOrDefault(COL_FINAL_LATENCY_MS, 0L),
                    processingMs = c.getLongOrDefault(COL_PROCESSING_MS, 0L),
                    rtf = c.getFloatOrDefault(COL_RTF, 0.0f),
                    ramPeakMb = c.getIntOrDefault(COL_RAM_PEAK_MB, 0),
                    ramAvgMb = c.getIntOrDefault(COL_RAM_AVG_MB, 0),
                    batteryPercent = c.getIntOrDefault(COL_BATTERY_PERCENT, 0),
                    batteryTemp = c.getFloatOrDefault(COL_BATTERY_TEMP, 0.0f),
                    batteryTemperatureC = c.getFloatOrDefault(COL_BATTERY_TEMP, 0.0f),
                    audioPath = c.getStringOrNull(COL_AUDIO_PATH),
                    errors = errorList
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

    // Helper Cursor extension functions for resilient extraction
    private fun Cursor.getStringOrNull(col: String): String? {
        val idx = getColumnIndex(col)
        return if (idx >= 0 && !isNull(idx)) getString(idx) else null
    }

    private fun Cursor.getStringOrDefault(col: String, default: String): String {
        val idx = getColumnIndex(col)
        return if (idx >= 0 && !isNull(idx)) getString(idx) else default
    }

    private fun Cursor.getIntOrDefault(col: String, default: Int): Int {
        val idx = getColumnIndex(col)
        return if (idx >= 0 && !isNull(idx)) getInt(idx) else default
    }

    private fun Cursor.getLongOrDefault(col: String, default: Long): Long {
        val idx = getColumnIndex(col)
        return if (idx >= 0 && !isNull(idx)) getLong(idx) else default
    }

    private fun Cursor.getLongOrNull(col: String): Long? {
        val idx = getColumnIndex(col)
        return if (idx >= 0 && !isNull(idx)) getLong(idx) else null
    }

    private fun Cursor.getFloatOrDefault(col: String, default: Float): Float {
        val idx = getColumnIndex(col)
        return if (idx >= 0 && !isNull(idx)) getFloat(idx) else default
    }

    private fun Cursor.getFloatOrNull(col: String): Float? {
        val idx = getColumnIndex(col)
        return if (idx >= 0 && !isNull(idx)) getFloat(idx) else null
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
            // CSV Header (Standardized V2)
            writer.write(
                "ID,SessionID,Timestamp,Device,Model,TestID,Category,RoomID,RoomType,NoiseType,NoiseLevel,SpeakerDistCm,MicOrientationDeg,Profile,AudioDurationSec,FirstSegmentLatencyMs,TruePartialLatencyMs,FinalLatencyMs,ProcessingMs,RTF,RamPeakMb,BatteryPct,BatteryTemp,WER_Raw,CER_Raw,WER_Norm,CER_Norm,MedTermAcc,NumericAcc,MeasurementAcc,AnatomyAcc,LateralityAcc,NegationAcc,SpineLevelAcc,CritNumErr,CritMeasErr,CritNegErr,CritLatErr,CritSpineErr,RawTranscript,NormalizedTranscript,ReferenceText\n"
            )

            for (s in sessions) {
                val line = listOf(
                    s.id.toString(),
                    escapeCsv(s.sessionId),
                    escapeCsv(s.timestamp),
                    escapeCsv(s.deviceModel),
                    escapeCsv(s.modelName),
                    escapeCsv(s.testId ?: ""),
                    escapeCsv(s.category ?: ""),
                    escapeCsv(s.roomId),
                    escapeCsv(s.roomType),
                    escapeCsv(s.noiseType),
                    escapeCsv(s.noiseLevel),
                    s.speakerDistanceCm.toString(),
                    s.micOrientationDeg.toString(),
                    escapeCsv(s.preprocessingProfile),
                    s.audioDurationSec.toString(),
                    s.firstSegmentResultLatencyMs.toString(),
                    s.truePartialLatencyMs?.toString() ?: "",
                    s.finalLatencyMs.toString(),
                    s.processingMs.toString(),
                    s.calculateEffectiveRtf().toString(),
                    s.ramPeakMb.toString(),
                    s.batteryPercent.toString(),
                    s.batteryTemp.toString(),
                    s.werRaw?.toString() ?: "",
                    s.cerRaw?.toString() ?: "",
                    s.werNormalized?.toString() ?: "",
                    s.cerNormalized?.toString() ?: "",
                    s.medicalTermAccuracy?.toString() ?: "",
                    s.numericAccuracy?.toString() ?: "",
                    s.measurementAccuracy?.toString() ?: "",
                    s.anatomyAccuracy?.toString() ?: "",
                    s.lateralityAccuracy?.toString() ?: "",
                    s.negationAccuracy?.toString() ?: "",
                    s.spineLevelAccuracy?.toString() ?: "",
                    if (s.criticalNumericError) "1" else "0",
                    if (s.criticalMeasurementError) "1" else "0",
                    if (s.criticalNegationError) "1" else "0",
                    if (s.criticalLateralityError) "1" else "0",
                    if (s.criticalSpineError) "1" else "0",
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
