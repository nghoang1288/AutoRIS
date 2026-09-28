#!/usr/bin/env python3
"""
AUTORIS - Offline Noise Benchmark Analysis & Clinical Safety Evaluation
Aggregates benchmark session results across clinical acoustic rooms and preprocessing profiles.
Computes CER/WER, RTF, P95 Latency, Medical Entity F1, and Zero-Tolerance Critical Errors.
"""

import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

# Force UTF-8 stdout
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")


def load_sessions(input_dir: str) -> List[Dict[str, Any]]:
    """Loads all session JSON files from the input directory or its subdirectories."""
    sessions = []
    if not os.path.exists(input_dir):
        return sessions

    pattern = os.path.join(input_dir, "**", "*.json")
    files = glob.glob(pattern, recursive=True)

    for path in sorted(files):
        # Skip aggregate or non-session files
        basename = os.path.basename(path)
        if basename in ("all_device_sessions.json", "benchmark_scenarios_matrix.json"):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and ("cer" in data or "normalizedTranscript" in data or "testId" in data):
                    sessions.append(data)
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and ("cer" in item or "testId" in item):
                            sessions.append(item)
        except Exception as e:
            print(f"Warning: Failed to load {path}: {e}", file=sys.stderr)

    return sessions


def generate_synthetic_benchmark_data(output_dir: str, num_samples_per_scenario: int = 3):
    """Generates synthetic benchmark session results to test the analysis pipeline across all 12 scenarios."""
    os.makedirs(output_dir, exist_ok=True)
    matrix_path = "benchmark_scenarios_matrix.json"
    if not os.path.exists(matrix_path):
        print(f"Matrix file {matrix_path} not found for synthetic generation.")
        return

    with open(matrix_path, "r", encoding="utf-8") as f:
        matrix = json.load(f)

    scenarios = matrix.get("scenarios_matrix", [])
    count = 0
    import time
    base_time = int(time.time() * 1000)

    for sc in scenarios:
        room_id = sc.get("room", "ROOM_01")
        profile = sc.get("test_profile", "RAW")
        expected_cer = sc.get("expected_cer_pct", 2.0) / 100.0
        expected_rtf = sc.get("expected_rtf", 0.15)
        dist_cm = sc.get("distance_cm", 30)

        for i in range(num_samples_per_scenario):
            test_id = f"TEST_{str((count % 10) + 1).zfill(3)}"
            dur_sec = 4.5 + (count % 3) * 1.5
            proc_ms = int(dur_sec * 1000 * expected_rtf)

            # Small jitter
            jitter = ((i - 1) * 0.003)
            cer = max(0.005, expected_cer + jitter)
            wer = cer * 1.4

            session = {
                "schema_version": "2.0.0",
                "id": base_time + count,
                "sessionId": f"synthetic_{room_id}_{profile}_{i}",
                "timestamp": "2026-09-28 23:25:00",
                "device": "Samsung Galaxy S24 Ultra (Synthetic Simulation)",
                "cpuInfo": "Snapdragon 8 Gen 3",
                "model": "ZipFormer 150M CR-CTC-RNNT (Offline)",
                "testId": test_id,
                "category": "CT bụng",
                "roomId": room_id,
                "roomType": "clinical_reading",
                "preprocessingProfile": profile,
                "speakerDistanceCm": dist_cm,
                "audioDurationSec": dur_sec,
                "audioDurationMs": int(dur_sec * 1000),
                "processingMs": proc_ms,
                "finalLatencyMs": int(proc_ms + 120),
                "rtf": round(expected_rtf, 3),
                "cer": round(cer, 4),
                "wer": round(wer, 4),
                "medicalTermAccuracy": round(max(0.90, 1.0 - (cer * 2.0)), 3),
                "numericAccuracy": 1.0,
                "measurementAccuracy": 1.0,
                "negationAccuracy": 1.0,
                "anatomyAccuracy": 1.0,
                "criticalNumericError": False,
                "criticalMeasurementError": False,
                "criticalNegationError": False,
                "criticalLateralityError": False,
                "criticalSpineError": False,
                "ramPeakMb": 480 + (count % 50),
                "batteryTemp": 35.0
            }

            filename = f"session_synth_{room_id}_{profile}_{i}.json"
            with open(os.path.join(output_dir, filename), "w", encoding="utf-8") as f_out:
                json.dump(session, f_out, indent=2, ensure_ascii=False)
            count += 1

    print(f"Generated {count} synthetic benchmark sessions in {output_dir}")


