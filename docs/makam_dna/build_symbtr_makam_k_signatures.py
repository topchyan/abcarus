#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone


TURKISH_MAP = str.maketrans(
    {
        "ç": "c",
        "Ç": "c",
        "ğ": "g",
        "Ğ": "g",
        "ı": "i",
        "I": "i",
        "İ": "i",
        "ö": "o",
        "Ö": "o",
        "ş": "s",
        "Ş": "s",
        "ü": "u",
        "Ü": "u",
        "â": "a",
        "Â": "a",
        "î": "i",
        "Î": "i",
        "û": "u",
        "Û": "u",
        "’": "",
        "“": "",
        "”": "",
        "`": "",
    }
)


def normalize_token(s: str) -> str:
    s = s.strip()
    s = s.translate(TURKISH_MAP)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^a-z0-9\\-]+", "", s)
    return s


def extract_makam_key(title_lines):
    if not title_lines:
        return None
    candidate = title_lines[1] if len(title_lines) >= 2 else title_lines[0]
    token = candidate.strip().split()[0] if candidate.strip() else ""
    token = token.strip(",:;()[]{}")
    if token and re.search(r"[A-Za-zÇĞİÖŞÜçğıöşüâîû]", token):
        return normalize_token(token)
    joined = " ".join(title_lines)
    match = re.search(
        r"\\b([A-Za-zÇĞİÖŞÜçğıöşüâîû]{3,}(?:-[A-Za-zÇĞİÖŞÜçğıöşüâîû]{2,})?)\\b",
        joined,
    )
    return normalize_token(match.group(1)) if match else None


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_abc(path: str):
    cur_x = None
    cur_titles = []
    cur_k = None

    def commit():
        nonlocal cur_x, cur_titles, cur_k
        if cur_x is None:
            return None
        return {
            "x": cur_x,
            "titles": list(cur_titles),
            "k": (cur_k or "").strip(),
            "makamKey": extract_makam_key(cur_titles),
        }

    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("X:") or line.startswith("X: "):
                tune = commit()
                if tune:
                    yield tune
                cur_x = line.split(":", 1)[1].strip()
                cur_titles = []
                cur_k = None
            elif line.startswith("T:") or line.startswith("T: "):
                cur_titles.append(line.split(":", 1)[1].strip())
            elif (line.startswith("K:") or line.startswith("K: ")) and cur_k is None:
                cur_k = line.split(":", 1)[1].strip()

    tune = commit()
    if tune:
        yield tune


def main():
    parser = argparse.ArgumentParser(
        description="Build a makam→K: signature distribution report from a SymbTr ABC corpus."
    )
    parser.add_argument("--input", required=True, help="Path to makams.abc")
    parser.add_argument("--output-json", required=True, help="Output JSON path")
    args = parser.parse_args()

    corpus_hash = sha256_file(args.input)

    by_k = Counter()
    by_makam = defaultdict(Counter)
    tunes_total = 0

    for tune in parse_abc(args.input):
        tunes_total += 1
        k = tune["k"]
        m = tune["makamKey"]
        if k:
            by_k[k] += 1
        if k and m:
            by_makam[m][k] += 1

    by_makam_out = {}
    for makam_key, ks in by_makam.items():
        by_makam_out[makam_key] = {
            "count": sum(ks.values()),
            "kSignatures": dict(ks.most_common()),
        }

    out = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "source": {"path": args.input, "sha256": corpus_hash},
        "tunesTotal": tunes_total,
        "kSignatureTotals": dict(by_k.most_common()),
        "byMakam": dict(
            sorted(by_makam_out.items(), key=lambda kv: kv[1]["count"], reverse=True)
        ),
        "notes": {
            "makamDetection": "Heuristic: first token of the 2nd T: line when present; normalized to ASCII; keeps hyphenated forms.",
            "kFormat": "K: appears to encode 53-EDO accidental sets (SymbTr convention) rather than major/minor.",
        },
    }

    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\\n")


if __name__ == "__main__":
    main()
