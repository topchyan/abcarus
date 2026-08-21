# Set List v1 Consistency Audit

Date: 2026-08-20  
Scope: Draft 0.3, ADR-0020, ADR-0021, JSON Schema, and desktop implementation.

| Concern | Decision | Enforcement |
| --- | --- | --- |
| Source path portability | `pathHint` may be absolute, relative, stale, or platform-specific. It is never identity. | Format contract and resolver tests |
| Locator naming | Canonical v1 uses `locatorHint`; pre-freeze `tuneIdHint` is tolerant-read migration input only. | Normalizer, Schema, fixtures |
| Embedded header | Only the source preamble before the first `X:` is captured. Inter-tune directives follow the existing segmenter and are not promoted into the header. | Adapter behavior and format contract |
| Unknown fields | Tolerant read, strict canonical write. Unknown fields may be lost on save; semantic additions require another schema revision. | `additionalProperties: false` and serialization test |
| Page-break precedence | Item `pageBreakBefore: true` forces a break except before the first printable item. False does not suppress automatic breaks. | Shared export helper and tests |
| PDF inclusion | `includeInPdf` affects PDF/direct print only, not combined ABC export. | Print pipeline tests |
| Groups | `groups` is a string set semantically; order is preserved only for stable human-readable serialization. | Normalizer and Schema |
| Set List title | Portable `title` is canonical. Mobile local `SetList.name` maps to `title` only during portable import/export. | Draft migration contract; mobile implementation pending |
| Resolver states | Only `FOUND_EXACT`, `FOUND_MODIFIED`, `FOUND_STRONG`, `AMBIGUOUS`, and `MISSING` are domain states. `Moved` is presentation. | ADR, format contract, resolver tests |

No conceptual conflict remains between the ADRs and Draft 0.3. Mobile's current
collection-oriented local store remains an internal representation until its
portable import/export adapter is implemented; it is not itself a conforming
`abcarus.setlist.v1` writer.
