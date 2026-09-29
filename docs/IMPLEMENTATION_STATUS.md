# AutoRIS: Comprehensive Implementation & Architecture Audit (Phase 0)

Audit Date: 2026-09-29  
Target Platform: Android (Snapdragon 8 Gen 3 / Samsung Galaxy S24 Ultra & OnePlus Ace 5)  
Primary Reference Model: `hynt/ZipFormer-150M-CR-CTC-RNNT-6000h` (4 CPU threads, Sherpa-ONNX, strictly local)

---

## 1. Executive Component Status Matrix

| Component | Documented | Implemented | Runtime Connected | Real Inference / Real Logic | Tested | Audit Finding & Action Required |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Sherpa-ONNX ZipFormer 150M Offline** | Yes | Yes | **Yes** | **Yes** | **Yes** | Fully operational on-device local ASR (tested on real devices across 23 live sessions). |
| **Sherpa-ONNX ZipFormer 30M Streaming** | Yes | Yes | **Yes** | **Yes** | **Yes** | Functional streaming engine, but currently standalone; not yet cascaded with 150M for real-time partial + offline final. |
| **AudioCapture** | Yes | Yes | **Yes** | **Yes** | **Yes** | AudioRecord wrapper with thread-safe lifecycle and hardware effect attachment. |
| **AndroidHardwareEffectDetector** | Yes | Yes | **Yes** | **Yes** | **Yes** | Queries Android `AudioEffect` API for `NoiseSuppressor`, `AGC`, `AEC`. |
| **AudioPreprocessor (Factory & Passthrough)** | Yes | Yes | **Yes** | **Yes** | **Yes** | Factory instantiates preprocessors per profile; handles raw audio. |
| **DPDFNet Audio Denoiser** | Yes | **Stub** | Yes (Wired) | **NO (Clamping Mock)** | **Partial (Mock)** | `process()` only clamps samples to [-1.0, 1.0]. No ONNX session is loaded. Requires integration with `sherpa-onnx`'s `OfflineSpeechDenoiser` with real DPDFNet/GTCRN model support and strict `UNAVAILABLE` fallback status. |
| **AdaptiveNoiseTracker** | Yes | Yes | **Partial** | **Partial** | **Yes** | Percentile energy window works, but updates on **every** frame (including speech), contaminating the noise floor. `calibrateNoiseFloor()` in ViewModel mocked `typicalFloorDb` instead of capturing real mic audio. |
| **NeuralVadEngine** | Yes | **Stub** | **NO** | **NO (RMS Mock)** | **Partial (Mock)** | `inferFrame()` only calculates RMS `(rms * 15.0f)` instead of running Silero ONNX. `AudioRecorderManager` never instantiates or calls `NeuralVadEngine`. |
| **VoiceLock (Speaker Gate)** | Yes | **Legacy** | **NO** | **NO (Energy Heuristic)** | **Partial (Unit)** | Uses a 64-dim energy/formant heuristic. Contains a **critical fail-open bug** (`!isEnrolled` returns `ACCEPT`). Never called in `AudioRecorderManager` runtime. Must be replaced with `SpeakerVerifier` interface and fail-closed architecture. |
| **MedicalTextNormalizer & Parsers** | Yes | Yes | **Yes** | **Yes** | **Yes** | 8 modular parsers running in runtime. Needs refinement for explicit vs inferred vs ambiguous distinctions, and negation/laterality semantic scopes. |
| **AccuracyEvaluator** | Yes | Yes | **Yes** | **Partial** | **Yes** | Computes CER/WER and critical error flags, but uses loose string matching (`.contains()`) for numeric verification (e.g. `21` matches `121`). Must use strict structured entity parsing. |
| **NoisePolicyEngine** | Yes | Yes | **NO (Orphaned)** | **Yes (Rule logic)** | **Yes** | Class exists and passes unit tests, but is **never instantiated or called** in `MainViewModel` or `AudioRecorderManager`. |
| **SafetyGate** | Yes | **Flawed** | **NO (Orphaned)** | **Flawed (Fail-Open)** | **Partial** | Never called in `MainViewModel`. Critically **fails open** when `report == null` (returns `SAFE_TO_AUTOFILL`). Uses benchmark CER (< 3%) which does not exist in production mode without reference text. Must be split into `evaluateBenchmark()` and `evaluateProduction()` with fail-closed `SafetyEvidence`. |
| **English Frontend Benchmark** | Yes | **Synthetic** | **Track UI only** | **NO (Synthetic Harmonics)** | **Yes (Synth)** | Generates sine wave harmonics in unit tests. No real English audio recordings on disk. |
| **Offline Noise Analysis (`analyze_noise_benchmark.py`)** | Yes | Yes | **CLI Standalone** | **Mixed** | **Yes** | Works with real device sessions, but previously generated synthetic data with hardcoded expected CER/RTF. Must enforce strictly measured metrics. |

