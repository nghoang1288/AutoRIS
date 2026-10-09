package com.autoris.asrbenchmark

import android.app.Application
import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.autoris.asrbenchmark.storage.BenchmarkSyncClient
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.autoris.asrbenchmark.asr.ASREngine
import com.autoris.asrbenchmark.asr.ASRModelType
import com.autoris.asrbenchmark.asr.ModelManager
import com.autoris.asrbenchmark.asr.ModelStatus
import com.autoris.asrbenchmark.asr.Zipformer150MOfflineEngine
import com.autoris.asrbenchmark.asr.Zipformer30MStreamingEngine
import com.autoris.asrbenchmark.audio.AudioCapture
import com.autoris.asrbenchmark.audio.AudioCaptureState
import com.autoris.asrbenchmark.audio.AudioPreprocessorFactory
import com.autoris.asrbenchmark.audio.AudioRecorderManager
import com.autoris.asrbenchmark.audio.PreprocessingProfile
import com.autoris.asrbenchmark.audio.VoiceLockState
import com.autoris.asrbenchmark.audio.WavWriter
import com.autoris.asrbenchmark.benchmark.AccuracyEvaluator
import com.autoris.asrbenchmark.benchmark.BenchmarkSession
import com.autoris.asrbenchmark.benchmark.BenchmarkTrack
import com.autoris.asrbenchmark.benchmark.EnglishTestSet
import com.autoris.asrbenchmark.benchmark.EvaluationReport
import com.autoris.asrbenchmark.benchmark.MedicalTestSentence
import com.autoris.asrbenchmark.benchmark.MedicalTestSet
import com.autoris.asrbenchmark.noise.NoiseProfile
import com.autoris.asrbenchmark.noise.NoiseScenario
import com.autoris.asrbenchmark.benchmark.SystemMonitor
import com.autoris.asrbenchmark.benchmark.SystemStats
import com.autoris.asrbenchmark.normalizer.MedicalTextNormalizer
import com.autoris.asrbenchmark.normalizer.NormalizedResult
import com.autoris.asrbenchmark.storage.BenchmarkDatabase
import com.autoris.asrbenchmark.storage.BenchmarkExporter
import com.autoris.asrbenchmark.storage.AppUpdateManager
import com.autoris.asrbenchmark.storage.AppUpdateInfo
import com.autoris.asrbenchmark.safety.AcousticQuality
import com.autoris.asrbenchmark.safety.AcousticQualityLevel
import com.autoris.asrbenchmark.safety.EvidenceStatus
import com.autoris.asrbenchmark.safety.CrossEngineConsistencyChecker
import com.autoris.asrbenchmark.safety.ParserStatus
import com.autoris.asrbenchmark.safety.SafetyEvidence
import com.autoris.asrbenchmark.safety.SafetyGate
import com.autoris.asrbenchmark.safety.SafetyGateDecision
import com.autoris.asrbenchmark.safety.SafetyGateStatus
import com.autoris.asrbenchmark.safety.SpeakerState
import com.autoris.asrbenchmark.safety.CriticalEntityValidator
import com.autoris.asrbenchmark.normalizer.CertaintyLevel
import com.autoris.asrbenchmark.vad.VadConfig
import com.autoris.asrbenchmark.vad.VadState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class UiBenchmarkMetrics(
    val audioDurationSec: Float = 0.0f,
    val firstPartialMs: Long = 0L,
    val firstSegmentResultLatencyMs: Long = 0L,
    val truePartialLatencyMs: Long? = null,
    val finalLatencyMs: Long = 0L,
    val processingMs: Long = 0L,
    val rtf: Float = 0.0f,
    val ramPeakMb: Int = 0,
    val ramAvgMb: Int = 0,
    val batteryPercent: Int = 0,
    val batteryTemp: Float = 0.0f,
    val vadSegmentCount: Int = 1,
    val vadTotalSpeechMs: Long = 0L
)

enum class AppOperatingMode(val displayName: String) {
    CLINICAL_SAFE("Lâm sàng an toàn (PACS/RIS)"),
    BENCHMARK("Nghiên cứu & Benchmark")
}

sealed class SyncState {
    object Idle : SyncState()
    data class Syncing(val message: String = "Đang gửi sang RIS...") : SyncState()
    data class Retrying(val attempt: Int, val max: Int, val reason: String) : SyncState()
    data class Success(val message: String, val timestamp: String) : SyncState()
    data class Error(val error: String, val canRetry: Boolean = true) : SyncState()
}

class MainViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "MainViewModel"
    }

    private val db = BenchmarkDatabase(application)
    private val systemMonitor = SystemMonitor(application)
    private val prefs = getApplication<Application>().getSharedPreferences("asr_benchmark_prefs", Context.MODE_PRIVATE)

    // ASR Model Selection & Engine
    private val _selectedModelType = MutableStateFlow(
        ASRModelType.fromId(prefs.getString("selected_model_type", ASRModelType.ZIPFORMER_150M_OFFLINE.id) ?: ASRModelType.ZIPFORMER_150M_OFFLINE.id)
    )
    val selectedModelType: StateFlow<ASRModelType> = _selectedModelType.asStateFlow()

    var vadConfig: VadConfig = VadConfig()
    private var asrEngine: ASREngine = createEngine(_selectedModelType.value)

    private fun createEngine(type: ASRModelType): ASREngine {
        return when (type) {
            ASRModelType.ZIPFORMER_30M_STREAMING -> Zipformer30MStreamingEngine(getApplication(), vadConfig, numThreads = 2)
            ASRModelType.ZIPFORMER_150M_OFFLINE -> Zipformer150MOfflineEngine(getApplication(), numThreads = 4)
        }
    }

    private val _modelStatus = MutableStateFlow(ModelManager.getModelStatus(application, _selectedModelType.value))
    val modelStatus: StateFlow<ModelStatus> = _modelStatus.asStateFlow()

    private val _isModelInitializing = MutableStateFlow(false)
    val isModelInitializing: StateFlow<Boolean> = _isModelInitializing.asStateFlow()

    private val _downloadProgress = MutableStateFlow<String?>(null)
    val downloadProgress: StateFlow<String?> = _downloadProgress.asStateFlow()

    // Test selection
    private val _selectedTestSentence = MutableStateFlow<MedicalTestSentence?>(null)
    val selectedTestSentence: StateFlow<MedicalTestSentence?> = _selectedTestSentence.asStateFlow()

    // Realtime transcription state
    private val _livePartial = MutableStateFlow("")
    val livePartial: StateFlow<String> = _livePartial.asStateFlow()

    private val _finalTranscript = MutableStateFlow("")
    val finalTranscript: StateFlow<String> = _finalTranscript.asStateFlow()

    private val _normalizedResult = MutableStateFlow<NormalizedResult?>(null)
    val normalizedResult: StateFlow<NormalizedResult?> = _normalizedResult.asStateFlow()

    private val _evaluationReport = MutableStateFlow<EvaluationReport?>(null)
    val evaluationReport: StateFlow<EvaluationReport?> = _evaluationReport.asStateFlow()

    // Benchmark Metrics
    private val _metrics = MutableStateFlow(UiBenchmarkMetrics())
    val metrics: StateFlow<UiBenchmarkMetrics> = _metrics.asStateFlow()

    private val _systemStats = MutableStateFlow(systemMonitor.pollStats())
    val systemStats: StateFlow<SystemStats> = _systemStats.asStateFlow()

    // Recording status & audio capture
    private val _captureState = MutableStateFlow(AudioCaptureState())
    val captureState: StateFlow<AudioCaptureState> = _captureState.asStateFlow()

    private val _isSaveAudioEnabled = MutableStateFlow(true)
    val isSaveAudioEnabled: StateFlow<Boolean> = _isSaveAudioEnabled.asStateFlow()

    private val _statusMessage = MutableStateFlow("Sẵn sàng")
    val statusMessage: StateFlow<String> = _statusMessage.asStateFlow()

    // History
    private val _historySessions = MutableStateFlow<List<BenchmarkSession>>(emptyList())
    val historySessions: StateFlow<List<BenchmarkSession>> = _historySessions.asStateFlow()

    // Sync to Cloud VPS / Local Server
    private val _serverUrl = MutableStateFlow(
        run {
            val saved = prefs.getString("server_url", null)
            if (saved.isNullOrBlank() || saved.contains("192.168.50.100") || saved.contains("localhost")) {
                prefs.edit().putString("server_url", "https://autoris.hoang.qzz.io").apply()
                "https://autoris.hoang.qzz.io"
            } else {
                saved
            }
        }
    )
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _isAutoSyncEnabled = MutableStateFlow(prefs.getBoolean("auto_sync_server", true))
    val isAutoSyncEnabled: StateFlow<Boolean> = _isAutoSyncEnabled.asStateFlow()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _serverStatus = MutableStateFlow<String?>("Chưa kết nối")
    val serverStatus: StateFlow<String?> = _serverStatus.asStateFlow()

    // Trạng thái đồng bộ RIS thời gian thực (Báo thành công / đang gửi / đang thử lại / lỗi)
    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState: StateFlow<SyncState> = _syncState.asStateFlow()

    // Chế độ tự động gửi sang RIS theo thời gian thực (Đọc đến đâu gửi đến đó)
    private val _isLiveAutoSendEnabled = MutableStateFlow(prefs.getBoolean("live_auto_send", true))
    val isLiveAutoSendEnabled: StateFlow<Boolean> = _isLiveAutoSendEnabled.asStateFlow()

    fun toggleLiveAutoSend() {
        val newVal = !_isLiveAutoSendEnabled.value
        _isLiveAutoSendEnabled.value = newVal
        prefs.edit().putBoolean("live_auto_send", newVal).apply()
        _statusMessage.value = if (newVal) "⚡ Đã BẬT tự động gửi khi đọc" else "⏸️ Đã TẮT tự động gửi (gửi thủ công)"
    }

    // Tự động kiểm tra và cập nhật ứng dụng (In-app Auto Update)
    private val _appUpdateInfo = MutableStateFlow(AppUpdateInfo())
    val appUpdateInfo: StateFlow<AppUpdateInfo> = _appUpdateInfo.asStateFlow()

    fun checkForAppUpdate(silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) {
                _statusMessage.value = "Đang kiểm tra bản cập nhật..."
            }
            val result = AppUpdateManager.checkUpdate(getApplication(), _serverUrl.value)
            result.onSuccess { info ->
                _appUpdateInfo.value = info
                if (info.hasUpdate) {
                    _statusMessage.value = "⚡ Có bản cập nhật mới v${info.versionName}!"
                } else if (!silent) {
                    _statusMessage.value = "Ứng dụng đang ở phiên bản mới nhất (v${info.currentVersionName})"
                }
            }.onFailure { err ->
                if (!silent) {
                    _statusMessage.value = "Lỗi kiểm tra cập nhật: ${err.message}"
                }
            }
        }
    }

    fun startAppUpdateDownload() {
        val info = _appUpdateInfo.value
        if (!info.hasUpdate || info.apkUrl.isBlank() || info.isDownloading) return

        viewModelScope.launch {
            _appUpdateInfo.value = info.copy(isDownloading = true, downloadProgress = 0f, downloadError = null)
            _statusMessage.value = "Đang tải bản cập nhật v${info.versionName}..."

            val res = AppUpdateManager.downloadAndInstall(
                context = getApplication(),
                apkDownloadUrl = info.apkUrl,
                onProgress = { prog ->
                    _appUpdateInfo.value = _appUpdateInfo.value.copy(downloadProgress = prog)
                }
            )

            res.onSuccess {
                _appUpdateInfo.value = _appUpdateInfo.value.copy(isDownloading = false, downloadProgress = 1f)
                _statusMessage.value = "Đã tải xong! Mở trình cài đặt..."
            }.onFailure { err ->
                _appUpdateInfo.value = _appUpdateInfo.value.copy(isDownloading = false, downloadError = err.message)
                _statusMessage.value = "Lỗi tải cập nhật: ${err.message}"
            }
        }
    }

    private var liveSendJob: Job? = null
    private var lastAutoSentText: String = ""

    // Scenario & Noise Benchmark Parameters
    private val _selectedScenario = MutableStateFlow(NoiseScenario.ROOM_READING_STANDARD)
    val selectedScenario: StateFlow<NoiseScenario> = _selectedScenario.asStateFlow()

    private val _benchmarkTrack = MutableStateFlow(BenchmarkTrack.VIETNAMESE_RADIOLOGY)
    val benchmarkTrack: StateFlow<BenchmarkTrack> = _benchmarkTrack.asStateFlow()

    private val _noiseProfile = MutableStateFlow(NoiseProfile())
    val noiseProfile: StateFlow<NoiseProfile> = _noiseProfile.asStateFlow()

    private val _roomId = MutableStateFlow("ROOM_01")
    val roomId: StateFlow<String> = _roomId.asStateFlow()

    private val _roomType = MutableStateFlow("reading_room")
    val roomType: StateFlow<String> = _roomType.asStateFlow()

    private val _noiseType = MutableStateFlow("clean")
    val noiseType: StateFlow<String> = _noiseType.asStateFlow()

    private val _noiseLevel = MutableStateFlow("quiet")
    val noiseLevel: StateFlow<String> = _noiseLevel.asStateFlow()

    private val _speakerDistanceCm = MutableStateFlow(30)
    val speakerDistanceCm: StateFlow<Int> = _speakerDistanceCm.asStateFlow()

    private val _micOrientationDeg = MutableStateFlow(0)
    val micOrientationDeg: StateFlow<Int> = _micOrientationDeg.asStateFlow()

    private val _preprocessingProfile = MutableStateFlow("RAW")
    val preprocessingProfile: StateFlow<String> = _preprocessingProfile.asStateFlow()

    private val _speakerLockEnabled = MutableStateFlow(false)
    val speakerLockEnabled: StateFlow<Boolean> = _speakerLockEnabled.asStateFlow()

    private val _voiceLockConfidence = MutableStateFlow(1.0f)
    val voiceLockConfidence: StateFlow<Float> = _voiceLockConfidence.asStateFlow()

    private val _voiceLockState = MutableStateFlow(VoiceLockState.ACCEPT)
    val voiceLockState: StateFlow<VoiceLockState> = _voiceLockState.asStateFlow()

    // Decision versioning tokens for immutable safety binding (Phase A4)
    var currentTranscriptVersion: Long = 0L
        private set
    var currentSpeakerEnrollmentVersion: Long = 0L
        private set

    // Invalidate safety gate decision helper (Phase A2)
    fun invalidateSafetyDecision(reason: String) {
        currentTranscriptVersion++
        _safetyGateDecision.value = null
        Log.d(TAG, "Safety decision invalidated: $reason")
    }

    // Mode Separation: Clinical Safe Mode vs Benchmark Mode
    private val _operatingMode = MutableStateFlow(AppOperatingMode.CLINICAL_SAFE)
    val operatingMode: StateFlow<AppOperatingMode> = _operatingMode.asStateFlow()

    fun setOperatingMode(mode: AppOperatingMode) {
        _operatingMode.value = mode
        invalidateSafetyDecision("Operating mode changed to $mode")
        recomputeSafetyGate()
    }

    private val safetyGate = SafetyGate()
    private val _safetyGateDecision = MutableStateFlow<SafetyGateDecision?>(null)
    val safetyGateDecision: StateFlow<SafetyGateDecision?> = _safetyGateDecision.asStateFlow()

    fun exportToRis(customText: String? = null, isLiveStream: Boolean = false): Boolean {
        if (_operatingMode.value == AppOperatingMode.BENCHMARK) {
            _statusMessage.value = "Từ chối gửi RIS: Đang ở chế độ Benchmark kiểm thử!"
            return false
        }

        val currentText = (customText ?: _finalTranscript.value.ifBlank { _livePartial.value }).trim()
        if (currentText.isBlank()) {
            _statusMessage.value = "Chưa có nội dung để gửi sang RIS/PACS!"
            return false
        }

        // Cập nhật transcript nếu bác sĩ gửi bản sửa đổi
        if (customText != null && customText != _finalTranscript.value) {
            _finalTranscript.value = customText
            _normalizedResult.value = MedicalTextNormalizer.process(customText)
        }

        val ref = _selectedTestSentence.value
        val audioToSave = lastSavedAudioPath

        val session = BenchmarkSession(
            timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date()),
            device = SystemMonitor.getDeviceModel(),
            deviceModel = SystemMonitor.getDeviceModel(),
            androidVersion = android.os.Build.VERSION.RELEASE ?: "Unknown",
            cpuInfo = "Snapdragon 8 Gen 3",
            model = asrEngine.name,
            modelName = asrEngine.name,
            modelVersion = "1.0.0",
            numThreads = 4,
            testId = ref?.id ?: if (isLiveStream) "CLINICAL_STREAM" else "CLINICAL_DICTATION",
            category = ref?.category ?: "Clinical Dictation",
            roomId = _roomId.value,
            roomType = _roomType.value,
            noiseType = _noiseType.value,
            noiseLevel = _noiseLevel.value,
            speakerDistanceCm = _speakerDistanceCm.value,
            micOrientationDeg = _micOrientationDeg.value,
            preprocessingProfile = _preprocessingProfile.value,
            actualPreprocessingProfile = _preprocessingProfile.value,
            audioDurationSec = _captureState.value.audioDurationSec,
            sampleRate = 16000,
            channels = 1,
            rawTranscript = currentText,
            normalizedTranscript = currentText,
            referenceText = ref?.referenceText,
            reference = ref?.referenceText,
            audioPath = audioToSave
        )

        _syncState.value = SyncState.Syncing(if (isLiveStream) "⚡ Đang tự động gửi..." else "🚀 Đang gửi sang RIS...")

        viewModelScope.launch(Dispatchers.IO) {
            val insertedId = db.insert(session)
            loadHistory()
            val toUpload = session.copy(id = insertedId)
            
            val uploadRes = BenchmarkSyncClient.uploadSessions(
                serverUrl = _serverUrl.value,
                sessions = listOf(toUpload),
                maxRetries = 3,
                onRetry = { attempt, max, err ->
                    viewModelScope.launch(Dispatchers.Main) {
                        val reason = err.message ?: "Mất kết nối mạng"
                        _syncState.value = SyncState.Retrying(attempt, max, reason)
                        _statusMessage.value = "⚠️ Đang thử gửi lại ($attempt/$max): ${reason.take(35)}..."
                    }
                }
            )

            withContext(Dispatchers.Main) {
                uploadRes.fold(
                    onSuccess = {
                        val timeStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                        _syncState.value = SyncState.Success("Đã điền vào RIS thành công", timeStr)
                        _statusMessage.value = "✅ Đã gửi RIS lúc $timeStr"
                        com.autoris.asrbenchmark.ui.util.HapticHelper.vibrateSuccess(getApplication())
                    },
                    onFailure = { err ->
                        val errMsg = err.message ?: "Không thể kết nối máy chủ"
                        _syncState.value = SyncState.Error(errMsg, canRetry = true)
                        _statusMessage.value = "❌ Lỗi gửi RIS: ${errMsg.take(50)}"
                        com.autoris.asrbenchmark.ui.util.HapticHelper.vibrateError(getApplication())
                    }
                )
            }
        }

        return true
    }

    fun recomputeSafetyGate() {
        val norm = _normalizedResult.value
        val text = _finalTranscript.value.ifBlank { _livePartial.value }
        if (text.isBlank() || norm == null) {
            _safetyGateDecision.value = null
            return
        }

        val speakerState = when (_voiceLockState.value) {
            VoiceLockState.ACCEPT -> SpeakerState.ACCEPTED
            VoiceLockState.REJECT -> SpeakerState.REJECTED
            VoiceLockState.UNCERTAIN -> SpeakerState.UNCERTAIN
            else -> if (_speakerLockEnabled.value) SpeakerState.NOT_ENROLLED else SpeakerState.DISABLED
        }

        val acousticLevel = when {
            _noiseProfile.value.snrDb < 10.0f || _noiseProfile.value.noiseFloorDb > -36.0f -> AcousticQualityLevel.DEGRADED
            _noiseProfile.value.snrDb >= 20.0f && _noiseProfile.value.noiseFloorDb <= -48.0f -> AcousticQualityLevel.OPTIMAL
            else -> AcousticQualityLevel.ACCEPTABLE
        }

        // A7: Explicit structured entity validation
        val entityValidation = CriticalEntityValidator.validate(norm)

        // Phase E: Cross-engine consistency check between 30M streaming and 150M offline
        val streamingText = audioRecorderManager?.lastStreamingTranscript ?: ""
        val criticalErrors = entityValidation.criticalErrors.toMutableList()
        var criticalStatus = entityValidation.status
        val reviewReasons = entityValidation.reviewReasons.toMutableList()

        if (streamingText.isNotBlank() && streamingText != text) {
            val consistency = CrossEngineConsistencyChecker.check(streamingText, text)
            if (!consistency.isConsistent) {
                criticalErrors.addAll(consistency.mismatches)
                criticalStatus = EvidenceStatus.INVALID
            }
        }

        val parserStatus = when {
            criticalStatus == EvidenceStatus.INVALID -> ParserStatus.SYNTAX_ERROR
            entityValidation.hasAmbiguousEntities -> ParserStatus.HAS_AMBIGUITY
            norm.hasAmbiguityOrConflict -> ParserStatus.HAS_AMBIGUITY
            else -> ParserStatus.CONFIRMED_CLEAN
        }

        // A3: No fake confidence score. null evaluates to REVIEW_REQUIRED
        val asrConfidence: Float? = null

        val evidence = SafetyEvidence(
            speakerState = speakerState,
            transcriptConfidence = asrConfidence,
            acousticQuality = AcousticQuality(
                level = acousticLevel,
                snrDb = _noiseProfile.value.snrDb,
                noiseFloorDb = _noiseProfile.value.noiseFloorDb
            ),
            parserStatus = parserStatus,
            criticalEntitiesStatus = criticalStatus,
            entityValidation = entityValidation,
            boundTranscript = text,
            transcriptVersion = currentTranscriptVersion,
            speakerEnrollmentVersion = currentSpeakerEnrollmentVersion,
            unresolvedAmbiguities = reviewReasons,
            criticalErrors = criticalErrors
        )

        val decision = if (_operatingMode.value == AppOperatingMode.CLINICAL_SAFE) {
            safetyGate.evaluateProduction(evidence)
        } else {
            safetyGate.evaluateBenchmark(_evaluationReport.value, evidence)
        }
        _safetyGateDecision.value = decision
    }

    fun selectScenario(scenario: NoiseScenario) {
        _selectedScenario.value = scenario
        _roomId.value = scenario.id
        _roomType.value = scenario.roomType
        _noiseType.value = scenario.defaultNoiseType
        _noiseLevel.value = scenario.defaultNoiseLevel
        _preprocessingProfile.value = scenario.recommendedProfile.id
    }

    fun selectTrack(track: BenchmarkTrack) {
        _benchmarkTrack.value = track
        if (track == BenchmarkTrack.ENGLISH_FRONTEND) {
            _selectedTestSentence.value = EnglishTestSet.SENTENCES.firstOrNull()
        } else {
            _selectedTestSentence.value = MedicalTestSet.SENTENCES.firstOrNull()
        }
        resetTest()
    }

    fun calibrateNoiseFloor() {
        viewModelScope.launch {
            _statusMessage.value = "Đang thu âm hiệu chuẩn độ ồn phòng (1.0s)..."
            val samples = AudioCapture.recordCalibrationSamples(durationMs = 1000)
            if (samples.isNotEmpty()) {
                val tracker = com.autoris.asrbenchmark.noise.AdaptiveNoiseTracker()
                tracker.calibrate(samples)
                val floorDb = tracker.getEstimatedNoiseFloor()
                _noiseProfile.value = _noiseProfile.value.copy(
                    noiseFloorDb = floorDb,
                    speechThresholdDb = floorDb + 7.0f,
                    silenceThresholdDb = floorDb + 3.0f,
                    currentDb = floorDb
                )
                _statusMessage.value = "Hiệu chuẩn thành công: Độ ồn thực tế ${floorDb.toInt()} dB"
            } else {
                val fallbackFloor = _selectedScenario.value.typicalFloorDb
                _noiseProfile.value = _noiseProfile.value.copy(
                    noiseFloorDb = fallbackFloor,
                    speechThresholdDb = fallbackFloor + 7.0f,
                    silenceThresholdDb = fallbackFloor + 3.0f
                )
                _statusMessage.value = "Không thể ghi âm micro, dùng mặc định phòng: ${fallbackFloor.toInt()} dB"
            }
        }
    }

    fun setRoomConfig(roomId: String, roomType: String) {
        _roomId.value = roomId
        _roomType.value = roomType
        invalidateSafetyDecision("Room config changed: $roomId")
        recomputeSafetyGate()
    }

    fun setNoiseConfig(noiseType: String, noiseLevel: String) {
        _noiseType.value = noiseType
        _noiseLevel.value = noiseLevel
        invalidateSafetyDecision("Noise config changed: $noiseType, $noiseLevel")
        recomputeSafetyGate()
    }

    fun setSpeakerDistanceCm(cm: Int) {
        _speakerDistanceCm.value = cm
    }

    fun setMicOrientationDeg(deg: Int) {
        _micOrientationDeg.value = deg
    }

    fun setPreprocessingProfile(profile: String) {
        _preprocessingProfile.value = profile
        invalidateSafetyDecision("Preprocessing profile changed: $profile")
        recomputeSafetyGate()
    }

    fun setSpeakerLockEnabled(enabled: Boolean) {
        _speakerLockEnabled.value = enabled
        invalidateSafetyDecision("Speaker lock setting changed: $enabled")
        recomputeSafetyGate()
    }

    // Biometric Speaker Verifier (Fail-closed Voice Lock)
    val speakerVerifier = com.autoris.asrbenchmark.audio.SpectralEmbeddingSpeakerVerifier()

    fun clearSpeakerEnrollment() {
        speakerVerifier.clearEnrollment()
        currentSpeakerEnrollmentVersion++
        _voiceLockState.value = VoiceLockState.ACCEPT
        _voiceLockConfidence.value = 1.0f
        invalidateSafetyDecision("Speaker enrollment cleared")
        recomputeSafetyGate()
    }

    fun enrollSpeakerUtterances(utterances: List<FloatArray>): com.autoris.asrbenchmark.audio.EnrollmentQualityResult {
        val result = speakerVerifier.enroll(utterances)
        if (result.isValid) {
            currentSpeakerEnrollmentVersion++
            invalidateSafetyDecision("Speaker utterances enrolled")
            recomputeSafetyGate()
        }
        return result
    }

    // Timings
    private var stopRequestedTimeNs: Long = 0L

    private var audioRecorderManager: AudioRecorderManager? = null
    private var statsJob: Job? = null

    init {
        initEngine()
        startStatsPolling()
        loadHistory()
        checkForAppUpdate(silent = true)
    }

    private fun startStatsPolling() {
        statsJob?.cancel()
        statsJob = viewModelScope.launch(Dispatchers.Default) {
            while (isActive) {
                _systemStats.value = systemMonitor.pollStats()
                delay(1000)
            }
        }
    }

    fun initEngine() {
        viewModelScope.launch {
            _isModelInitializing.value = true
            val currentType = _selectedModelType.value
            _statusMessage.value = "Đang kiểm tra ${currentType.displayName}..."

            val ready = ModelManager.ensureModelReady(getApplication(), currentType) { step, cur, tot ->
                _statusMessage.value = step
            }

            _modelStatus.value = ModelManager.getModelStatus(getApplication(), currentType)

            if (ready) {
                _statusMessage.value = "Đang nạp ${currentType.displayName}..."
                val ok = withContext(Dispatchers.Default) {
                    try {
                        asrEngine.release()
                        asrEngine = createEngine(currentType)
                        asrEngine.init()
                    } catch (t: Throwable) {
                        Log.e(TAG, "Fatal error initializing engine for $currentType", t)
                        false
                    }
                }
                if (ok) {
                    _statusMessage.value = "Sẵn sàng (${currentType.paramCount})"
                } else {
                    _statusMessage.value = "Khởi tạo ASR Engine thất bại"
                }
            } else {
                _statusMessage.value = "Chưa có model ${currentType.displayName}. Vui lòng tải về máy."
            }
            _isModelInitializing.value = false
        }
    }

    fun selectModel(type: ASRModelType) {
        if (_selectedModelType.value == type && asrEngine.isReady) return
        invalidateSafetyDecision("Model changed to $type")
        _selectedModelType.value = type
        prefs.edit().putString("selected_model_type", type.id).apply()
        resetTest()
        initEngine()
    }

    fun downloadModel() {
        viewModelScope.launch {
            _isModelInitializing.value = true
            val currentType = _selectedModelType.value
            _downloadProgress.value = "Bắt đầu tải ${currentType.displayName}..."
            val result = ModelManager.downloadModel(
                getApplication(),
                currentType,
                serverBaseUrl = _serverUrl.value
            ) { fileName, cur, tot, pct ->
                val mbCur = cur / (1024f * 1024f)
                val mbTot = tot / (1024f * 1024f)
                _downloadProgress.value = "Đang tải $fileName: $pct% (${String.format(Locale.ROOT, "%.1f/%.1f MB", mbCur, mbTot)})"
            }

            if (result.isSuccess) {
                _downloadProgress.value = null
                _modelStatus.value = ModelManager.getModelStatus(getApplication(), currentType)
                initEngine()
            } else {
                _downloadProgress.value = "Lỗi tải model: ${result.exceptionOrNull()?.message}"
                _isModelInitializing.value = false
            }
        }
    }

    private var lastSavedAudioPath: String? = null

    fun updateVadConfig(trailing1: Float? = null, trailing2: Float? = null) {
        vadConfig = vadConfig.copy(
            rule1MinTrailingSilence = trailing1 ?: vadConfig.rule1MinTrailingSilence,
            rule2MinTrailingSilence = trailing2 ?: vadConfig.rule2MinTrailingSilence
        )
    }

    fun setSaveAudioEnabled(enabled: Boolean) {
        _isSaveAudioEnabled.value = enabled
        audioRecorderManager?.isSaveAudioEnabled = enabled
    }

    fun selectTestSentence(sentence: MedicalTestSentence?) {
        _selectedTestSentence.value = sentence
        resetTest()
    }

    private var lastToggleTimeMs: Long = 0L

    fun toggleRecording() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastToggleTimeMs < 400L) {
            Log.d(TAG, "Ignoring toggleRecording debounce (${now - lastToggleTimeMs}ms)")
            return
        }
        lastToggleTimeMs = now
        if (_captureState.value.isRecording) {
            stopRecording()
        } else {
            startRecording()
        }
    }

    fun startRecording() {
        if (!_modelStatus.value.isReady) {
            _statusMessage.value = "Model chưa sẵn sàng!"
            return
        }

        // Reset display
        currentTranscriptVersion++
        invalidateSafetyDecision("Recording started")
        _livePartial.value = ""
        _finalTranscript.value = ""
        _normalizedResult.value = null
        _evaluationReport.value = null
        _metrics.value = UiBenchmarkMetrics()
        liveSendJob?.cancel()
        lastAutoSentText = ""

        val profile = PreprocessingProfile.fromId(_preprocessingProfile.value)
        val preprocessor = AudioPreprocessorFactory.create(profile, getApplication())
        val streamingEngine: ASREngine? = null // Sole model: ZipFormer 150M handles all decodes

        val manager = AudioRecorderManager(
            asrEngine = asrEngine,
            streamingEngine = streamingEngine,
            vadConfig = vadConfig,
            vadEngine = com.autoris.asrbenchmark.vad.NeuralVadEngine(context = getApplication()),
            preprocessingProfile = profile,
            preprocessor = preprocessor,
            speakerVerifier = speakerVerifier,
            isSpeakerLockEnabled = _speakerLockEnabled.value,
            onPolicyDecision = { decision ->
                viewModelScope.launch(Dispatchers.Main) {
                    _preprocessingProfile.value = decision.activeProfile.name
                    val floor = _noiseProfile.value.noiseFloorDb
                    val matchedScenario = when {
                        floor < -48.0f -> NoiseScenario.ROOM_READING_STANDARD
                        floor < -43.0f -> NoiseScenario.ROOM_CT_CONSOLE
                        floor < -38.0f -> NoiseScenario.ROOM_MRI_CONSOLE
                        else -> NoiseScenario.ROOM_EMERGENCY
                    }
                    _selectedScenario.value = matchedScenario
                    _roomId.value = matchedScenario.id
                    _roomType.value = matchedScenario.roomType
                }
            },
            onNoiseProfileUpdate = { liveProfile ->
                viewModelScope.launch(Dispatchers.Main) {
                    _noiseProfile.value = liveProfile
                }
            },
            onPartialResult = { partial, firstLatencyMs ->
                viewModelScope.launch(Dispatchers.Main) {
                    currentTranscriptVersion++
                    _livePartial.value = partial
                    _finalTranscript.value = partial
                    val norm = MedicalTextNormalizer.process(partial)
                    _normalizedResult.value = norm

                    val ref = _selectedTestSentence.value
                    if (ref != null) {
                        val eval = AccuracyEvaluator.evaluate(
                            reference = ref.referenceText,
                            hypothesis = norm.normalizedSuggestion.ifBlank { partial },
                            testSentence = ref
                        )
                        _evaluationReport.value = eval
                    }

                    if (_metrics.value.firstPartialMs == 0L && firstLatencyMs > 0L) {
                        _metrics.value = _metrics.value.copy(
                            firstPartialMs = firstLatencyMs,
                            firstSegmentResultLatencyMs = firstLatencyMs
                        )
                    }

                    recomputeSafetyGate()

                    // TỰ ĐỘNG GỬI SANG RIS THEO THỜI GIAN THỰC (ĐỌC ĐẾN ĐÂU TỰ ĐỘNG GỬI ĐẾN ĐÓ)
                    if (_operatingMode.value == AppOperatingMode.CLINICAL_SAFE && _isLiveAutoSendEnabled.value) {
                        val textToStream = norm.normalizedSuggestion.ifBlank { partial }.trim()
                        if (textToStream.length >= 6 && textToStream != lastAutoSentText) {
                            liveSendJob?.cancel()
                            liveSendJob = viewModelScope.launch(Dispatchers.Default) {
                                delay(850L) // Đợi 850ms sau ngắt giọng để gửi bản cập nhật ổn định
                                if (isActive && _isLiveAutoSendEnabled.value && _captureState.value.isRecording) {
                                    val currentClean = _normalizedResult.value?.normalizedSuggestion?.ifBlank { _livePartial.value }?.trim() ?: textToStream
                                    if (currentClean.isNotBlank() && currentClean != lastAutoSentText) {
                                        lastAutoSentText = currentClean
                                        withContext(Dispatchers.Main) {
                                            exportToRis(currentClean, isLiveStream = true)
                                            // Sau khi gửi xong câu này, reset buffer để câu tiếp theo gửi riêng biệt từng dòng
                                            audioRecorderManager?.clearAccumulatedSegments()
                                            _livePartial.value = ""
                                            lastAutoSentText = ""
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            onSpeakerVerificationResult = { result ->
                viewModelScope.launch(Dispatchers.Main) {
                    _voiceLockState.value = result.state
                    _voiceLockConfidence.value = result.confidence
                }
            },
            onError = { errMsg ->
                viewModelScope.launch(Dispatchers.Main) {
                    _statusMessage.value = "Lỗi: $errMsg"
                }
            }
        ).apply {
            isSaveAudioEnabled = _isSaveAudioEnabled.value
        }
        audioRecorderManager = manager

        val started = manager.startRecording(viewModelScope)
        if (started) {
            com.autoris.asrbenchmark.ui.util.HapticHelper.vibrateStart(getApplication())
            _statusMessage.value = "Đang thu âm liên tục..."
            viewModelScope.launch {
                manager.state.collect { state ->
                    _captureState.value = state
                    if (state.isRecording) {
                        _metrics.value = _metrics.value.copy(audioDurationSec = state.audioDurationSec)
                    }
                }
            }
        }
    }

    fun stopRecording() {
        com.autoris.asrbenchmark.ui.util.HapticHelper.vibrateStop(getApplication())
        stopRequestedTimeNs = SystemClock.elapsedRealtimeNanos()
        invalidateSafetyDecision("Recording stop requested")
        _statusMessage.value = "Đang chốt kết quả và lưu..."
        val manager = audioRecorderManager ?: return
        viewModelScope.launch(Dispatchers.Default) {
            val finalText = manager.stopRecording()
            val totalProcMs = manager.getTotalProcessingMs()
            val duration = _captureState.value.audioDurationSec
            withContext(Dispatchers.Main) {
                finalizeResult(finalText, totalProcMs, duration)
            }
        }
    }

    private fun finalizeResult(finalText: String, totalProcMs: Long, audioDurationSec: Float) {
        val finalArrivalNs = SystemClock.elapsedRealtimeNanos()
        val finalLatency = if (stopRequestedTimeNs > 0L) {
            (finalArrivalNs - stopRequestedTimeNs) / 1_000_000
        } else {
            maxOf(totalProcMs, 150L)
        }

        currentTranscriptVersion++
        _finalTranscript.value = finalText

        // Compute RTF
        val procSec = totalProcMs / 1000f
        val rtf = if (audioDurationSec > 0.05f) procSec / audioDurationSec else 0.0f

        val stats = systemMonitor.pollStats()
        val updatedMetrics = _metrics.value.copy(
            audioDurationSec = audioDurationSec,
            finalLatencyMs = finalLatency,
            processingMs = totalProcMs,
            rtf = rtf,
            ramPeakMb = systemMonitor.getPeakRamMb(),
            ramAvgMb = systemMonitor.getAverageRamMb(),
            batteryPercent = stats.batteryPercent,
            batteryTemp = stats.batteryTempCelsius
        )
        _metrics.value = updatedMetrics

        // Normalize text & log suggestions
        val norm = MedicalTextNormalizer.process(finalText)
        _normalizedResult.value = norm
        Log.i(TAG, "Finalize result: raw='$finalText' -> norm='${norm.normalizedSuggestion}'")

        // Track tested sentence to avoid duplicates
        _selectedTestSentence.value?.id?.let { testedSentenceIds.add(it) }

        // Evaluate against reference if in test set mode using normalized suggestion for high accuracy
        val ref = _selectedTestSentence.value
        if (ref != null) {
            val eval = AccuracyEvaluator.evaluate(
                reference = ref.referenceText,
                hypothesis = norm.normalizedSuggestion.ifBlank { finalText },
                testSentence = ref
            )
            _evaluationReport.value = eval
        }

        recomputeSafetyGate()

        // Auto-save WAV if enabled (always enabled by default for benchmark reproducibility)
        if (_isSaveAudioEnabled.value && audioRecorderManager != null) {
            lastSavedAudioPath = saveCurrentAudioRecording()
        }

        // Automatically persist session to database & upload to PC server on stop
        saveCurrentTestSession()
        _statusMessage.value = "Đã lưu & đồng bộ về PC"

        // Tự động đồng bộ bản chốt cuối cùng sang RIS nếu ở Clinical Safe mode và bật auto-send
        if (_operatingMode.value == AppOperatingMode.CLINICAL_SAFE && _isLiveAutoSendEnabled.value) {
            val textToSend = norm.normalizedSuggestion.ifBlank { finalText }.trim()
            if (textToSend.isNotBlank() && textToSend != lastAutoSentText) {
                lastAutoSentText = textToSend
                exportToRis(textToSend, isLiveStream = false)
            }
        }
    }

    private val testHistoryStack = mutableListOf<MedicalTestSentence>()
    private val testedSentenceIds = mutableSetOf<String>()

    fun nextTestSentence() {
        val allSentences = if (_benchmarkTrack.value == BenchmarkTrack.ENGLISH_FRONTEND) {
            EnglishTestSet.SENTENCES
        } else {
            MedicalTestSet.SENTENCES
        }
        if (allSentences.isEmpty()) return
        val currentRef = _selectedTestSentence.value

        if (currentRef != null) {
            testHistoryStack.add(currentRef)
        }

        // Prevent duplicate sentences: sequentially select from unvisited sentences
        val currentIndex = allSentences.indexOfFirst { it.id == currentRef?.id }
        val unvisited = allSentences.filter { !testedSentenceIds.contains(it.id) && it.id != currentRef?.id }
        val next = if (unvisited.isNotEmpty()) {
            unvisited.firstOrNull { allSentences.indexOf(it) > currentIndex } ?: unvisited.first()
        } else {
            // All sentences in the track tested, wrap around sequentially
            val nextIndex = if (currentIndex >= 0) (currentIndex + 1) % allSentences.size else 0
            allSentences[nextIndex]
        }
        _selectedTestSentence.value = next

        if (!_captureState.value.isRecording) {
            resetTest()
        } else {
            _evaluationReport.value = null
        }
    }

    fun previousTestSentence() {
        if (testHistoryStack.isNotEmpty()) {
            val prev = testHistoryStack.removeAt(testHistoryStack.size - 1)
            _selectedTestSentence.value = prev
            if (!_captureState.value.isRecording) {
                resetTest()
            } else {
                _evaluationReport.value = null
            }
        }
    }

    private fun saveCurrentAudioRecording(): String? {
        return try {
            val pcm = audioRecorderManager?.getRecordedPcm() ?: return null
            if (pcm.isEmpty()) return null

            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val testId = _selectedTestSentence.value?.id ?: "CLINICAL"
            val baseDir = getApplication<Application>().getExternalFilesDir(android.os.Environment.DIRECTORY_RECORDINGS)
                ?: File(getApplication<Application>().filesDir, "benchmark_audio")
            val audioDir = File(baseDir, "autoris_recordings")
            if (!audioDir.exists()) audioDir.mkdirs()

            val wavFile = File(audioDir, "${testId}_${timeStamp}.wav")
            WavWriter.writeWavFile(wavFile, pcm, 16000)
            Log.i(TAG, "Audio recording saved for offline verification: ${wavFile.absolutePath} (${pcm.size} samples)")
            wavFile.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save audio recording", e)
            null
        }
    }

    fun saveCurrentTestSession() {
        val raw = _finalTranscript.value.ifEmpty { _livePartial.value }
        if (raw.isBlank()) return

        val m = _metrics.value
        val norm = _normalizedResult.value
        val cleaned = (norm?.normalizedSuggestion ?: raw).trim().trimEnd('.', '?', '!', ',')
        // Ignore ghost recordings with only filler words or under 0.4s duration
        if (cleaned.isBlank() || m.audioDurationSec < 0.4f) {
            Log.w(TAG, "Skipping saving ghost recording session: duration=${m.audioDurationSec}s text='$raw'")
            return
        }

        val ref = _selectedTestSentence.value
        val eval = _evaluationReport.value
        val audioToSave = lastSavedAudioPath
        val policyDecision = audioRecorderManager?.latestPolicyDecision

        val session = BenchmarkSession(
            timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date()),
            device = SystemMonitor.getDeviceModel(),
            deviceModel = SystemMonitor.getDeviceModel(),
            androidVersion = android.os.Build.VERSION.RELEASE ?: "Unknown",
            cpuInfo = "Snapdragon 8 Gen 3",
            model = asrEngine.name,
            modelName = asrEngine.name,
            modelVersion = "1.0.0",
            numThreads = 4,
            testId = ref?.id,
            category = ref?.category,
            roomId = _roomId.value,
            roomType = _roomType.value,
            noiseType = _noiseType.value,
            noiseLevel = _noiseLevel.value,
            speakerDistanceCm = _speakerDistanceCm.value,
            micOrientationDeg = _micOrientationDeg.value,
            preprocessingProfile = _preprocessingProfile.value,
            actualPreprocessingProfile = policyDecision?.activeProfile?.id ?: _preprocessingProfile.value,
            policyRecommendedProfile = policyDecision?.recommendedProfile?.id,
            policyConfidence = policyDecision?.confidence,
            policyOverride = policyDecision?.isOverride ?: false,
            audioDurationSec = m.audioDurationSec,
            audioDurationMs = (m.audioDurationSec * 1000).toLong(),
            sampleRate = 16000,
            channels = 1,
            vadSegmentCount = m.vadSegmentCount,
            vadTotalSpeechMs = m.vadTotalSpeechMs,
            speakerLockEnabled = _speakerLockEnabled.value,
            speakerConfidence = _voiceLockConfidence.value,
            speakerRejection = _voiceLockState.value == VoiceLockState.REJECT,
            firstSegmentResultLatencyMs = if (m.firstSegmentResultLatencyMs > 0) m.firstSegmentResultLatencyMs else m.firstPartialMs,
            truePartialLatencyMs = m.truePartialLatencyMs,
            firstPartialMs = m.firstPartialMs,
            finalLatencyMs = m.finalLatencyMs,
            processingMs = m.processingMs,
            rtf = if (m.audioDurationSec > 0.05f) (m.processingMs.toFloat() / (m.audioDurationSec * 1000f)) else m.rtf,
            ramPeakMb = m.ramPeakMb,
            ramAvgMb = m.ramAvgMb,
            batteryPercent = m.batteryPercent,
            batteryTemp = m.batteryTemp,
            batteryTemperatureC = m.batteryTemp,
            rawTranscript = raw,
            normalizedTranscript = norm?.normalizedSuggestion ?: raw,
            referenceText = ref?.referenceText,
            reference = ref?.referenceText,
            werRaw = null,
            cerRaw = null,
            werNormalized = eval?.wer,
            cerNormalized = eval?.cer,
            cer = eval?.cer,
            wer = eval?.wer,
            medicalTermAccuracy = eval?.medicalTermAccuracy,
            numericAccuracy = eval?.numericAccuracy,
            measurementAccuracy = eval?.measurementAccuracy,
            anatomyAccuracy = eval?.anatomyAccuracy,
            lateralityAccuracy = eval?.lateralityAccuracy,
            negationAccuracy = eval?.negationAccuracy,
            spineLevelAccuracy = eval?.spineLevelAccuracy,
            criticalNumericError = eval?.criticalNumericError ?: false,
            criticalMeasurementError = eval?.criticalMeasurementError ?: false,
            criticalNegationError = eval?.criticalNegationError ?: false,
            criticalLateralityError = eval?.criticalLateralityError ?: false,
            criticalSpineError = eval?.criticalSpineError ?: false,
            audioPath = audioToSave
        )

        viewModelScope.launch(Dispatchers.IO) {
            val insertedId = db.insert(session)
            loadHistory()
            withContext(Dispatchers.Main) {
                _statusMessage.value = "Đã lưu kết quả test vào cơ sở dữ liệu"
            }

            // Auto-sync to local PC server if enabled
            if (_isAutoSyncEnabled.value) {
                val toUpload = session.copy(id = insertedId)
                BenchmarkSyncClient.uploadSessions(_serverUrl.value, listOf(toUpload))
                if (!audioToSave.isNullOrBlank()) {
                    val audioFile = File(audioToSave)
                    if (audioFile.exists()) {
                        BenchmarkSyncClient.uploadAudio(_serverUrl.value, insertedId, audioFile)
                    }
                }
            }
        }
    }

    fun setServerUrl(url: String) {
        _serverUrl.value = url.trim()
        prefs.edit().putString("server_url", url.trim()).apply()
    }

    fun setAutoSyncEnabled(enabled: Boolean) {
        _isAutoSyncEnabled.value = enabled
        prefs.edit().putBoolean("auto_sync_server", enabled).apply()
    }

    fun testServerConnection(onResult: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            val res = BenchmarkSyncClient.checkServer(_serverUrl.value)
            res.fold(
                onSuccess = { msg ->
                    _serverStatus.value = "Online"
                    withContext(Dispatchers.Main) {
                        onResult(true, "Kết nối server PC thành công!")
                    }
                },
                onFailure = { err ->
                    _serverStatus.value = "Offline"
                    withContext(Dispatchers.Main) {
                        onResult(false, "Không thể kết nối server: ${err.message}")
                    }
                }
            )
        }
    }

    fun syncAllHistoryToServer(onComplete: (Boolean, String) -> Unit) {
        val list = _historySessions.value
        if (list.isEmpty()) {
            onComplete(false, "Chưa có lượt test nào trong lịch sử để gửi")
            return
        }

        viewModelScope.launch {
            _isSyncing.value = true
            val uploadRes = BenchmarkSyncClient.uploadSessions(_serverUrl.value, list)
            uploadRes.fold(
                onSuccess = { count ->
                    var audioCount = 0
                    for (session in list) {
                        val path = session.audioPath
                        if (!path.isNullOrBlank()) {
                            val audioFile = File(path)
                            if (audioFile.exists()) {
                                val audioRes = BenchmarkSyncClient.uploadAudio(_serverUrl.value, session.id, audioFile)
                                if (audioRes.isSuccess) audioCount++
                            }
                        }
                    }
                    _isSyncing.value = false
                    val msg = if (audioCount > 0) {
                        "Đã chuyển thành công $count lượt test & $audioCount file audio về PC!"
                    } else {
                        "Đã chuyển thành công $count lượt test về PC!"
                    }
                    withContext(Dispatchers.Main) {
                        _statusMessage.value = msg
                        onComplete(true, msg)
                    }
                },
                onFailure = { err ->
                    _isSyncing.value = false
                    val msg = "Lỗi gửi về PC: ${err.message}"
                    withContext(Dispatchers.Main) {
                        _statusMessage.value = msg
                        onComplete(false, msg)
                    }
                }
            )
        }
    }

    fun resetTest() {
        audioRecorderManager?.stopRecording()
        currentTranscriptVersion++
        _livePartial.value = ""
        _finalTranscript.value = ""
        _normalizedResult.value = null
        _evaluationReport.value = null
        invalidateSafetyDecision("Test reset")
        _metrics.value = UiBenchmarkMetrics()
        _statusMessage.value = "Sẵn sàng"
    }

    fun loadHistory() {
        viewModelScope.launch(Dispatchers.IO) {
            val list = db.getAll()
            _historySessions.value = list
        }
    }

    fun deleteAllHistory() {
        viewModelScope.launch(Dispatchers.IO) {
            db.deleteAll()
            loadHistory()
            withContext(Dispatchers.Main) {
                _statusMessage.value = "Đã xóa toàn bộ dữ liệu benchmark"
            }
        }
    }

    fun exportHistory(asJson: Boolean): File? {
        val list = _historySessions.value
        if (list.isEmpty()) return null

        val exportDir = File(getApplication<Application>().getExternalFilesDir(null), "exports")
        if (!exportDir.exists()) exportDir.mkdirs()

        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        return if (asJson) {
            val file = File(exportDir, "asr_benchmark_${timeStamp}.json")
            BenchmarkExporter.exportToJson(list, file)
            file
        } else {
            val file = File(exportDir, "asr_benchmark_${timeStamp}.csv")
            BenchmarkExporter.exportToCsv(list, file)
            file
        }
    }

    override fun onCleared() {
        super.onCleared()
        audioRecorderManager?.release()
        statsJob?.cancel()
    }
}
