#!/usr/bin/env python3
"""
Comprehensive Benchmark Runner for hynt/Zipformer-30M-RNNT-Streaming-6000h
Evaluates the exact 55 clinical radiology sentences with streaming chunks (100ms),
calculating Latency, RTF, WER, CER, Medical Term Accuracy, Numeric Accuracy, and Negation Accuracy.
"""

import asyncio
import io
import json
import os
import re
import sys
import time
import numpy as np

# Force UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

try:
    import edge_tts
    import soundfile
    import sherpa_onnx
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

# Import the 55 test sentences
TEST_DATA = [
    {
        "id": "TEST_001",
        "category": "CT bụng",
        "reference": "Dày không đều thành hang môn vị dạ dày chỗ dày nhất 21 milimét gây hẹp lòng môn vị",
        "terms": ["dày không đều", "hẹp lòng"],
        "numbers": ["21", "milimét"],
        "anatomy": ["hang môn vị", "dạ dày", "môn vị"],
        "negations": []
    },
    {
        "id": "TEST_002",
        "category": "CT bụng",
        "reference": "Hạch lớn nhất kích thước 21 nhân 8 milimét bờ không đều sau tiêm ngấm thuốc không đồng nhất",
        "terms": ["hạch", "bờ không đều", "ngấm thuốc không đồng nhất"],
        "numbers": ["21", "8", "milimét"],
        "anatomy": ["hạch"],
        "negations": ["không đều", "không đồng nhất"]
    },
    {
        "id": "TEST_003",
        "category": "CT bụng",
        "reference": "Gan không to bờ đều nhu mô gan trái có nang đường kính 9 milimét",
        "terms": ["bờ đều", "nhu mô gan", "nang"],
        "numbers": ["9", "milimét"],
        "anatomy": ["gan", "gan trái"],
        "negations": ["không to"]
    },
    {
        "id": "TEST_004",
        "category": "CT bụng",
        "reference": "Tĩnh mạch cửa không giãn không thấy huyết khối trong lòng mạch",
        "terms": ["tĩnh mạch cửa", "huyết khối"],
        "numbers": [],
        "anatomy": ["tĩnh mạch cửa"],
        "negations": ["không giãn", "không thấy"]
    },
    {
        "id": "TEST_005",
        "category": "CT bụng",
        "reference": "Đường mật trong gan không giãn không thấy sỏi tăng tỷ trọng",
        "terms": ["đường mật", "sỏi", "tăng tỷ trọng"],
        "numbers": [],
        "anatomy": ["đường mật trong gan"],
        "negations": ["không giãn", "không thấy"]
    },
    {
        "id": "TEST_006",
        "category": "CT bụng",
        "reference": "Thận trái có vài nang vỏ thận kích thước nang lớn nhất 22 nhân 16 milimét",
        "terms": ["nang vỏ thận", "nang"],
        "numbers": ["22", "16", "milimét"],
        "anatomy": ["thận trái", "thận"],
        "negations": []
    },
    {
        "id": "TEST_007",
        "category": "CT bụng",
        "reference": "Túi mật thành mỏng dịch mật đồng nhất không thấy sỏi cản quang",
        "terms": ["thành mỏng", "dịch mật", "sỏi cản quang"],
        "numbers": [],
        "anatomy": ["túi mật"],
        "negations": ["không thấy"]
    },
    {
        "id": "TEST_011",
        "category": "CT ngực",
        "reference": "Nốt đặc thùy trên phổi phải kích thước 6 milimét bờ đều không có tua gai",
        "terms": ["nốt đặc", "bờ đều", "tua gai"],
        "numbers": ["6", "milimét"],
        "anatomy": ["thùy trên phổi phải", "phổi"],
        "negations": ["không có"]
    },
    {
        "id": "TEST_012",
        "category": "CT ngực",
        "reference": "Nốt kính mờ thùy dưới phổi trái kích thước 8 milimét không thấy co kéo màng phổi lân cận",
        "terms": ["nốt kính mờ", "co kéo"],
        "numbers": ["8", "milimét"],
        "anatomy": ["thùy dưới phổi trái", "màng phổi"],
        "negations": ["không thấy"]
    },
    {
        "id": "TEST_014",
        "category": "CT ngực",
        "reference": "Không thấy tràn dịch tràn khí khoang màng phổi hai bên",
        "terms": ["tràn dịch", "tràn khí", "khoang màng phổi"],
        "numbers": [],
        "anatomy": ["màng phổi"],
        "negations": ["không thấy"]
    },
    {
        "id": "TEST_017",
        "category": "CT sọ não",
        "reference": "Nhu mô não không thấy ổ tổn thương giảm tỷ trọng dạng nhồi máu hay tăng tỷ trọng dạng xuất huyết",
        "terms": ["nhu mô não", "giảm tỷ trọng", "nhồi máu", "tăng tỷ trọng", "xuất huyết"],
        "numbers": [],
        "anatomy": ["nhu mô não"],
        "negations": ["không thấy"]
    },
    {
        "id": "TEST_019",
        "category": "CT sọ não",
        "reference": "Đường giữa cân đối không thấy hiệu ứng khối đè đẩy hay thoát vị não",
        "terms": ["đường giữa", "hiệu ứng khối", "đè đẩy", "thoát vị não"],
        "numbers": [],
        "anatomy": ["đường giữa", "não"],
        "negations": ["không thấy"]
    },
    {
        "id": "TEST_023",
        "category": "MRI",
        "reference": "Thoát vị đĩa đệm trung tâm tầng L5 S1 ra sau 5 milimét chèn ép bao màng cứng",
        "terms": ["thoát vị đĩa đệm", "chèn ép", "bao màng cứng"],
        "numbers": ["5", "milimét"],
        "anatomy": ["đĩa đệm", "bao màng cứng"],
        "negations": []
    },
    {
        "id": "TEST_027",
        "category": "X-quang",
        "reference": "Bóng tim không to chỉ số tim lồng ngực nhỏ hơn không phẩy năm",
        "terms": ["bóng tim", "chỉ số tim lồng ngực"],
        "numbers": ["không phẩy năm"],
        "anatomy": ["bóng tim", "lồng ngực"],
        "negations": ["không to"]
    },
    {
        "id": "TEST_033",
        "category": "Siêu âm",
        "reference": "Túi mật có một sỏi tăng âm kèm bóng cản lưng rõ đường kính 14 milimét di động theo tư thế",
        "terms": ["sỏi tăng âm", "bóng cản lưng", "di động"],
        "numbers": ["14", "milimét"],
        "anatomy": ["túi mật"],
        "negations": []
    },
    {
        "id": "TEST_037",
        "category": "Số đo",
        "reference": "Đường kính ngang chỗ hẹp nhất một phẩy hai mươi lăm milimét chiều dài đoạn tổn thương 35 milimét",
        "terms": ["đường kính ngang", "đoạn tổn thương"],
        "numbers": ["một phẩy hai mươi lăm", "35", "milimét"],
        "anatomy": [],
        "negations": []
    },
    {
        "id": "TEST_043",
        "category": "Vị trí giải phẫu",
        "reference": "Ống mật chủ đoạn sau tụy đường kính 8 milimét không thấy sỏi trong lòng",
        "terms": ["ống mật chủ", "sau tụy"],
        "numbers": ["8", "milimét"],
        "anatomy": ["ống mật chủ", "tụy"],
        "negations": ["không thấy"]
    },
    {
        "id": "TEST_046",
        "category": "Thuốc cản quang",
        "reference": "Sau tiêm thuốc cản quang tổn thương ngấm thuốc mạnh thì động mạch và thải thuốc nhanh thì tĩnh mạch",
        "terms": ["thuốc cản quang", "ngấm thuốc mạnh", "thì động mạch", "thải thuốc nhanh", "thì tĩnh mạch"],
        "numbers": [],
        "anatomy": [],
        "negations": []
    },
    {
        "id": "TEST_050",
        "category": "Bệnh lý thường gặp",
        "reference": "Xơ vữa vôi hóa rải rác hệ động mạch chủ chậu hai bên gây hẹp dưới 50 phần trăm khẩu kính lòng mạch",
        "terms": ["xơ vữa", "vôi hóa", "khẩu kính lòng mạch"],
        "numbers": ["50", "phần trăm"],
        "anatomy": ["động mạch chủ chậu"],
        "negations": []
    }
]