---

## 2. Identified Blocker Issues (P0 Root Causes)

1. **SafetyGate Fail-Open Flaw:**
   - In `SafetyGate.kt`, calling `evaluate(report = null)` falls through all checks, sets `cer = 0.0f`, and grants `SAFE_TO_AUTOFILL`.
   - Production mode has no ground-truth reference text, meaning `EvaluationReport` cannot exist in production. Relying on `cer < 0.03` is invalid for production safety.
   - Missing required evidence (speaker verification, confidence, acoustic SNR) must evaluate to `REJECTED` or `REVIEW_REQUIRED`, never `SAFE`.

2. **VoiceLock Fail-Open & Orphaned State:**
   - In `VoiceLock.kt`, `if (!isEnrolled) return ACCEPT` causes un-enrolled instances with speaker lock enabled to accept all voices.
   - `VoiceLock` is never invoked in `AudioRecorderManager` when processing speech chunks.
   - VoiceLock uses a simple 64-band energy/variance heuristic rather than a true speaker embedding model.

3. **Orphaned Runtime Architecture:**
   - `NoisePolicyEngine` is tested in JVM unit tests, but `MainViewModel` never invokes it to automatically adjust or recommend profiles between utterances.
   - `NeuralVadEngine` is tested in JVM unit tests, but `AudioRecorderManager` only uses energy thresholding `isSpeechEnergy = db >= speechThresholdDb`.

4. **Fake/Clamping DPDFNet:**
   - `DpdfNetAudioPreprocessor.process()` merely clamps float samples to `[-1.0, 1.0]`. When no ONNX model is present, it claims to be loaded if a dummy file exists or silently passes through while reporting profile as DPDFNet.
   - Real inference requires native ONNX Runtime or Sherpa-ONNX `OfflineSpeechDenoiser` / `OnlineSpeechDenoiser` bindings.

5. **Noise Floor Speech Contamination:**
   - `AdaptiveNoiseTracker.update(db)` is called for every 100ms chunk without checking VAD speech state. During continuous speech, doctor speech energy elevates the noise floor estimator.
   - `calibrateNoiseFloor()` in `MainViewModel` sleeps 1s and sets `noiseFloorDb = selectedScenario.typicalFloorDb` rather than capturing live microphone PCM chunks.

6. **Numeric Token Containment Bug in AccuracyEvaluator:**
   - In `AccuracyEvaluator.kt`, `cleanHyp.contains(cleanNum)` matches substrings (e.g. `21` matches inside `121` or `210`). Must match exact token boundaries and structured entities.

---

## 3. Production Hardening Roadmap (Phases 1 - 22)

- **Phase 1:** Refactor `SafetyGate` to fail-closed, separate `evaluateBenchmark` and `evaluateProduction`, introduce `SafetyEvidence` model (`VALID`, `INVALID`, `UNKNOWN`).
- **Phase 2:** Implement `SpeakerVerifier` interface, fail-closed `VoiceLock` architecture, multi-utterance enrollment, and wire verification into speech segment processing.
- **Phase 3:** Real `DpdfNetAudioPreprocessor` leveraging Sherpa-ONNX `OfflineSpeechDenoiser` with strict `UNAVAILABLE` status when models are missing (zero fake passthrough).
- **Phase 4:** Real `NeuralVadEngine` with true ONNX frame processing, stateful hidden memory, and deterministic endpoint state machine.
- **Phase 5:** Connect `AdaptiveNoiseTracker` to update only on non-speech frames; connect `NoisePolicyEngine` to frozen per-utterance recommendations; live mic calibration.
- **Phase 6:** Clean Audio Pipeline Architecture: `AudioCapture -> HardwareEffects -> AudioPreprocessor -> NoiseTracker -> NeuralVAD -> SpeakerVerifier -> ASR`.
- **Phase 7:** Medical Normalizer V2: 10+ parsers, strict `EXPLICIT`, `INFERRED`, `AMBIGUOUS` provenance, and semantic scope for negations and laterality.
- **Phase 8:** Structured Clinical Evaluator without `.contains()` substring matching.
- **Phase 9 - 10:** Production Safety Gate & Clinical vs Benchmark mode separation in UI/ViewModel.
- **Phase 11 - 13:** Real multi-room benchmark execution & true data analysis.
- **Phase 14 - 17:** Dual-engine latency architecture (Streaming 30M partial + Offline 150M final), endpoint tuning, memory/CPU benchmarking, and decoder verification.
- **Phase 18 - 22:** Mandatory test matrix, regression validation, documentation synchronization, and atomic git commits.
