# AutoRIS: Implementation & Architecture Hardening Status

**Status Date:** 2026-09-29  
**Target Platform:** Android (Snapdragon 8 Gen 3 / Samsung Galaxy S24 Ultra & OnePlus Ace 5)  
**Primary Reference Model:** `hynt/ZipFormer-150M-CR-CTC-RNNT-6000h` (4 CPU threads, Sherpa-ONNX, strictly on-device)  
**Streaming Frontend Model:** `hynt/ZipFormer-30M-RNNT` (Sherpa-ONNX streaming)  
**Status:** **Candidate Architecture for Clinical Evaluation (Runtime Hardened, On-Device)**  

---

> [!IMPORTANT]
> **Clinical Disclaimer & Device Notice:**  
> AutoRIS is an investigational on-device ASR system engineered for Vietnamese diagnostic radiology dictation. While the codebase has undergone strict software verification (114 passing unit tests, fail-closed safety gating, and algorithmic provenance verification), it has **not yet completed formal multi-center clinical trials in operational hospital radiology departments**.  
> In accordance with medical software safety practices, AutoRIS does **not** claim "100% clinical-safe", "0% real-world error", or "0% FAR" under unconstrained clinical acoustic conditions. **Every dictation requires mandatory visual review and confirmation by a qualified radiologist before RIS/PACS submission.**

---

## 1. Executive Component Status Matrix

| Component | Documented | Implemented | Runtime Connected | Real Inference / Real Logic | Unit Tested | Architectural Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Sherpa-ONNX ZipFormer 150M Offline** | Yes | Yes | **Yes** | **Yes** | **Yes** | **OPERATIONAL**: Primary reference model for final sentence transcription upon pause confirmation. |
| **Sherpa-ONNX ZipFormer 30M Streaming** | Yes | Yes | **Yes** | **Yes** | **Yes** | **OPERATIONAL**: Low-latency streaming frontend providing immediate word-by-word visual feedback. |
| **Dual-Engine Consistency Checker** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: Bidirectional semantic verification of numbers, dimensions, spine levels, lateralities, and negations between 30M and 150M. Discrepancies fail-closed. |
| **AudioCapture (16kHz PCM)** | Yes | Yes | **Yes** | **Yes** | **Yes** | **OPERATIONAL**: Thread-safe 16kHz PCM AudioRecord with dynamic hardware effect attachment. |
| **Android Hardware Effect Detector** | Yes | Yes | **Yes** | **Yes** | **Yes** | **OPERATIONAL**: Real-time detection and binding of platform `NoiseSuppressor`, `AGC`, `AEC`. |
| **DPDFNet Audio Denoiser** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: Bound to native `OfflineSpeechDenoiser`. Strictly reports `UNAVAILABLE` and hash/file integrity errors when model files are missing or corrupted. |
| **AdaptiveNoiseTracker** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: Noise floor tracking window strictly freezes during speech chunks (`isSpeech = true`). Real live mic calibration enabled. |
| **Neural VAD & State Machine** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: Neural Silero VAD holds primary authority over acoustic energy. Energy cannot trigger speech when neural probability < 0.35f, eliminating hospital acoustic burst artifacts. |
| **VoiceLock (Speaker Gate)** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: `SpeakerVerifier` interface with 64-dim spectral autocorrelation fingerprinting. Fail-closed on missing enrollment or uncertain matches. |
| **MedicalTextNormalizer V2** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: Modular pipeline with 3-tier certainty (`EXPLICIT`, `INFERRED`, `AMBIGUOUS`). Ambiguities require physician review. |
| **AccuracyEvaluator** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: Replaces 3D matches before 2D regex runs (preventing phantom overlap bugs). Sequential target-bound laterality alignment. |
| **NoisePolicyEngine** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: 3-chunk hysteresis rule logic evaluated at phrase boundaries; records policy recommendations and override telemetry. |
| **SafetyGate (Production & Benchmark)** | Yes | Yes | **Yes** | **Yes** | **Yes** | **HARDENED**: Fail-closed gate. Invalidation on 11 state-changing methods. Token versions (`transcriptVersion`, `speakerEnrollmentVersion`) strictly bound to export. |
| **UI Mode Separation** | Yes | Yes | **Yes** | **Yes** | **Yes** | **OPERATIONAL**: Strict separation between `CLINICAL_SAFE` (production) and `BENCHMARK` modes with Safety Decision Badge. |