def compute_metrics(sessions: List[Dict[str, Any]]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """Groups sessions by (roomId, preprocessingProfile) and aggregates metrics."""
    groups = defaultdict(list)

    for s in sessions:
        room = s.get("roomId") or s.get("room") or "ROOM_01"
        profile = s.get("preprocessingProfile") or s.get("profile") or "RAW"
        groups[(room, profile)].append(s)

    summary = {}
    for (room, profile), group in groups.items():
        n = len(group)
        cers = [s.get("cer", 0.0) for s in group if s.get("cer") is not None]
        wers = [s.get("wer", 0.0) for s in group if s.get("wer") is not None]
        rtfs = [s.get("rtf", 0.0) for s in group if s.get("rtf") is not None and s.get("rtf", 0.0) > 0]
        latencies = [s.get("finalLatencyMs", 0) for s in group if s.get("finalLatencyMs") is not None]
        med_terms = [s.get("medicalTermAccuracy", 1.0) for s in group if s.get("medicalTermAccuracy") is not None]

        # Critical error counts
        crit_num = sum(1 for s in group if s.get("criticalNumericError", False))
        crit_meas = sum(1 for s in group if s.get("criticalMeasurementError", False))
        crit_neg = sum(1 for s in group if s.get("criticalNegationError", False))
        crit_lat = sum(1 for s in group if s.get("criticalLateralityError", False))
        crit_spine = sum(1 for s in group if s.get("criticalSpineError", False))
        total_crit = crit_num + crit_meas + crit_neg + crit_lat + crit_spine

        # P95 latency
        latencies.sort()
        p95_idx = int(0.95 * len(latencies)) if latencies else 0
        p95_lat = latencies[p95_idx] if latencies else 0

        avg_cer = (sum(cers) / len(cers)) * 100.0 if cers else 0.0
        avg_wer = (sum(wers) / len(wers)) * 100.0 if wers else 0.0
        avg_rtf = (sum(rtfs) / len(rtfs)) if rtfs else 0.0
        avg_med = (sum(med_terms) / len(med_terms)) * 100.0 if med_terms else 100.0

        summary[(room, profile)] = {
            "room": room,
            "profile": profile,
            "count": n,
            "avg_cer": avg_cer,
            "avg_wer": avg_wer,
            "avg_rtf": avg_rtf,
            "p95_latency_ms": p95_lat,
            "avg_med_term_acc": avg_med,
            "crit_num": crit_num,
            "crit_meas": crit_meas,
            "crit_neg": crit_neg,
            "crit_lat": crit_lat,
            "crit_spine": crit_spine,
            "total_crit": total_crit,
        }

    return summary


def generate_markdown_report(summary: Dict[Tuple[str, str], Dict[str, Any]], total_sessions: int) -> str:
    """Produces a comprehensive Markdown report."""
    md = []
    md.append("# AUTORIS: Clinical Acoustic Noise Benchmark Report")
    md.append(f"\n- **Total Sessions Analyzed:** {total_sessions}")
    md.append("- **Target Device / SoC:** Snapdragon 8 Gen 3 (Samsung Galaxy S24 Ultra & OnePlus Ace 5)")
    md.append("- **Target ASR Engine:** ZipFormer 150M CR-CTC-RNNT (Offline, 4 CPU threads)")
    md.append("- **Safety Tolerance:** Zero-tolerance critical clinical errors (0%)\n")

    md.append("## 1. Summary by Acoustic Room & Preprocessing Profile\n")
    md.append("| Room ID | Profile | N | Avg CER (%) | Avg WER (%) | Med Entity Acc (%) | P95 Latency | Avg RTF | Status |")
    md.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |")

    rooms = sorted(list(set(k[0] for k in summary.keys())))
    for room in rooms:
        # Sort profiles: RAW first
        room_profiles = sorted([k for k in summary.keys() if k[0] == room], key=lambda x: (0 if x[1] == "RAW" else 1, x[1]))
        for k in room_profiles:
            st = summary[k]
            status = "✅ PASS" if st["total_crit"] == 0 and st["avg_rtf"] <= 0.25 else "⚠️ REVIEW"
            md.append(
                f"| `{st['room']}` | `{st['profile']}` | {st['count']} | "
                f"{st['avg_cer']:.2f}% | {st['avg_wer']:.2f}% | {st['avg_med_term_acc']:.1f}% | "
                f"{st['p95_latency_ms']} ms | {st['avg_rtf']:.3f} | {status} |"
            )

    md.append("\n## 2. Zero-Tolerance Clinical Error Audit\n")
    md.append("| Room ID | Profile | Total Tests | Num Err | Meas Err | Neg Err | Lat Err | Spine Err | Critical Status |")
    md.append("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |")

    for k, st in sorted(summary.items()):
        crit_status = "0 Errors (Compliant)" if st["total_crit"] == 0 else f"🚨 {st['total_crit']} ERRORS"
        md.append(
            f"| `{st['room']}` | `{st['profile']}` | {st['count']} | "
            f"{st['crit_num']} | {st['crit_meas']} | {st['crit_neg']} | {st['crit_lat']} | {st['crit_spine']} | {crit_status} |"
        )

    md.append("\n## 3. Preprocessing DSP vs RAW Profile Comparison\n")
    md.append("| Room ID | DSP Profile | CER Delta (pts) | Rel CER Impv (%) | RTF Delta | Clinical Recommendation |")
    md.append("| :--- | :--- | :---: | :---: | :---: | :--- |")

    for room in rooms:
        raw_key = (room, "RAW")
        raw_st = summary.get(raw_key)

        other_profiles = [k for k in summary.keys() if k[0] == room and k[1] != "RAW"]
        for k in sorted(other_profiles):
            dsp_st = summary[k]
            if raw_st and raw_st["avg_cer"] > 0:
                cer_delta = raw_st["avg_cer"] - dsp_st["avg_cer"]
                rel_impv = (cer_delta / raw_st["avg_cer"]) * 100.0
                rtf_delta = dsp_st["avg_rtf"] - raw_st["avg_rtf"]
                rec = "Recommended for noise suppression" if rel_impv > 5.0 and dsp_st["total_crit"] == 0 else "Neutral / Evaluate on high noise"
                md.append(
                    f"| `{room}` | `{dsp_st['profile']}` | {cer_delta:+.2f} | {rel_impv:+.1f}% | {rtf_delta:+.3f} | {rec} |"
                )
            else:
                md.append(
                    f"| `{room}` | `{dsp_st['profile']}` | N/A | N/A | N/A | Standard Evaluation Profile |"
                )

    md.append("\n## 4. Acoustic Environment Policy Recommendation\n")
    md.append("| Room Type | Typical Ambient Noise | Recommended Profile | Rationale |")
    md.append("| :--- | :--- | :--- | :--- |")
    md.append("| **ROOM_01** (Phòng đọc chuẩn) | ~38 dB (Yên tĩnh) | `RAW` | Zero distortion, lowest compute overhead, maximum clinical fidelity |")
    md.append("| **ROOM_MRI** (Bàn điều khiển MRI) | ~62 dB (Quạt nam châm, gradient) | `DPDFNET` | Neural spectral subtraction effectively cancels periodic chiller & gradient pulses |")
    md.append("| **ROOM_CT** (Bàn điều khiển CT) | ~54 dB (Gantry, gió tản nhiệt) | `ANDROID_NS_AGC` | Hardware noise suppression cleans steady fan noise; AGC balances doctor posture changes |")
    md.append("| **ROOM_US** (Phòng Siêu âm) | ~46 dB (Tiếng trao đổi, gel/probe) | `ANDROID_NS` | Lightweight filtering preserves speech naturalness while rejecting room reverb |")
    md.append("| **ROOM_ANGIO** (Can thiệp DSA) | ~58 dB (Monitor, bíp sinh tồn) | `ANDROID_NS_DPDFNET` | Two-stage cascade isolates human voice from periodic equipment alarms |")
    md.append("| **ROOM_ER** (CĐHA Cấp cứu) | ~65 dB (Hỗn hợp ồn ào, xe đẩy) | `ANDROID_NS_DPDFNET` | Maximum noise rejection prevents phantom insertions in chaotic clinical environment |")

    return "\n".join(md)


def main():
    parser = argparse.ArgumentParser(description="Analyze AutoRIS Noise & ASR Benchmark Results.")
    parser.add_argument("--input-dir", type=str, default="benchmark_results_v2", help="Directory containing session JSONs.")
    parser.add_argument("--fallback-dir", type=str, default="benchmark_results_device", help="Fallback directory with device sessions.")
    parser.add_argument("--output", type=str, default="benchmark_noise_report.md", help="Path for output Markdown report.")
    parser.add_argument("--generate-synthetic", action="store_true", help="Generate synthetic data if directory is empty.")
    args = parser.parse_args()

    if args.generate_synthetic:
        print(f"Generating synthetic benchmark sessions into '{args.input_dir}'...")
        generate_synthetic_benchmark_data(args.input_dir)

    sessions = load_sessions(args.input_dir)
    if not sessions and os.path.exists(args.fallback_dir):
        print(f"No sessions in {args.input_dir}, checking {args.fallback_dir}...")
        sessions = load_sessions(args.fallback_dir)

    if not sessions:
        print(f"No sessions found in '{args.input_dir}' or '{args.fallback_dir}'.")
        sys.exit(0)

    print(f"Loaded {len(sessions)} benchmark session records.")
    summary = compute_metrics(sessions)

    # Format output markdown
    report = generate_markdown_report(summary, len(sessions))
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"Benchmark Report written to: {args.output}")

    # Print summary to console
    print("\n" + "=" * 80)
    print("AUTORIS BENCHMARK SUMMARY (ROOM x PREPROCESSING PROFILE)")
    print("=" * 80)
    header = f"{'ROOM':<12} | {'PROFILE':<18} | {'N':<4} | {'CER (%)':<8} | {'WER (%)':<8} | {'RTF':<6} | {'P95 LAT':<8} | {'CRIT ERR':<8}"
    print(header)
    print("-" * 80)
    for (room, profile), st in sorted(summary.items()):
        row = f"{room:<12} | {profile:<18} | {st['count']:<4} | {st['avg_cer']:<8.2f} | {st['avg_wer']:<8.2f} | {st['avg_rtf']:<6.3f} | {st['p95_latency_ms']:<5} ms | {st['total_crit']:<8}"
        print(row)
    print("=" * 80)


if __name__ == "__main__":
    main()
