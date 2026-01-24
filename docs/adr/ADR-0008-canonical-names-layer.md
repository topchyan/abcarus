ADR-0008 — Canonical Names Layer (Makam/Perde/Çeşni)

Date: 2026-01-24  
Status: Accepted

## Context

ABCarus uses multiple historical and modern sources for Turkish makam theory and repertoire. Names are not stable across sources:
- diacritics vary (e.g., `Evç` vs `Eviç` / `Evc`),
- transliterations vary (ASCII-only vs Turkish diacritics),
- language variants exist (e.g., Russian spellings),
- ordering sometimes varies in prose (e.g., `Kürdili Hicazkâr` vs `Hicazkâr Kürdili`).

We need to compare and aggregate information across:
- Aydemir DNA tables (`docs/makam_dna/AYDEMIR_MAKAM_DNA.json`),
- scale/interval tables (`docs/makam_dna/AYDEMIR_SCALE_INTERVALS.json`),
- user repertoire files and external datasets.

If we do not normalize names, comparisons become brittle and UI/analysis gets noisy and confusing.

## Decision

### 1) Add a manual canonicalization dictionary

The canonicalization dictionary lives at:
- `docs/makam_dna/NAMES_CANONICAL.json`

It defines:
- canonical names (keys), and
- a list of aliases (values) per category:
  - `makam`
  - `perde`
  - `cesni`

### 2) Strict policy: manual aliases only

This layer is intentionally conservative:
- No automatic token reordering.
- No fuzzy matching.
- No heuristic “best guess”.

All matches must be explainable via explicit alias entries.

### 3) Canonical spellings

Canonical spellings should, by default, align with the spellings used in:
- `docs/makam_dna/AYDEMIR_MAKAM_DNA.json`

If a canonical spelling changes, it must be updated in:
- the canonical dictionary,
- any dependent datasets that store canonical keys.

## Consequences

Positive:
- Deterministic, auditable normalization.
- Easy to extend as research grows (append-only alias additions, occasional corrections).
- Prevents “magic” behavior that can mislead users.

Trade-offs:
- Requires ongoing curation.
- Some real-world inputs will remain unmatched until an alias is added.

## Implementation notes (non-normative)

When used in code, canonicalization should:
- normalize input for lookup (lowercase + strip diacritics + collapse whitespace/punctuation),
- resolve to canonical name only if an explicit alias matches,
- otherwise return the original input (or a structured “unknown” result) without guessing.