---

## 2. Hardening Audit Verification (Phases A – E)

### Phase A: P0 Clinical Safety Enforcement
- **Fail-Closed `exportToRis()`:** Method strictly verifies `decision.status == SafetyGateStatus.SAFE_TO_AUTOFILL && decision.autofillAllowed == true`. Blocks submission if status is `REVIEW_REQUIRED`, `REJECTED`, or `UNKNOWN`.
- **State Mutation Invalidation:** All 11 state-changing methods in `MainViewModel` (model selection, scenario switch, profile update, mic calibration, voice lock toggle, enrollment updates, etc.) immediately invalidate cached decisions.
- **Version Token Binding:** Binds `transcriptVersion` and `speakerEnrollmentVersion` to safety evaluations. `exportToRis()` rejects submission if text or enrollment tokens have changed since evaluation.
- **Provenance-Gated Entities:** `CriticalEntityValidator` maps entity certainties to evidence statuses:
  - `CertaintyLevel.EXPLICIT` $\rightarrow$ `EvidenceStatus.VALID`
  - `CertaintyLevel.INFERRED` $\rightarrow$ `REVIEW_REQUIRED` (requires clinician check)
  - `CertaintyLevel.AMBIGUOUS` $\rightarrow$ `SafetyGateStatus.REJECTED`
  - Missing validator execution or unknown confidence $\rightarrow$ fail-closed to `REJECTED`.

### Phase B: P1 Audio Runtime Correctness
- **Neural VAD Primary Authority:** Fixed `EndpointStateMachine` so acoustic energy alone cannot trigger speech when neural probability < 0.35f, eliminating phantom speech triggers from hospital acoustic impulses (MRI gradient pulses, door slams, keyboard clatter).
- **DPDFNet Integrity Verification:** Model manager verifies file size, presence, and SHA-256 hash before declaring denoiser readiness. Clean `UNAVAILABLE` fallback when weights are absent.
- **Noise Policy Telemetry:** Plumbed `actualPreprocessingProfile`, `policyRecommendedProfile`, `policyConfidence`, and `policyOverride` through `AudioRecorderManager` into persistent `BenchmarkSession` records.

### Phase C: True Metrics & Processing Time Plumbing
- **RTF Calculation Fix:** `AudioRecorderManager.getTotalProcessingMs()` plumbed directly into `finalizeResult()`, eliminating historical 0.0s processing time and 0.0 RTF artifacts.
- **Latency Split Telemetry:** Disentangled `firstPartialMs` (streaming arrival), `firstSegmentResultLatencyMs` (first decoded phrase), and `finalLatencyMs` (stop request to final text).

### Phase D: Normalizer Exactness & Zero-Overlap
- **3D vs 2D Dimension Bug Fixed:** `AccuracyEvaluator.extractDimensions()` replaces 3D matches (`21 × 8 × 10 mm`) with a placeholder before evaluating 2D regex, preventing phantom `8 × 10 mm` duplicate extractions.
- **Target-Bound Laterality Alignment:** `LateralityParser` and `AccuracyEvaluator` bind lateralities (`phải`, `trái`, `hai bên`) to base anatomical organs (`thận`, `phổi`, `gan`, `rễ`) and evaluate sequential positions, detecting organ-swapped laterality errors.