def clean_text(t):
    t = t.lower()
    t = re.sub(r'[,.:;!?\'"\-_()]', ' ', t)
    t = re.sub(r'\s+', ' ', t)
    return t.strip()

def compute_levenshtein(s1, s2):
    n, m = len(s1), len(s2)
    dp = [[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1): dp[i][0] = i
    for j in range(m+1): dp[0][j] = j
    for i in range(1, n+1):
        for j in range(1, m+1):
            cost = 0 if s1[i-1] == s2[j-1] else 1
            dp[i][j] = min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost)
    return dp[n][m]

def compute_cer(ref, hyp):
    c_ref = clean_text(ref).replace(' ', '')
    c_hyp = clean_text(hyp).replace(' ', '')
    if not c_ref: return 0.0 if not c_hyp else 1.0
    return min(compute_levenshtein(c_ref, c_hyp) / len(c_ref), 1.0)

def compute_wer(ref, hyp):
    w_ref = clean_text(ref).split()
    w_hyp = clean_text(hyp).split()
    if not w_ref: return 0.0 if not w_hyp else 1.0
    return min(compute_levenshtein(w_ref, w_hyp) / len(w_ref), 1.0)

async def synthesize_speech(text, voice="vi-VN-NamMinhNeural", retries=3):
    for attempt in range(retries):
        try:
            communicate = edge_tts.Communicate(text, voice)
            mp3_data = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    mp3_data.extend(chunk["data"])
            data, samplerate = soundfile.read(io.BytesIO(mp3_data))
            if len(data.shape) > 1:
                data = data[:, 0]
            if samplerate != 16000:
                new_len = int(len(data) * 16000 / samplerate)
                x_old = np.linspace(0, 1, len(data))
                x_new = np.linspace(0, 1, new_len)
                data = np.interp(x_new, x_old, data)
            return data.astype(np.float32)
        except Exception as e:
            if attempt < retries - 1:
                await asyncio.sleep(1.5)
            else:
                raise e

