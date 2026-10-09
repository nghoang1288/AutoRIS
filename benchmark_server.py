#!/usr/bin/env python3
"""
benchmark_server.py - AutoRIS Local ASR Ingestion & Analytics Server
Receives local benchmark results and audio from OnePlus Ace 5 / S24 Ultra,
stores them locally, serves real-time analysis reports and web dashboard.
"""

import os
import sys
import json
from html import escape as html_escape
import csv
import time
import socket
import queue
import threading
from datetime import datetime
from urllib.parse import urlparse, parse_qs
import urllib.request
try:
    from http.server import ThreadingHTTPServer as BaseServer, BaseHTTPRequestHandler
except ImportError:
    from http.server import HTTPServer as BaseServer, BaseHTTPRequestHandler

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 8080))
STORAGE_DIR = os.environ.get("STORAGE_DIR", os.path.join(BASE_DIR, "benchmark_results_device"))
SESSIONS_DIR = os.path.join(STORAGE_DIR, "sessions")
AUDIO_DIR = os.path.join(STORAGE_DIR, "audio")
CSV_FILE = os.path.join(STORAGE_DIR, "device_benchmark_aggregate.csv")
ALL_SESSIONS_JSON = os.path.join(STORAGE_DIR, "all_device_sessions.json")
RELEASE_APK_DIR = os.environ.get("RELEASE_APK_DIR", os.path.join(BASE_DIR, "release_apk"))

# Benchmark V2 Storage
STORAGE_DIR_V2 = os.environ.get("STORAGE_DIR_V2", os.path.join(BASE_DIR, "benchmark_results_v2"))
SESSIONS_DIR_V2 = os.path.join(STORAGE_DIR_V2, "sessions")
AUDIO_DIR_V2 = os.path.join(STORAGE_DIR_V2, "audio")
CSV_FILE_V2 = os.path.join(STORAGE_DIR_V2, "device_benchmark_v2_aggregate.csv")
ALL_SESSIONS_JSON_V2 = os.path.join(STORAGE_DIR_V2, "all_device_sessions_v2.json")