### Phase E: Cross-Engine 30M vs 150M Consistency Checker
- **Semantic Cross-Validation:** `CrossEngineConsistencyChecker` inspects measurements, dimensions, spine levels, lateralities, and clinical negations across 30M streaming and 150M offline hypotheses.
- **Safety Gate Integration:** If streaming and offline engines disagree on a critical entity (e.g. 15 mm vs 21 mm, L4-L5 vs L5-S1, or presence vs absence of a negation trigger), `criticalEntitiesStatus` is marked `INVALID`, triggering immediate `SafetyGateStatus.REJECTED`.

---

## 3. Hospital Acoustic Scenarios & Hardware Targets

### Multi-Room Test Matrix (6 Clinical Environments)
1. **Phòng đọc CĐHA chuẩn (Reading Room):** Low ambient noise (38–45 dB), keyboard/mouse clatter, HVAC background.
2. **Bàn điều khiển CT (CT Console):** Moderate noise (50–58 dB), computer cooling fans, technologist communication.
3. **Bàn điều khiển MRI (MRI Console):** Heavy acoustic noise (58–68 dB), helium chiller pumps, gradient pulse penetration.
4. **Phòng Siêu âm (Ultrasound Room):** Low-to-moderate noise (42–50 dB), gel transducer movements, patient dialogue.
5. **Phòng Can thiệp DSA (Angiography / Cath Lab):** Moderate noise (52–62 dB), C-arm motor movement, lead glass acoustic reflections.
6. **Khoa Cấp cứu / Hồi sức (Emergency ER / ICU):** Loud, chaotic noise (62–72 dB), monitor alarms, rapid cross-talk.

### Hardware Targets
- **Primary Reference Device:** Samsung Galaxy S24 Ultra (Snapdragon 8 Gen 3, 12GB LPDDR5X, Android 14/15, 4 CPU threads).
- **Secondary Reference Device:** OnePlus Ace 5 (Snapdragon 8 Gen 3, 16GB LPDDR5X, ColorOS / Android 15).
- **Execution Constraints:** 100% on-device, strictly local Sherpa-ONNX inference, zero cloud speech APIs, zero audio transmission outside device memory.

---

## 4. Current Limitations & Pre-Deployment Prerequisites

1. **Acoustic Diversity in Clinical Practice:** While unit tests cover synthetic acoustic bursts and modeled profiles, actual hospital ambient acoustics vary with room geometry, clinician distance, and mask usage. Physical calibration on target devices remains essential.
2. **Biometric Speaker Enrollment:** VoiceLock uses 64-dimensional spectral autocorrelation. While highly effective at rejecting cross-talk when enrolled, ambient reverberation in large DSA suites may require re-enrollment in that specific acoustic environment.
3. **Mandatory Clinician Sign-Off:** AutoRIS is designed as a transcription assistant with clinical safety verification gates, not an autonomous diagnostic agent. All reports generated must be verified by the reporting radiologist.

---

## 5. Verification & Test Suite Summary

- **Total Unit Tests Executed:** 114
- **Total Unit Tests Passed:** 114 (100% pass rate)
- **Key Test Suites:**
  - `SafetyGateTest`: 19 tests (fail-closed, token invalidation, provenance gating)
  - `CrossEngineConsistencyCheckerTest`: 7 tests (numeric, dimension, spine, laterality, negation)
  - `AccuracyEvaluatorTest`: 16 tests (WER, CER, 3D non-overlap, target-bound laterality)
  - `VadEngineTest`: 8 tests (neural probability gating, energy burst rejection)
  - `MedicalNormalizerTest`: 12 tests (3-tier certainty, scores, negations, lateralities)
  - `SpeakerVerifierTest` & `VoiceLockTest`: 15 tests (spectral embedding, enrollment, rejection)
  - `BenchmarkMetricsTest`: 5 tests (RTF plumbing, split latencies, telemetry)
  - `NoisePolicyEngineTest` & `AdaptiveNoiseTrackerTest`: 12 tests (hysteresis, speech freezing)
