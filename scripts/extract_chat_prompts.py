#!/usr/bin/env python3
import argparse
import hashlib
import html
import io
import re
from pathlib import Path
from html.parser import HTMLParser


class PlainTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.chunks = []

    def handle_data(self, data):
        self.chunks.append(data)

    def handle_entityref(self, name):
        self.chunks.append(html.unescape(f"&{name};"))

    def handle_charref(self, name):
        self.chunks.append(html.unescape(f"&#{name};"))

    def text(self):
        return "".join(self.chunks)


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".html", ".htm"}:
        parser = PlainTextExtractor()
        parser.feed(path.read_text(encoding="utf-8", errors="ignore"))
        return parser.text()
    return path.read_text(encoding="utf-8", errors="ignore")


class ChatGptRoleExtractor(HTMLParser):
    def __init__(self, want_role: str):
        super().__init__()
        self.want_role = want_role
        self._role_stack: list[bool] = []
        self._current: list[str] = []
        self.messages: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs_map = dict(attrs or [])
        is_wanted = attrs_map.get("data-message-author-role") == self.want_role
        # If a parent is already within the wanted role, keep collecting.
        inherited = any(self._role_stack)
        self._role_stack.append(bool(is_wanted or inherited))

    def handle_endtag(self, tag):
        if not self._role_stack:
            return
        closing_in_role = self._role_stack.pop()
        if closing_in_role and not any(self._role_stack):
            text = "".join(self._current)
            self._current = []
            text = normalize_newlines(text).strip()
            if text:
                self.messages.append(text)

    def handle_data(self, data):
        if any(self._role_stack):
            self._current.append(data)

    def handle_entityref(self, name):
        if any(self._role_stack):
            self._current.append(html.unescape(f"&{name};"))

    def handle_charref(self, name):
        if any(self._role_stack):
            self._current.append(html.unescape(f"&#{name};"))


def detect_date_in_path(rel: Path) -> str:
    for part in rel.parts:
        if re.fullmatch(r"\d{8}", part):
            return part
    return "unknown"


def normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def extract_prompt_blocks_from_codex_txt(text: str) -> list[str]:
    """
    Best-effort prompt extraction from Codex CLI exported `codex-chat.txt`.

    Known markers in these exports:
    - A line `No tasks in progress` often follows a user message.
    - A separator line of many dashes often precedes a new user message block.
    """
    lines = normalize_newlines(text).split("\n")
    prompts: list[str] = []

    sep_re = re.compile(r"^-{10,}\s*$")

    def grab_block_above(idx: int) -> str:
        j = idx - 1
        while j >= 0 and lines[j].strip() == "":
            j -= 1
        buf: list[str] = []
        while j >= 0:
            s = lines[j].strip()
            if not s:
                break
            if sep_re.match(lines[j]):
                break
            # Avoid swallowing the marker itself.
            if s == "No tasks in progress":
                break
            buf.append(lines[j])
            j -= 1
        return "\n".join(reversed(buf)).strip()

    def grab_block_below(idx: int) -> str:
        k = idx + 1
        while k < len(lines) and lines[k].strip() == "":
            k += 1
        buf: list[str] = []
        while k < len(lines):
            s = lines[k].strip()
            if not s:
                break
            if s == "No tasks in progress":
                break
            if sep_re.match(lines[k]):
                break
            buf.append(lines[k])
            k += 1
        return "\n".join(buf).strip()

    for i, line in enumerate(lines):
        if line.strip() == "No tasks in progress":
            block = grab_block_above(i)
            if block:
                prompts.append(block)
        elif sep_re.match(line):
            block = grab_block_below(i)
            if block:
                prompts.append(block)

    # Dedupe while preserving order (Codex exports often repeat the prompt block).
    seen: set[str] = set()
    unique: list[str] = []
    for p in prompts:
        key = hashlib.sha1(p.encode("utf-8", errors="ignore")).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)

    return unique


def extract_prompts_from_file(path: Path) -> list[str]:
    suffix = path.suffix.lower()
    name_lower = path.name.lower()

    # Explicit prompt files (these are already prompts).
    if name_lower.startswith("prompt_") and suffix in {".txt", ".md"}:
        content = extract_text(path)
        content = normalize_newlines(content).strip()
        return [content] if content else []

    # ChatGPT web exports: extract exact `user` messages from the DOM.
    if suffix in {".html", ".htm"}:
        parser = ChatGptRoleExtractor("user")
        parser.feed(path.read_text(encoding="utf-8", errors="ignore"))
        return parser.messages

    # Codex CLI exports.
    if name_lower in {"codex-chat.txt", "codex-chat.md"}:
        return extract_prompt_blocks_from_codex_txt(extract_text(path))

    # Unknown formats: no extraction.
    return []


def safe_slug(text: str, max_len: int = 64) -> str:
    raw = re.sub(r"\s+", " ", (text or "").strip())
    raw = raw[:200]
    raw = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-._")
    if len(raw) > max_len:
        raw = raw[:max_len].rstrip("-._")
    return raw or "prompt"


def main():
    parser = argparse.ArgumentParser(description="Extract user prompts from docs/qa/chat-exports.")
    parser.add_argument(
        "--input-dir",
        default="docs/qa/chat-exports",
        help="Directory that contains chat exports.",
    )
    parser.add_argument(
        "--output-dir",
        default="docs/qa/chat-exports/prompts",
        help="Directory to write per-prompt files into (grouped by date).",
    )
    args = parser.parse_args()

    root = Path(args.input_dir)
    if not root.is_dir():
        raise SystemExit(f"Input directory does not exist: {root}")

    out_root = Path(args.output_dir)
    out_root.mkdir(parents=True, exist_ok=True)

    files = sorted([p for p in root.rglob("*") if p.is_file() and out_root not in p.parents])
    total_prompts = 0

    for path in files:
        rel = path.relative_to(root)
        prompts = extract_prompts_from_file(path)
        if not prompts:
            continue

        date_dir = out_root / detect_date_in_path(rel)
        date_dir.mkdir(parents=True, exist_ok=True)

        source_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", path.name).strip("-._") or "export"
        for idx, prompt in enumerate(prompts, start=1):
            first_line = next((ln.strip() for ln in prompt.splitlines() if ln.strip()), "")
            slug = safe_slug(first_line)
            digest = hashlib.sha1(prompt.encode("utf-8", errors="ignore")).hexdigest()[:10]
            out_name = f"{source_stem}__{idx:04d}__{slug}__{digest}.txt"
            out_path = date_dir / out_name
            with io.open(out_path, "w", encoding="utf-8") as out:
                out.write(prompt.strip() + "\n")
            total_prompts += 1

    print(f"Extracted prompts: {total_prompts}")


if __name__ == "__main__":
    main()