os.makedirs(SESSIONS_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(SESSIONS_DIR_V2, exist_ok=True)
os.makedirs(AUDIO_DIR_V2, exist_ok=True)
os.makedirs(RELEASE_APK_DIR, exist_ok=True)

# Doctor Feedback & Case Logging Storage
FEEDBACK_DIR = os.environ.get("FEEDBACK_DIR", os.path.join(BASE_DIR, "feedback_cases"))
FEEDBACK_AGGREGATE_JSONL = os.path.join(FEEDBACK_DIR, "feedback_cases_aggregate.jsonl")
os.makedirs(FEEDBACK_DIR, exist_ok=True)
FEEDBACK_LOCK = threading.Lock()

# Real-time Dictation Sync (Chrome Extension & RIS Integration)
RECENT_DICTATIONS = []
RECENT_LOCK = threading.Lock()
DICTATION_LISTENERS = []
LISTENERS_LOCK = threading.Lock()
FILE_LOCK = threading.Lock()

MAX_UPLOAD_SIZE = 10 * 1024 * 1024   # 10 MB
MAX_AUDIO_SIZE = 50 * 1024 * 1024    # 50 MB

def broadcast_dictation(session_data):
    sid = session_data.get("id") or session_data.get("sessionId") or int(time.time() * 1000)
    norm = session_data.get("normalizedTranscript") or session_data.get("rawTranscript") or ""
    raw = session_data.get("rawTranscript") or ""
    category = session_data.get("category") or ""
    test_id = session_data.get("testId") or "CLINICAL"
    
    item = {
        "id": sid,
        "timestamp": session_data.get("timestamp") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "raw_transcript": raw,
        "normalized_transcript": norm,
        "category": category,
        "test_id": test_id,
        "device": session_data.get("deviceModel") or session_data.get("device", "")
    }
    
    with RECENT_LOCK:
        RECENT_DICTATIONS.append(item)
        if len(RECENT_DICTATIONS) > 100:
            RECENT_DICTATIONS.pop(0)
            
    with LISTENERS_LOCK:
        dead = []
        for q in DICTATION_LISTENERS:
            try:
                q.put_nowait(item)
            except Exception:
                dead.append(q)
        for d in dead:
            if d in DICTATION_LISTENERS:
                DICTATION_LISTENERS.remove(d)

CSV_HEADERS = [
    "ID", "Timestamp", "Device", "Model", "TestID", "Category",
    "AudioDurationSec", "FirstPartialMs", "FinalLatencyMs", "ProcessingMs",
    "RTF", "RamPeakMb", "BatteryPct", "BatteryTemp",
    "CER", "WER", "MedTermAcc", "NumericAcc", "AnatomyAcc", "NegationAcc",
    "RawTranscript", "NormalizedTranscript", "ReferenceText", "AudioPath"
]

CSV_HEADERS_V2 = [
    "ID", "SessionID", "Timestamp", "Device", "Model", "TestID", "Category",
    "RoomID", "RoomType", "NoiseType", "NoiseLevel", "SpeakerDistCm", "MicOrientationDeg",
    "Profile", "AudioDurationSec", "FirstSegmentLatencyMs", "TruePartialLatencyMs", "FirstPartialMs",
    "FinalLatencyMs", "ProcessingMs", "RTF", "RamPeakMb", "BatteryPct", "BatteryTemp",
    "WER_Raw", "CER_Raw", "WER_Norm", "CER_Norm",
    "MedTermAcc", "NumericAcc", "MeasurementAcc", "AnatomyAcc", "LateralityAcc", "NegationAcc", "SpineLevelAcc",
    "CritNumErr", "CritMeasErr", "CritNegErr", "CritLatErr", "CritSpineErr",
    "RawTranscript", "NormalizedTranscript", "ReferenceText", "AudioPath"
]

def load_all_sessions():
    with FILE_LOCK:
        if not os.path.exists(ALL_SESSIONS_JSON):
            return []
        try:
            with open(ALL_SESSIONS_JSON, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[AutoRIS Server Error] Failed to read {ALL_SESSIONS_JSON}: {e}")
            raise IOError(f"Corrupt sessions file {ALL_SESSIONS_JSON}: {e}")

def save_all_sessions(sessions):
    with FILE_LOCK:
        with open(ALL_SESSIONS_JSON, "w", encoding="utf-8") as f:
            json.dump(sessions, f, ensure_ascii=False, indent=2)

def append_to_csv(sessions):
    with FILE_LOCK:
        file_exists = os.path.exists(CSV_FILE) and os.path.getsize(CSV_FILE) > 0
        with open(CSV_FILE, "a", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(CSV_HEADERS)
            for s in sessions:
                writer.writerow([
                    s.get("id", ""),
                    s.get("timestamp", ""),
                    s.get("device", ""),
                    s.get("model", ""),
                    s.get("testId", ""),
                    s.get("category", ""),
                    s.get("audioDurationSec", 0),
                    s.get("firstPartialMs", 0),
                    s.get("finalLatencyMs", 0),
                    s.get("processingMs", 0),
                    s.get("rtf", 0),
                    s.get("ramPeakMb", 0),
                    s.get("batteryPercent", 0),
                    s.get("batteryTemp", 0),
                    s.get("cer", ""),
                    s.get("wer", ""),
                    s.get("medicalTermAccuracy", ""),
                    s.get("numericAccuracy", ""),
                    s.get("anatomyAccuracy", ""),
                    s.get("negationAccuracy", ""),
                    s.get("rawTranscript", ""),
                    s.get("normalizedTranscript", ""),
                    s.get("referenceText", ""),
                    s.get("audioPath", "")
                ])

def is_v2_session(s):
    return any(k in s for k in ("roomId", "room_id", "preprocessingProfile", "preprocessing_profile", "criticalNumericError", "sessionId"))

def load_all_sessions_v2():
    with FILE_LOCK:
        if not os.path.exists(ALL_SESSIONS_JSON_V2):
            return []
        try:
            with open(ALL_SESSIONS_JSON_V2, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[AutoRIS Server Error] Failed to read {ALL_SESSIONS_JSON_V2}: {e}")
            raise IOError(f"Corrupt sessions file {ALL_SESSIONS_JSON_V2}: {e}")

def get_all_sessions():
    try:
        v1 = load_all_sessions()
    except Exception as e:
        print(f"[AutoRIS Server Warning] Failed to load v1 sessions: {e}")
        v1 = []
    try:
        v2 = load_all_sessions_v2()
    except Exception as e:
        print(f"[AutoRIS Server Warning] Failed to load v2 sessions: {e}")
        v2 = []
    seen_ids = set()
    combined = []
    # Process V2 (newer schema) first, then V1
    for s in v2 + v1:
        sid = s.get("id") or s.get("sessionId")
        if sid is not None:
            sid_str = str(sid)
            if sid_str in seen_ids:
                continue
            seen_ids.add(sid_str)
        
        s_norm = dict(s)
        if s_norm.get("wer") is None and s_norm.get("werNormalized") is not None:
            s_norm["wer"] = s_norm.get("werNormalized")
        if s_norm.get("cer") is None and s_norm.get("cerNormalized") is not None:
            s_norm["cer"] = s_norm.get("cerNormalized")
        if not s_norm.get("device"):
            s_norm["device"] = s_norm.get("deviceModel", "")
        if not s_norm.get("model"):
            s_norm["model"] = s_norm.get("modelName", "")
        if not s_norm.get("firstPartialMs") and s_norm.get("firstSegmentResultLatencyMs"):
            s_norm["firstPartialMs"] = s_norm.get("firstSegmentResultLatencyMs")
            
        combined.append(s_norm)
    return combined

def save_all_sessions_v2(sessions):
    with FILE_LOCK:
        with open(ALL_SESSIONS_JSON_V2, "w", encoding="utf-8") as f:
            json.dump(sessions, f, ensure_ascii=False, indent=2)

def append_to_csv_v2(sessions):
    with FILE_LOCK:
        file_exists = os.path.exists(CSV_FILE_V2) and os.path.getsize(CSV_FILE_V2) > 0
        with open(CSV_FILE_V2, "a", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(CSV_HEADERS_V2)
            for s in sessions:
                writer.writerow([
                    s.get("id", ""),
                    s.get("sessionId", ""),
                    s.get("timestamp", ""),
                    s.get("deviceModel") or s.get("device", ""),
                    s.get("modelName") or s.get("model", ""),
                    s.get("testId", ""),
                    s.get("category", ""),
                    s.get("roomId", "ROOM_01"),
                    s.get("roomType", "reading_room"),
                    s.get("noiseType", "clean"),
                    s.get("noiseLevel", "quiet"),
                    s.get("speakerDistanceCm", 30),
                    s.get("micOrientationDeg", 0),
                    s.get("preprocessingProfile", "RAW"),
                    s.get("audioDurationSec", 0),
                    s.get("firstSegmentResultLatencyMs") or s.get("firstPartialMs", 0),
                    s.get("truePartialLatencyMs", ""),
                    s.get("firstPartialMs", 0),
                    s.get("finalLatencyMs", 0),
                    s.get("processingMs", 0),
                    s.get("rtf", 0),
                    s.get("ramPeakMb", 0),
                    s.get("batteryPercent", 0),
                    s.get("batteryTemp", 0),
                    s.get("werRaw", ""),
                    s.get("cerRaw", ""),
                    s.get("werNormalized") or s.get("wer", ""),
                    s.get("cerNormalized") or s.get("cer", ""),
                    s.get("medicalTermAccuracy", ""),
                    s.get("numericAccuracy", ""),
                    s.get("measurementAccuracy", "") or s.get("numericAccuracy", ""),
                    s.get("anatomyAccuracy", ""),
                    s.get("lateralityAccuracy", ""),
                    s.get("negationAccuracy", ""),
                    s.get("spineLevelAccuracy", ""),
                    1 if s.get("criticalNumericError") else 0,
                    1 if s.get("criticalMeasurementError") else 0,
                    1 if s.get("criticalNegationError") else 0,
                    1 if s.get("criticalLateralityError") else 0,
                    1 if s.get("criticalSpineError") else 0,
                    s.get("rawTranscript", ""),
                    s.get("normalizedTranscript", ""),
                    s.get("referenceText", ""),
                    s.get("audioPath", "")
                ])

def init_recent_dictations():
    sessions = get_all_sessions()
    with RECENT_LOCK:
        for s in sessions[-30:]:
            sid = s.get("id") or s.get("sessionId")
            norm = s.get("normalizedTranscript") or s.get("rawTranscript") or ""
            raw = s.get("rawTranscript") or ""
            category = s.get("category") or ""
            test_id = s.get("testId") or "CLINICAL"
            RECENT_DICTATIONS.append({
                "id": sid,
                "timestamp": s.get("timestamp") or "",
                "raw_transcript": raw,
                "normalized_transcript": norm,
                "category": category,
                "test_id": test_id,
                "device": s.get("deviceModel") or s.get("device", "")
            })

def calculate_summary_stats(sessions):
    if not sessions:
        return None

    def avg(vals):
        valid = [v for v in vals if v is not None and isinstance(v, (int, float))]
        return sum(valid) / len(valid) if valid else 0.0

    rtfs = [s.get("rtf") for s in sessions if s.get("rtf") is not None]
    first_partials = [s.get("firstPartialMs") for s in sessions if (s.get("firstPartialMs") or 0) > 0]
    final_latencies = [s.get("finalLatencyMs") for s in sessions if (s.get("finalLatencyMs") or 0) > 0]
    wers = [s.get("wer") for s in sessions if s.get("wer") is not None]
    cers = [s.get("cer") for s in sessions if s.get("cer") is not None]
    med_terms = [s.get("medicalTermAccuracy") for s in sessions if s.get("medicalTermAccuracy") is not None]
    numerics = [s.get("numericAccuracy") for s in sessions if s.get("numericAccuracy") is not None]
    anatomies = [s.get("anatomyAccuracy") for s in sessions if s.get("anatomyAccuracy") is not None]
    negations = [s.get("negationAccuracy") for s in sessions if s.get("negationAccuracy") is not None]
    rams = [s.get("ramPeakMb") for s in sessions if (s.get("ramPeakMb") or 0) > 0]
    temps = [s.get("batteryTemp") for s in sessions if (s.get("batteryTemp") or 0) > 0]

    # Category breakdown
    cats = {}
    for s in sessions:
        c = s.get("category") or "Khác"
        if c not in cats:
            cats[c] = []
        cats[c].append(s)

    cat_breakdown = {}
    for c, items in cats.items():
        cat_breakdown[c] = {
            "count": len(items),
            "avg_wer": round(avg([x.get("wer") for x in items if x.get("wer") is not None]) * 100, 1),
            "avg_cer": round(avg([x.get("cer") for x in items if x.get("cer") is not None]) * 100, 1),
            "med_term_acc": round(avg([x.get("medicalTermAccuracy") for x in items if x.get("medicalTermAccuracy") is not None]) * 100, 1),
            "numeric_acc": round(avg([x.get("numericAccuracy") for x in items if x.get("numericAccuracy") is not None]) * 100, 1)
        }

    return {
        "total_sessions": len(sessions),
        "avg_first_partial_ms": round(avg(first_partials), 1),
        "avg_final_latency_ms": round(avg(final_latencies), 1),
        "avg_rtf": round(avg(rtfs), 4),
        "avg_wer_pct": round(avg(wers) * 100, 2),
        "avg_cer_pct": round(avg(cers) * 100, 2),
        "avg_med_term_acc_pct": round(avg(med_terms) * 100, 2),
        "avg_numeric_acc_pct": round(avg(numerics) * 100, 2),
        "avg_anatomy_acc_pct": round(avg(anatomies) * 100, 2),
        "avg_negation_acc_pct": round(avg(negations) * 100, 2),
        "peak_ram_mb": max(rams) if rams else 0,
        "avg_ram_mb": round(avg(rams), 1),
        "avg_battery_temp": round(avg(temps), 1),
        "category_breakdown": cat_breakdown
    }

def print_terminal_summary(stats, new_count):
    if not stats:
        return
    print("\n" + "=" * 70)
    print(f" [AutoRIS Local Server] DA NHAN +{new_count} KET QUA TEST MOI TU DIEN THOAI")
    print("=" * 70)
    print(f" Tong so luot test da luu: {stats['total_sessions']}")
    print(f" - Avg First Partial Latency : {stats['avg_first_partial_ms']} ms")
    print(f" - Avg Final Latency         : {stats['avg_final_latency_ms']} ms")
    print(f" - Avg RTF (Real-Time Factor): {stats['avg_rtf']} ({round(1/stats['avg_rtf'], 1) if stats['avg_rtf'] > 0 else 0}x realtime)")
    print(f" - Avg WER                   : {stats['avg_wer_pct']}%")
    print(f" - Avg CER                   : {stats['avg_cer_pct']}%")
    print(f" - Do chinh xac Thuat ngu CDHA: {stats['avg_med_term_acc_pct']}%")
    print(f" - Do chinh xac So do/Kich thuoc: {stats['avg_numeric_acc_pct']}%")
    print(f" - Do chinh xac Vi tri giai phau: {stats['avg_anatomy_acc_pct']}%")
    print(f" - Do chinh xac Tu phu dinh     : {stats['avg_negation_acc_pct']}%")
    print(f" - RAM Peak                  : {stats['peak_ram_mb']} MB")
    print(f" - Nhiet do pin trung binh   : {stats['avg_battery_temp']} oC")
    print("-" * 70)
    print(" Chi tiet theo Chuyen khoa CDHA:")
    for cat, cstats in stats.get("category_breakdown", {}).items():
        print(f"   * {cat:20s}: {cstats['count']:2d} cau | WER: {cstats['avg_wer']:4.1f}% | Thuat ngu: {cstats['med_term_acc']:4.1f}% | So do: {cstats['numeric_acc']:4.1f}%")
    print("=" * 70)
    print(f" Dashboard xem chi tiet: http://localhost:{PORT}/dashboard")
    print("=" * 70 + "\n")

def save_feedback_case(payload):
    with FEEDBACK_LOCK:
        now_dt = datetime.now()
        now_str = now_dt.strftime("%Y%m%d_%H%M%S")
        rand_suffix = str(int(time.time() * 1000) % 1000000).zfill(6)
        sid = payload.get("id") or f"fb_{now_str}_{rand_suffix}"

        record = {
            "id": sid,
            "timestamp": payload.get("timestamp") or now_dt.isoformat(),
            "source": payload.get("source", "voice_dictation"),
            "raw_input": (payload.get("raw_input") or "").strip(),
            "ai_output": (payload.get("ai_output") or "").strip(),
            "doctor_final": (payload.get("doctor_final") or "").strip(),
            "doctor_note": (payload.get("doctor_note") or "").strip(),
            "page_url": (payload.get("page_url") or "").strip(),
            "status": payload.get("status", "pending")
        }

        # Lưu file JSON chi tiết cho từng ca
        single_file = os.path.join(FEEDBACK_DIR, f"{sid}.json")
        with open(single_file, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)

        # Lưu nối đuôi vào file JSONL tổng hợp
        with open(FEEDBACK_AGGREGATE_JSONL, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        print(f"[AutoRIS Server] 🚨 Đã lưu phản hồi bác sĩ: {sid} ({record['source']})")
        return record

def list_feedback_cases(status="pending", limit=100):
    with FEEDBACK_LOCK:
        cases = []
        if not os.path.exists(FEEDBACK_DIR):
            return cases

        for fname in sorted(os.listdir(FEEDBACK_DIR), reverse=True):
            if fname.endswith(".json") and fname.startswith("fb_"):
                fpath = os.path.join(FEEDBACK_DIR, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if status == "all" or data.get("status") == status:
                            cases.append(data)
                            if len(cases) >= limit:
                                break
                except Exception:
                    continue
        return cases

def resolve_feedback_cases(ids, resolution_note=""):
    with FEEDBACK_LOCK:
        resolved = []
        now_iso = datetime.now().isoformat()
        id_set = set(ids) if isinstance(ids, list) else {str(ids)}

        for sid in id_set:
            clean_id = os.path.basename(str(sid))
            fpath = os.path.join(FEEDBACK_DIR, f"{clean_id}.json")
            if os.path.exists(fpath):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    data["status"] = "resolved"
                    data["resolved_at"] = now_iso
                    if resolution_note:
                        data["resolution_note"] = resolution_note
                    with open(fpath, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    resolved.append(clean_id)
                except Exception:
                    pass
        return resolved

def get_feedback_stats():
    with FEEDBACK_LOCK:
        total = 0
        pending = 0
        resolved = 0
        if os.path.exists(FEEDBACK_DIR):
            for fname in os.listdir(FEEDBACK_DIR):
                if fname.endswith(".json") and fname.startswith("fb_"):
                    total += 1
                    fpath = os.path.join(FEEDBACK_DIR, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            if data.get("status") == "resolved":
                                resolved += 1
                            else:
                                pending += 1
                    except Exception:
                        pass
        return {
            "total": total,
            "pending": pending,
            "resolved": resolved
        }

def find_clinical_synthesizer_file():
    candidates = [
        os.path.join(BASE_DIR, "clinical_synthesizer.js"),
        os.path.join(BASE_DIR, "data", "clinical_synthesizer.js"),
        os.path.join(STORAGE_DIR, "clinical_synthesizer.js"),
        os.path.join(BASE_DIR, "chrome_extension", "clinical_synthesizer.js"),
    ]
    for cand in candidates:
        if os.path.exists(cand) and os.path.isfile(cand):
            return cand
    return None

LLM_SERVER_URL = os.environ.get("LLM_SERVER_URL", "http://qwen-secretary:8080/v1/chat/completions")

def call_qwen_secretary(current_mota: str, current_ketluan: str, command: str) -> dict:
    prompt = f"""[MÔ TẢ HIỆN TẠI]
{current_mota or '(Trống)'}

[KẾT LUẬN HIỆN TẠI]
{current_ketluan or '(Trống)'}

[YÊU CẦU CHỈNH SỬA CỦA BÁC SĨ]
{command}"""

    system_instruction = (
        "Bạn là Thư ký Y khoa chuyên nghiệp, hỗ trợ chỉnh sửa kết quả chẩn đoán hình ảnh.\n"
        "Áp dụng chính xác yêu cầu chỉnh sửa của bác sĩ vào phần mô tả và kết luận.\n"
        "Chỉ trả về DUY NHẤT một chuỗi JSON hợp lệ không có markdown:\n"
        "{\n"
        '  "mota": "nội dung mô tả sau khi sửa",\n'
        '  "ketluan": "nội dung kết luận sau khi sửa",\n'
        '  "action_summary": "tóm tắt ngắn gọn hành động đã thực hiện"\n'
        "}"
    )

    payload = {
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 512,
        "response_format": {"type": "json_object"}
    }

    req_data = json.dumps(payload).encode("utf-8")
    urls = [LLM_SERVER_URL, "http://127.0.0.1:8081/v1/chat/completions", "http://127.0.0.1:8080/v1/chat/completions"]
    last_err = None

    for url in urls:
        try:
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=20) as res:
                if res.status == 200:
                    res_body = json.loads(res.read().decode("utf-8"))
                    content_str = res_body["choices"][0]["message"]["content"]
                    clean_str = content_str.strip()
                    if clean_str.startswith("```json"):
                        clean_str = clean_str[7:]
                    if clean_str.startswith("```"):
                        clean_str = clean_str[3:]
                    if clean_str.endswith("```"):
                        clean_str = clean_str[:-3]
                    parsed_result = json.loads(clean_str.strip())
                    return {
                        "status": "success",
                        "mota": parsed_result.get("mota", current_mota),
                        "ketluan": parsed_result.get("ketluan", current_ketluan),
                        "summary": parsed_result.get("action_summary", "Thư ký y khoa đã cập nhật kết quả")
                    }
        except Exception as e:
            last_err = e
            continue

    return {
        "status": "error",
        "message": f"Không thể kết nối đến LLM server: {last_err}",
        "mota": current_mota,
        "ketluan": current_ketluan,
        "summary": "Không thể kết nối đến AI server"
    }

class BenchmarkHandler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_HEAD(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/health":
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {
                "status": "ok",
                "host": socket.gethostname(),
                "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_stored": len(get_all_sessions())
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/feedback/list":
            status = query.get("status", ["pending"])[0]
            limit_str = query.get("limit", ["100"])[0]
            try:
                limit = int(limit_str)
            except ValueError:
                limit = 100
            cases = list_feedback_cases(status=status, limit=limit)
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {
                "status": "success",
                "filter_status": status,
                "count": len(cases),
                "cases": cases
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/feedback/stats":
            stats = get_feedback_stats()
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {
                "status": "success",
                **stats
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/clinical_synthesizer.js":
            synth_file = find_clinical_synthesizer_file()
            if synth_file:
                try:
                    with open(synth_file, "rb") as f:
                        code_bytes = f.read()
                    mtime = int(os.path.getmtime(synth_file))
                    self.send_response(200)
                    self.send_cors_headers()
                    self.send_header("Content-Type", "application/javascript; charset=utf-8")
                    self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                    self.send_header("X-Synthesizer-Version", str(mtime))
                    self.send_header("Content-Length", str(len(code_bytes)))
                    self.end_headers()
                    self.wfile.write(code_bytes)
                    return
                except Exception as e:
                    self.send_error(500, f"Error reading synthesizer file: {e}")
                    return
            else:
                self.send_error(404, "clinical_synthesizer.js not found on server")
                return

        elif path == "/api/clinical_synthesizer/version":
            synth_file = find_clinical_synthesizer_file()
            if synth_file:
                mtime = int(os.path.getmtime(synth_file))
                size = os.path.getsize(synth_file)
                resp = {"status": "ok", "version": mtime, "size": size}
            else:
                resp = {"status": "not_found", "version": 0, "size": 0}
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        elif path in ("/api/version", "/api/app/version", "/api/extension/version"):
            apk_path = os.path.join(RELEASE_APK_DIR, "ViASRBenchmark_S24Ultra.apk")
            if not os.path.exists(apk_path):
                apk_path = os.path.join(RELEASE_APK_DIR, "app-debug.apk")
            apk_size = os.path.getsize(apk_path) if os.path.exists(apk_path) else 0
            apk_mtime = int(os.path.getmtime(apk_path)) if os.path.exists(apk_path) else 0

            ext_zip = os.path.join(RELEASE_APK_DIR, "autoris-extension.zip")
            ext_size = os.path.getsize(ext_zip) if os.path.exists(ext_zip) else 0
            ext_mtime = int(os.path.getmtime(ext_zip)) if os.path.exists(ext_zip) else 0

            manifest_path = os.path.join(BASE_DIR, "chrome_extension", "manifest.json")
            ext_ver = "1.2.0"
            if os.path.exists(manifest_path):
                try:
                    with open(manifest_path, "r", encoding="utf-8") as mf:
                        mdata = json.load(mf)
                        ext_ver = mdata.get("version", "1.2.0")
                except Exception:
                    pass

            synth_file = find_clinical_synthesizer_file()
            synth_ver = int(os.path.getmtime(synth_file)) if synth_file and os.path.exists(synth_file) else 0

            full_resp = {
                "status": "ok",
                "app": {
                    "version_name": "1.0.6",
                    "version_code": 7,
                    "apk_filename": "ViASRBenchmark_S24Ultra.apk",
                    "apk_url": "/ViASRBenchmark_S24Ultra.apk",
                    "file_size": apk_size,
                    "updated_at": apk_mtime,
                    "release_notes": "Tự động học lâm sàng qua Gemini 3.8 Flash, tối ưu Lung-RADS v2022",
                    "force_update": false
                },
                "extension": {
                    "version": ext_ver,
                    "zip_filename": "autoris-extension.zip",
                    "zip_url": "/autoris-extension.zip",
                    "file_size": ext_size,
                    "updated_at": ext_mtime,
                    "synthesizer_version": synth_ver,
                    "release_notes": "Tự động cập nhật luật OTA, đồng bộ dữ liệu PACS và phím tắt F9",
                    "force_update": false
                }
            }

            if path == "/api/app/version":
                resp_payload = {"status": "ok", **full_resp["app"]}
            elif path == "/api/extension/version":
                resp_payload = {"status": "ok", **full_resp["extension"]}
            else:
                resp_payload = full_resp

            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(json.dumps(resp_payload, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/benchmark/summary":
            sessions = get_all_sessions()
            stats = calculate_summary_stats(sessions)
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(stats or {}, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/benchmark/sessions":
            sessions = get_all_sessions()
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(sessions, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/dictation/latest":
            after_id = query.get("after_id", [""])[0]
            with RECENT_LOCK:
                items = list(RECENT_DICTATIONS)
            
            if not items:
                resp = {"has_new": False}
            elif not after_id:
                resp = {"has_new": True, "dictation": items[-1]}
            else:
                new_items = []
                found = False
                for it in items:
                    if str(it.get("id")) == str(after_id):
                        found = True
                        new_items = []
                    elif found:
                        new_items.append(it)
                if new_items:
                    resp = {"has_new": True, "dictation": new_items[-1]}
                else:
                    resp = {"has_new": False}
            
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/dictation/stream":
            client_queue = queue.Queue(maxsize=50)
            with LISTENERS_LOCK:
                DICTATION_LISTENERS.append(client_queue)

            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()

            try:
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()
                while True:
                    try:
                        item = client_queue.get(timeout=10)
                        data_str = f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
                        self.wfile.write(data_str.encode("utf-8"))
                        self.wfile.flush()
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except Exception:
                pass
            finally:
                with LISTENERS_LOCK:
                    if client_queue in DICTATION_LISTENERS:
                        DICTATION_LISTENERS.remove(client_queue)
            return

        elif path == "/dashboard":
            self.render_dashboard()
            return

        elif path.startswith("/audio/"):
            filename = os.path.basename(path)
            audio_path = os.path.join(AUDIO_DIR_V2, filename)
            if not os.path.exists(audio_path):
                audio_path = os.path.join(AUDIO_DIR, filename)
            if os.path.exists(audio_path):
                self.send_response(200)
                self.send_cors_headers()
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(os.path.getsize(audio_path)))
                self.end_headers()
                with open(audio_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, "File not found")
            return

        elif path.startswith("/models/"):
            rel_path = path[len("/models/"):].lstrip("/")
            model_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))
            model_file = os.path.abspath(os.path.join(model_dir, rel_path))
            if not model_file.startswith(model_dir):
                self.send_error(403, "Forbidden")
                return
            if os.path.exists(model_file) and os.path.isfile(model_file):
                self.send_response(200)
                self.send_cors_headers()
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(os.path.getsize(model_file)))
                self.end_headers()
                with open(model_file, "rb") as f:
                    while True:
                        chunk = f.read(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            else:
                self.send_error(404, f"Model file {rel_path} not found")
            return

        elif path == "/" or path == "/index.html":
            index_file = os.path.join(RELEASE_APK_DIR, "index.html")
            if os.path.exists(index_file):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                with open(index_file, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.render_default_index()
            return

        elif path.endswith(".apk"):
            apk_filename = os.path.basename(path)
            apk_path = os.path.join(RELEASE_APK_DIR, apk_filename)
            if os.path.exists(apk_path):
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.android.package-archive")
                self.send_header("Content-Disposition", f"attachment; filename=\"{apk_filename}\"")
                self.send_header("Content-Length", str(os.path.getsize(apk_path)))
                self.end_headers()
                with open(apk_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, f"APK {apk_filename} not found")
            return

        elif path.endswith(".zip"):
            zip_filename = os.path.basename(path)
            zip_path = os.path.join(RELEASE_APK_DIR, zip_filename)
            if os.path.exists(zip_path):
                self.send_response(200)
                self.send_cors_headers()
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", f"attachment; filename=\"{zip_filename}\"")
                self.send_header("Content-Length", str(os.path.getsize(zip_path)))
                self.end_headers()
                with open(zip_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, f"File {zip_filename} not found")
            return

        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/benchmark/upload":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_error(400, "Empty payload")
                return
            if content_length > MAX_UPLOAD_SIZE:
                self.send_error(413, f"Payload too large. Maximum is {MAX_UPLOAD_SIZE} bytes.")
                return

            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception as e:
                self.send_error(400, f"Invalid JSON: {e}")
                return

            new_sessions = data if isinstance(data, list) else [data]
            if not new_sessions:
                self.send_error(400, "No sessions provided")
                return

            # Save individual files & route V2 vs V1
            now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            v2_sessions = [s for s in new_sessions if is_v2_session(s)]
            v1_sessions = [s for s in new_sessions if not is_v2_session(s)]

            with FILE_LOCK:
                for s in new_sessions:
                    sid = s.get("id") or int(time.time() * 1000)
                    target_dir = SESSIONS_DIR_V2 if is_v2_session(s) else SESSIONS_DIR
                    sfile = os.path.join(target_dir, f"session_{now_str}_{sid}.json")
                    with open(sfile, "w", encoding="utf-8") as f:
                        json.dump(s, f, ensure_ascii=False, indent=2)

                # Update V2 aggregate data
                if v2_sessions:
                    existing_v2 = load_all_sessions_v2()
                    existing_ids_v2 = {x.get("id") for x in existing_v2 if x.get("id")}
                    to_append_v2 = []
                    for s in v2_sessions:
                        sid = s.get("id")
                        if not sid or sid not in existing_ids_v2:
                            existing_v2.append(s)
                            to_append_v2.append(s)
                        else:
                            for idx, ex in enumerate(existing_v2):
                                if ex.get("id") == sid:
                                    existing_v2[idx] = s
                                    break
                    save_all_sessions_v2(existing_v2)
                    append_to_csv_v2(to_append_v2)

                # Update V1 aggregate data
                if v1_sessions:
                    existing_v1 = load_all_sessions()
                    existing_ids_v1 = {x.get("id") for x in existing_v1 if x.get("id")}
                    to_append_v1 = []
                    for s in v1_sessions:
                        sid = s.get("id")
                        if not sid or sid not in existing_ids_v1:
                            existing_v1.append(s)
                            to_append_v1.append(s)
                        else:
                            for idx, ex in enumerate(existing_v1):
                                if ex.get("id") == sid:
                                    existing_v1[idx] = s
                                    break
                    save_all_sessions(existing_v1)
                    append_to_csv(to_append_v1)

            all_combined = get_all_sessions()
            stats = calculate_summary_stats(all_combined)
            print_terminal_summary(stats, len(new_sessions))

            for s in new_sessions:
                broadcast_dictation(s)

            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {
                "status": "success",
                "received_count": len(new_sessions),
                "total_stored": len(all_combined),
                "message": f"Successfully received {len(new_sessions)} benchmark sessions"
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))

        elif path == "/api/benchmark/upload_audio":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_error(400, "Empty audio payload")
                return
            if content_length > MAX_AUDIO_SIZE:
                self.send_error(413, f"Audio payload too large. Maximum is {MAX_AUDIO_SIZE} bytes.")
                return

            raw_sid = query.get("id", ["unknown"])[0]
            sid = os.path.basename(str(raw_sid))
            raw_filename = query.get("filename", [f"audio_{sid}.wav"])[0]
            filename = os.path.basename(raw_filename)
            audio_data = self.rfile.read(content_length)

            dest_file_v2 = os.path.join(AUDIO_DIR_V2, f"{sid}_{filename}")
            with open(dest_file_v2, "wb") as f:
                f.write(audio_data)

            print(f"[AutoRIS Local Server] Saved audio file ({content_length} bytes): {dest_file_v2}")

            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {
                "status": "success",
                "audio_saved": os.path.basename(dest_file_v2),
                "size_bytes": content_length
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))

        elif path == "/api/feedback/submit":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_error(400, "Empty feedback payload")
                return
            if content_length > MAX_UPLOAD_SIZE:
                self.send_error(413, "Payload too large")
                return
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception as e:
                self.send_error(400, f"Invalid JSON: {e}")
                return

            saved_record = save_feedback_case(data)
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {
                "status": "success",
                "id": saved_record["id"],
                "message": "Feedback saved successfully",
                "record": saved_record
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/feedback/resolve":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_error(400, "Empty payload")
                return
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception as e:
                self.send_error(400, f"Invalid JSON: {e}")
                return

            ids = data.get("ids", [])
            note = data.get("note", "")
            resolved_ids = resolve_feedback_cases(ids, note)
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {
                "status": "success",
                "resolved_count": len(resolved_ids),
                "resolved_ids": resolved_ids
            }
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        elif path == "/api/secretary/edit":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self.send_error(400, "Empty payload")
                return
            if content_length > MAX_UPLOAD_SIZE:
                self.send_error(413, "Payload too large")
                return
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception as e:
                self.send_error(400, f"Invalid JSON: {e}")
                return

            current_mota = data.get("current_mota", "")
            current_ketluan = data.get("current_ketluan", "")
            command = data.get("command", "")
            if not command:
                self.send_error(400, "Missing command field")
                return

            result = call_qwen_secretary(current_mota, current_ketluan, command)
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            return

        else:
            self.send_error(404, "Endpoint not found")

    def render_default_index(self):
        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>AutoRIS Benchmark Server</title></head>
<body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:40px;text-align:center;">
  <h1>AutoRIS Benchmark Server</h1>
  <p>Server dang chay tren cong {PORT}.</p>
  <p><a href="/dashboard" style="color:#38bdf8;font-weight:bold;font-size:18px;">👉 Xem Dashboard Phan Tich Benchmark</a></p>
</body>
</html>"""
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def render_dashboard(self):
        sessions = get_all_sessions()
        stats = calculate_summary_stats(sessions) or {
            "total_sessions": 0, "avg_first_partial_ms": 0, "avg_final_latency_ms": 0,
            "avg_rtf": 0, "avg_wer_pct": 0, "avg_cer_pct": 0, "avg_med_term_acc_pct": 0,
            "avg_numeric_acc_pct": 0, "avg_anatomy_acc_pct": 0, "avg_negation_acc_pct": 0,
            "peak_ram_mb": 0, "avg_battery_temp": 0, "category_breakdown": {}
        }

        # Build table rows
        rows_html = []
        for s in reversed(sessions):
            wer_val = f"{round(s.get('wer')*100, 1)}%" if s.get('wer') is not None else "--"
            cer_val = f"{round(s.get('cer')*100, 1)}%" if s.get('cer') is not None else "--"
            med_val = f"{round(s.get('medicalTermAccuracy')*100, 1)}%" if s.get('medicalTermAccuracy') is not None else "--"
            num_val = f"{round(s.get('numericAccuracy')*100, 1)}%" if s.get('numericAccuracy') is not None else "--"
            
            sid = s.get("id", "") or s.get("sessionId", "")
            # check audio in both V2 and V1 directories
            audio_html = "--"
            for adir in [AUDIO_DIR_V2, AUDIO_DIR]:
                if os.path.exists(adir):
                    for af in os.listdir(adir):
                        if str(sid) and str(sid) in af:
                            audio_html = f'<audio controls src="/audio/{af}" style="height:28px;width:150px;"></audio>'
                            break
                if audio_html != "--":
                    break

            rows_html.append(f"""
            <tr>
              <td><b>{html_escape(str(s.get('testId') or 'CLINICAL'))}</b><br><small style="color:#94a3b8;">{html_escape(str(s.get('category', '--')))}</small></td>
              <td>
                <div style="font-size:13px;color:#e2e8f0;margin-bottom:4px;"><b>Gốc:</b> {html_escape(str(s.get('referenceText', '--')))}</div>
                <div style="font-size:13px;color:#38bdf8;margin-bottom:4px;"><b>Nhận diện:</b> {html_escape(str(s.get('rawTranscript', '--')))}</div>
                <div style="font-size:12px;color:#10b981;"><b>Chuẩn hóa:</b> {html_escape(str(s.get('normalizedTranscript', '--')))}</div>
              </td>
              <td style="color:{'#ef4444' if (s.get('wer') or 0)>0.25 else '#10b981'};font-weight:bold;">{wer_val}</td>
              <td style="color:#f59e0b;">{cer_val}</td>
              <td style="color:#38bdf8;font-weight:bold;">{med_val}</td>
              <td style="color:#a855f7;">{num_val}</td>
              <td><b>{s.get('rtf', 0)}</b><br><small style="color:#94a3b8;">1st: {s.get('firstPartialMs', 0)}ms</small></td>
              <td>{s.get('ramPeakMb', 0)} MB<br><small style="color:#94a3b8;">{s.get('batteryTemp', 0)}°C</small></td>
              <td>{audio_html}</td>
            </tr>
            """)

        rows_joined = "".join(rows_html)

        html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AutoRIS - Live Device Benchmark Dashboard</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0b1120;
            color: #f8fafc;
            margin: 0;
            padding: 24px;
        }}
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #1e293b;
            padding-bottom: 16px;
            margin-bottom: 24px;
        }}
        h1 {{
            font-size: 22px;
            margin: 0;
            color: #38bdf8;
            letter-spacing: 0.5px;
        }}
        .badge {{
            background: #0284c7;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 600;
        }}
        .cards-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }}
        .card {{
            background: #1e293b;
            border-radius: 12px;
            padding: 16px;
            border: 1px solid #334155;
        }}
        .card-title {{
            font-size: 11px;
            text-transform: uppercase;
            color: #94a3b8;
            font-weight: 700;
            margin-bottom: 6px;
        }}
        .card-val {{
            font-size: 24px;
            font-weight: 800;
            color: #ffffff;
        }}
        .card-sub {{
            font-size: 11px;
            color: #64748b;
            margin-top: 4px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            background: #1e293b;
            border-radius: 12px;
            overflow: hidden;
            font-size: 13px;
        }}
        th {{
            background: #0f172a;
            color: #94a3b8;
            text-align: left;
            padding: 12px 14px;
            font-weight: 600;
            border-bottom: 1px solid #334155;
        }}
        td {{
            padding: 12px 14px;
            border-bottom: 1px solid #334155;
            vertical-align: middle;
        }}
        tr:hover {{
            background: #273549;
        }}
        .btn {{
            background: #0284c7;
            color: white;
            text-decoration: none;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            display: inline-block;
        }}
    </style>
    <script>
        function refreshPage() {{
            window.location.reload();
        }}
        // Auto refresh every 5 seconds if page is visible
        setInterval(() => {{
            if (!document.hidden) refreshPage();
        }}, 5000);
    </script>
</head>
<body>
    <div class="header">
        <div>
            <h1>BẢNG ĐIỀU KHIỂN ĐO KIỂM VIASR LOCAL (ONEPLUS ACE 5 / S24 ULTRA)</h1>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                Mô hình: <b>Zipformer-30M RNN-T Streaming (6000h)</b> • Dữ liệu lưu tại: <code>{STORAGE_DIR}</code>
            </div>
        </div>
        <div>
            <span class="badge">LIVE SYNC ACTIVE</span>
            <a href="/dashboard" class="btn" style="margin-left:8px;">LÀM MỚI</a>
        </div>
    </div>

    <div class="cards-grid">
        <div class="card">
            <div class="card-title">TỔNG SỐ LƯỢT TEST</div>
            <div class="card-val" style="color:#38bdf8;">{stats['total_sessions']}</div>
            <div class="card-sub">Lưu trong SQLite & CSV</div>
        </div>
        <div class="card">
            <div class="card-title">TỐC ĐỘ XỬ LÝ (RTF)</div>
            <div class="card-val" style="color:#10b981;">{stats['avg_rtf']}</div>
            <div class="card-sub">{round(1/stats['avg_rtf'], 1) if stats['avg_rtf']>0 else 0}x realtime</div>
        </div>
        <div class="card">
            <div class="card-title">ĐỘ TRỄ TỪ ĐẦU TIÊN</div>
            <div class="card-val" style="color:#38bdf8;">{stats['avg_first_partial_ms']} <span style="font-size:14px;">ms</span></div>
            <div class="card-sub">Final: {stats['avg_final_latency_ms']} ms</div>
        </div>
        <div class="card">
            <div class="card-title">ĐỘ LỖI TỪ (WER)</div>
            <div class="card-val" style="color:#f59e0b;">{stats['avg_wer_pct']}%</div>
            <div class="card-sub">CER: {stats['avg_cer_pct']}%</div>
        </div>
        <div class="card">
            <div class="card-title">THUẬT NGỮ CĐHA</div>
            <div class="card-val" style="color:#10b981;">{stats['avg_med_term_acc_pct']}%</div>
            <div class="card-sub">Chuyên khoa CĐHA</div>
        </div>
        <div class="card">
            <div class="card-title">SỐ ĐO / KÍCH THƯỚC</div>
            <div class="card-val" style="color:#a855f7;">{stats['avg_numeric_acc_pct']}%</div>
            <div class="card-sub">Mm, cm, phân nhánh</div>
        </div>
        <div class="card">
            <div class="card-title">TÀI NGUYÊN (RAM/TEMP)</div>
            <div class="card-val" style="color:#ec4899;">{stats['peak_ram_mb']} <span style="font-size:14px;">MB</span></div>
            <div class="card-sub">Pin: {stats['avg_battery_temp']} °C</div>
        </div>
    </div>

    <h2 style="font-size:16px;color:#e2e8f0;margin-bottom:12px;">CHI TIẾT TỪNG LƯỢT TEST ({len(sessions)} câu)</h2>
    <table>
        <thead>
            <tr>
                <th style="width:110px;">CÂU TEST</th>
                <th>VĂN BẢN (GỐC / NHẬN DIỆN / CHUẨN HÓA)</th>
                <th style="width:75px;">WER</th>
                <th style="width:75px;">CER</th>
                <th style="width:85px;">THUẬT NGỮ</th>
                <th style="width:75px;">SỐ ĐO</th>
                <th style="width:90px;">RTF / TRỄ</th>
                <th style="width:85px;">RAM/PIN</th>
                <th style="width:160px;">AUDIO</th>
            </tr>
        </thead>
        <tbody>
            {rows_joined if rows_joined else '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:32px;">Chưa có dữ liệu nào từ điện thoại gửi về. Hãy mở app trên điện thoại và thực hiện bài test.</td></tr>'}
        </tbody>
    </table>
</body>
</html>"""
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

def run_server():
    init_recent_dictations()
    server_address = ("0.0.0.0", PORT)
    httpd = BaseServer(server_address, BenchmarkHandler)
    print("=" * 70)
    print(f" [AutoRIS Benchmark Ingestion & Analytics Server]")
    print(f" - Listening on: http://0.0.0.0:{PORT}")
    print(f" - Web Dashboard: http://localhost:{PORT}/dashboard")
    print(f" - Storage dir  : {STORAGE_DIR}")
    print("=" * 70)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