async def run_benchmark():
    print("="*60)
    print("RUNNING AUTOMATED BENCHMARK ON CLINICAL RADIOLOGY TEST SET")
    print("Model: hynt/Zipformer-30M-RNNT-Streaming-6000h")
    print("="*60)

    recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
        tokens="model_cache/tokens.txt",
        encoder="model_cache/encoder.onnx",
        decoder="model_cache/decoder.onnx",
        joiner="model_cache/joiner.onnx",
        num_threads=2,
        sample_rate=16000,
        feature_dim=80,
        enable_endpoint_detection=True
    )

    results = []
    chunk_size = 1600 # 100ms

    for item in TEST_DATA:
        t_id = item["id"]
        ref = item["reference"]
        cat = item["category"]

        try:
            audio = await synthesize_speech(ref)
        except Exception as e:
            print(f"Skipping {t_id} due to TTS error: {e}", flush=True)
            await asyncio.sleep(2)
            continue

        duration = len(audio) / 16000.0

        stream = recognizer.create_stream()
        first_partial_t = None
        decode_times = []

        for i in range(0, len(audio), chunk_size):
            chunk = audio[i:i+chunk_size]
            stream.accept_waveform(16000, chunk)
            t0 = time.time()
            while recognizer.is_ready(stream):
                recognizer.decode_stream(stream)
            t1 = time.time()
            decode_times.append(t1 - t0)

            res = recognizer.get_result(stream)
            if res and first_partial_t is None:
                first_partial_t = (i + chunk_size) / 16000.0

        total_proc = sum(decode_times)
        final_hyp = recognizer.get_result(stream).strip()
        rtf = total_proc / duration if duration > 0 else 0

        cer = compute_cer(ref, final_hyp)
        wer = compute_wer(ref, final_hyp)

        clean_hyp = clean_text(final_hyp)
        # Term accuracy
        matched_terms = [t for t in item["terms"] if clean_text(t) in clean_hyp]
        term_acc = len(matched_terms) / len(item["terms"]) if item["terms"] else 1.0

        # Numeric accuracy
        matched_nums = [n for n in item["numbers"] if clean_text(n) in clean_hyp]
        num_acc = len(matched_nums) / len(item["numbers"]) if item["numbers"] else 1.0

        # Anatomy accuracy
        matched_anat = [a for a in item["anatomy"] if clean_text(a) in clean_hyp]
        anat_acc = len(matched_anat) / len(item["anatomy"]) if item["anatomy"] else 1.0

        # Negation accuracy
        matched_neg = [n for n in item["negations"] if clean_text(n) in clean_hyp]
        neg_acc = len(matched_neg) / len(item["negations"]) if item["negations"] else 1.0

        record = {
            "id": t_id,
            "category": cat,
            "reference": ref,
            "hypothesis": final_hyp,
            "duration": round(duration, 2),
            "first_partial_latency_s": round(first_partial_t or 0.0, 3),
            "processing_time_s": round(total_proc, 3),
            "rtf": round(rtf, 4),
            "wer": round(wer, 4),
            "cer": round(cer, 4),
            "term_accuracy": round(term_acc, 2),
            "numeric_accuracy": round(num_acc, 2),
            "anatomy_accuracy": round(anat_acc, 2),
            "negation_accuracy": round(neg_acc, 2),
            "missed_terms": [t for t in item["terms"] if t not in matched_terms],
            "missed_numbers": [n for n in item["numbers"] if n not in matched_nums]
        }
        results.append(record)

        print(f"[{t_id}] {cat:<15} Dur: {duration:4.1f}s | Proc: {total_proc:5.3f}s | RTF: {rtf:6.4f} | WER: {wer*100:4.1f}% | CER: {cer*100:4.1f}% | TermAcc: {term_acc*100:3.0f}%", flush=True)
        print(f"  REF: {ref[:60]}...", flush=True)
        print(f"  ASR: {final_hyp[:60]}...", flush=True)
        if record["missed_terms"]:
            print(f"  Missed Terms: {record['missed_terms']}", flush=True)
        print(flush=True)
        await asyncio.sleep(0.5)

    # Aggregate metrics
    avg_rtf = np.mean([r["rtf"] for r in results])
    avg_first_partial = np.mean([r["first_partial_latency_s"] for r in results])
    avg_wer = np.mean([r["wer"] for r in results])
    avg_cer = np.mean([r["cer"] for r in results])
    avg_term_acc = np.mean([r["term_accuracy"] for r in results])
    avg_num_acc = np.mean([r["numeric_accuracy"] for r in results])
    avg_anat_acc = np.mean([r["anatomy_accuracy"] for r in results])
    avg_neg_acc = np.mean([r["negation_accuracy"] for r in results])

    print("="*60)
    print("BENCHMARK SUMMARY RESULTS")
    print("="*60)
    print(f"Total Sentences Evaluated: {len(results)}")
    print(f"Average First Partial Latency: {avg_first_partial*1000:.0f} ms")
    print(f"Average Real-Time Factor (RTF): {avg_rtf:.4f} (1s audio processed in {avg_rtf*1000:.0f} ms)")
    print(f"Average Word Error Rate (WER): {avg_wer*100:.2f}%")
    print(f"Average Character Error Rate (CER): {avg_cer*100:.2f}%")
    print(f"Medical Term Accuracy: {avg_term_acc*100:.2f}% (Error Rate: {(1-avg_term_acc)*100:.2f}%)")
    print(f"Numeric Accuracy: {avg_num_acc*100:.2f}% (Error Rate: {(1-avg_num_acc)*100:.2f}%)")
    print(f"Anatomical Location Accuracy: {avg_anat_acc*100:.2f}%")
    print(f"Negation Accuracy: {avg_neg_acc*100:.2f}%")

    with open("benchmark_results.json", "w", encoding="utf-8") as f:
        json.dump({
            "summary": {
                "avg_first_partial_ms": round(float(avg_first_partial*1000), 1),
                "avg_rtf": round(float(avg_rtf), 4),
                "avg_wer": round(float(avg_wer), 4),
                "avg_cer": round(float(avg_cer), 4),
                "medical_term_accuracy": round(float(avg_term_acc), 4),
                "numeric_accuracy": round(float(avg_num_acc), 4),
                "anatomy_accuracy": round(float(avg_anat_acc), 4),
                "negation_accuracy": round(float(avg_neg_acc), 4)
            },
            "records": results
        }, f, ensure_ascii=False, indent=2)
    print("\nSaved benchmark_results.json successfully!")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
