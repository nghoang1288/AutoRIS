#!/usr/bin/env python3
import os
import sys
import time
import urllib.request

DEST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "zipformer-150m")
os.makedirs(DEST_DIR, exist_ok=True)

FILES = [
    ("tokens.txt", "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/raw/main/config.json"),
    ("bpe.model", "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/resolve/main/bpe.model"),
    ("decoder.onnx", "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/resolve/main/decoder-epoch-11-avg-2.int8.onnx"),
    ("joiner.onnx", "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/resolve/main/joiner-epoch-11-avg-2.int8.onnx"),
    ("encoder.onnx", "https://huggingface.co/hynt/ZipFormer-150M-CR-CTC-RNNT-6000h/resolve/main/encoder-epoch-11-avg-2.int8.onnx"),
]

def download():
    print(f"[Model Pre-loader] Downloading ZipFormer-150M to {DEST_DIR}...")
    for fname, url in FILES:
        target = os.path.join(DEST_DIR, fname)
        if os.path.exists(target) and os.path.getsize(target) > 1000:
            print(f" -> {fname} already exists ({os.path.getsize(target)/(1024*1024):.2f} MB), skipping.")
            continue
        print(f" -> Downloading {fname} from {url}...")
        t0 = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AutoRIS-Server"})
            with urllib.request.urlopen(req) as resp, open(target + ".tmp", "wb") as out:
                total = int(resp.headers.get("Content-Length", 0))
                downloaded = 0
                while chunk := resp.read(128 * 1024):
                    out.write(chunk)
                    downloaded += len(chunk)
                    pct = int(downloaded * 100 / total) if total > 0 else 0
                    sys.stdout.write(f"\r    {downloaded/(1024*1024):.1f}/{total/(1024*1024):.1f} MB ({pct}%)")
                    sys.stdout.flush()
            print()
            if os.path.exists(target):
                os.remove(target)
            os.rename(target + ".tmp", target)
            print(f"    Saved {fname} in {time.time()-t0:.1f}s")
        except Exception as e:
            print(f"    Error downloading {fname}: {e}")
            if os.path.exists(target + ".tmp"):
                os.remove(target + ".tmp")

    print("[Model Pre-loader] All ZipFormer-150M files are ready!")

if __name__ == "__main__":
    download()
