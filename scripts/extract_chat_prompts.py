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

    # Also extract fenced code blocks (often used for "official" spec prompts).
    # This helps when the surrounding transcript separators are inconsistent.
    fence_re = re.compile(r"```[^\n]*\n(.*?)\n```", re.DOTALL)
    for match in fence_re.finditer(normalize_newlines(text)):
        fenced = match.group(0).strip()
        if fenced:
            prompts.append(fenced)

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


def extract_role_spec_blocks(text: str) -> list[str]:
    """
    Extract structured "official" Codex task prompts embedded in plain text logs.

    Heuristics:
    - start at a line beginning with ROLE: ... ChatGPT-Codex
    - continue until next ROLE: or a likely free-form chat line after a blank line
    """
    lines = normalize_newlines(text).split("\n")
    blocks: list[str] = []
    i = 0

    role_re = re.compile(r"^\s*ROLE:\s*You are\s+ChatGPT-?Codex\b", re.IGNORECASE)
    marker_re = re.compile(r"^\s*(PRIMARY OBJECTIVE|OBJECTIVE|DELIVERABLES|OUTPUT FORMAT|CONSTRAINTS)\s*:", re.IGNORECASE)

    def looks_like_spec_line(line: str) -> bool:
        s = (line or "").strip()
        if not s:
            return True
        if s.startswith(("```", "-", "*", "#")):
            return True
        if re.match(r"^\d+[\).\]]\s+", s):
            return True
        if ":" in s and re.match(r"^[A-Z][A-Z0-9 _-]{2,}:", s):
            return True
        if marker_re.match(s):
            return True
        return False

    while i < len(lines):
        if not role_re.match(lines[i]):
            i += 1
            continue

        buf: list[str] = [lines[i]]
        i += 1
        saw_marker = False
        blank_run = 0
        while i < len(lines):
            line = lines[i]
            if role_re.match(line):
                break
            if marker_re.match(line.strip()):
                saw_marker = True
            if line.strip() == "":
                blank_run += 1
            else:
                blank_run = 0

            # Terminate when we have enough "spec" content and we hit a likely chat line.
            if saw_marker and blank_run >= 1 and line.strip() and not looks_like_spec_line(line):
                break

            buf.append(line)
            i += 1

        block = "\n".join(buf).strip()
        if block:
            blocks.append(block)

    # Dedupe while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for b in blocks:
        key = hashlib.sha1(b.encode("utf-8", errors="ignore")).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        unique.append(b)
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
        text = extract_text(path)
        prompts = extract_prompt_blocks_from_codex_txt(text)
        role_specs = extract_role_spec_blocks(text)
        return role_specs + prompts

    # Unknown formats: no extraction.
    return []


def safe_slug(text: str, max_len: int = 64) -> str:
    raw = re.sub(r"\s+", " ", (text or "").strip())
    raw = raw[:200]
    raw = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-._")
    if len(raw) > max_len:
        raw = raw[:max_len].rstrip("-._")
    return raw or "prompt"


def is_fence_line(line: str) -> bool:
    s = (line or "").strip()
    return s.startswith("```") and len(s) <= 16


def first_meaningful_line(block: str) -> str:
    for line in (block or "").splitlines():
        s = line.strip()
        if not s:
            continue
        if is_fence_line(s):
            continue
        return s
    return ""


def main():
    parser = argparse.ArgumentParser(description="Extract user prompts from docs/qa/chat-exports.")
    parser.add_argument(
        "--input-dir",
        default="docs/qa/chat-exports",
        help="Directory that contains chat exports.",
    )
    parser.add_argument(
        "--kind",
        choices=("all", "official"),
        default="all",
        help="Which prompts to extract: all user prompts, or only 'official' Codex task prompts (ROLE/OBJECTIVE blocks).",
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

    def should_skip_file(p: Path) -> bool:
        try:
            rel = p.relative_to(root)
        except ValueError:
            return False
        # Never re-process generated prompt outputs if they live under the exports tree.
        for part in rel.parts:
            if part.startswith("prompts"):
                return True
        return False

    files = sorted(
        [p for p in root.rglob("*") if p.is_file() and out_root not in p.parents and not should_skip_file(p)]
    )
    total_prompts = 0

    official_re = re.compile(
        r"(^|\n)\s*ROLE:\s*You are\s+ChatGPT-?Codex\b",
        re.IGNORECASE,
    )
    objective_re = re.compile(r"(^|\n)\s*(PRIMARY OBJECTIVE|OBJECTIVE|DELIVERABLES)\s*:", re.IGNORECASE)

    for path in files:
        rel = path.relative_to(root)
        prompts = extract_prompts_from_file(path)
        if not prompts:
            continue

        date_dir = out_root / detect_date_in_path(rel)
        date_dir.mkdir(parents=True, exist_ok=True)

        source_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", path.name).strip("-._") or "export"
        for idx, prompt in enumerate(prompts, start=1):
            if args.kind == "official":
                # Keep only structured task prompts for Codex (architect/PM style).
                # Require ROLE: ChatGPT-Codex and at least one "objective/deliverables" marker.
                if not official_re.search(prompt):
                    continue
                if not objective_re.search(prompt):
                    continue

            first_line = first_meaningful_line(prompt)
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
