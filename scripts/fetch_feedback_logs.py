#!/usr/bin/env python3
"""
fetch_feedback_logs.py - Công cụ lấy và hiển thị các ca lỗi/bản sửa của Bác sĩ từ Server AutoRIS
Sử dụng vào buổi tối để review và batch-fix prompt/rules.
"""

import sys
import json
import argparse
import urllib.request
import urllib.parse
from datetime import datetime

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

DEFAULT_SERVER = "https://autoris.hoang.qzz.io"

def fetch_feedback(server_url=DEFAULT_SERVER, status="pending", limit=50):
    url = f"{server_url.rstrip('/')}/api/feedback/list?status={status}&limit={limit}"
    req = urllib.request.Request(url, headers={"User-Agent": "AutoRIS-Reviewer/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode("utf-8"))
            return data.get("cases", [])
    except Exception as e:
        print(f"❌ Lỗi kết nối máy chủ ({url}): {e}")
        return []

def resolve_cases(server_url=DEFAULT_SERVER, ids=[], note=""):
    url = f"{server_url.rstrip('/')}/api/feedback/resolve"
    payload = json.dumps({"ids": ids, "note": note}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", "User-Agent": "AutoRIS-Reviewer/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:
        print(f"❌ Lỗi gửi resolve ({url}): {e}")
        return None

def display_cases(cases):
    if not cases:
        print("🎉 Không có ca phản hồi/báo lỗi nào đang chờ xử lý!")
        return

    print("\n" + "=" * 80)
    print(f" 📋 DANH SÁCH {len(cases)} CA PHẢN HỒI / SỬA LỖI CỦA BÁC SĨ TỪ SERVER")
    print("=" * 80)

    for idx, c in enumerate(cases, 1):
        cid = c.get("id", "N/A")
        ts = c.get("timestamp", "N/A")
        src = c.get("source", "N/A")
        note = c.get("doctor_note", "")

        print(f"\n[{idx}] MÃ CA: {cid} | THỜI GIAN: {ts} | NGUỒN: {src}")
        if note:
            print(f"   💡 Ghi chú của Bác sĩ: {note}")

        raw = c.get("raw_input", "")
        if raw:
            print(f"   🎙️ Bản thô (Raw input):")
            for line in raw.split("\n")[:4]:
                print(f"      {line}")

        ai_out = c.get("ai_output", "")
        doc_final = c.get("doctor_final", "")

        print(f"   🤖 Bản AI điền (Before):")
        for line in ai_out.split("\n"):
            if line.strip():
                print(f"      - {line}")

        print(f"   👨‍⚕️ Bản Bác sĩ sửa chuẩn (After / Ground Truth):")
        for line in doc_final.split("\n"):
            if line.strip():
                print(f"      + {line}")

        print("-" * 80)

def main():
    parser = argparse.ArgumentParser(description="Lấy feedback ca sửa từ Server AutoRIS")
    parser.add_argument("--server", default=DEFAULT_SERVER, help="URL máy chủ AutoRIS")
    parser.add_argument("--status", default="pending", choices=["pending", "resolved", "all"], help="Trạng thái ca")
    parser.add_argument("--limit", type=int, default=50, help="Số ca tối đa")
    parser.add_argument("--resolve", nargs="*", help="Danh sách ID ca đánh dấu đã xử lý")
    parser.add_argument("--note", default="Đã cập nhật prompt và rules", help="Ghi chú hoàn thành")

    args = parser.parse_args()

    if args.resolve:
        res = resolve_cases(args.server, args.resolve, args.note)
        if res:
            print(f"✅ Đã đánh dấu xử lý {res.get('resolved_count', 0)} ca: {res.get('resolved_ids', [])}")
        return

    cases = fetch_feedback(args.server, args.status, args.limit)
    display_cases(cases)

if __name__ == "__main__":
    main()
