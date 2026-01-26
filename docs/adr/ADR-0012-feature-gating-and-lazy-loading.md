ADR-0012 — Feature Gating & Lazy Loading (Makam Tools + Payload Mode default OFF)

Date: 2026-01-26  
Status: Proposed

## Context

ABCarus serves two main needs:
- **Everyday ABC editing** (EDO‑12, no microtonality): stability and simplicity are critical.
- **Microtonal / makam study** (EDO‑53): powerful research tools are valuable but not for most users.

Historically, optional tools and large datasets could be loaded even when most users never use them. This increases:
- startup cost (more JS to parse/execute),
- crash surface area (optional tool bugs can break core),
- and maintenance risk (edits ripple across unrelated code).

We already have ADRs that define core invariants and tool boundaries:
- Working Copy authority (ADR‑0006).
- Header authority and header/X boundaries (ADR‑0007).
- Renderer tool modularization direction (ADR‑0010).
- Payload Mode safety goals (ADR‑0011).

This ADR defines **what is optional**, what defaults apply for non-technical users, and the **lazy-loading rule**:
optional modules/datasets must not load at startup unless enabled.

## Decision

### 1) Use simple, user-facing terms

ABCarus uses two terms in docs and UI:

1) **Editor Help**
   - Beginner-friendly helpers (e.g., editor completions / hover help).
   - **Default ON**.
   - Must be **toggleable in Basic settings** (so people can turn it off if unwanted).

2) **Makam Tools**
   - Everything related to microtone / makam / perde / EDO‑53 study tools.
   - Examples: Intonation Explorer, makam overlays, Makam DNA editor.
   - **Default OFF**.
   - Must be **toggleable in Advanced settings**.

Separately:

3) **Payload Mode (Diagnostics)**
   - A debugging feature used to inspect/experiment with render/playback payloads (ADR‑0011).
   - **Default OFF**.
   - Must be **toggleable in Advanced settings**.

### 2) Defaults and UI gating behavior

- When **Makam Tools** are OFF:
  - Makam-related menu entries are hidden (not merely disabled).
  - Attempting to open a Makam tool via an existing menu action string must be a safe no-op with a user-facing message
    (“Enable in Settings → …”).

- When **Payload Mode** is OFF:
  - Payload Mode entry points are hidden (or replaced by an “Enable…” placeholder that does not load the tool).
  - Attempting to open Payload Mode via an existing menu action string must be a safe no-op with a user-facing message.

### 3) Lazy loading rule (must be enforceable)

When **Makam Tools** are OFF, ABCarus must not import or execute Makam-related modules/datasets at startup.

When **Payload Mode** is OFF, ABCarus must not import or execute Payload Mode UI at startup.

Concrete rules:
- No top-level imports from Makam/Payload tool modules in the default startup path.
- Large tool datasets must be loaded via `import()` only after the user enables the feature and opens the tool.
- Tool code must fail closed (toast + stay closed) rather than throwing uncaught exceptions.

### 4) Stability rails

- No changes to existing IPC channel names or menu action strings.
- Tools must not do direct disk I/O; use preload IPC.
- Tools must not weaken Working Copy and header/X invariants (ADR‑0006/ADR‑0007).
- Tool failures must not break core editor/library/save flows.

## Consequences

Positive:
- Reduced startup load and reduced crash surface area for the default audience.
- Clear separation: “core editor” vs “optional research/diagnostics tools”.
- Enables incremental refactors (ADR‑0010) without a big-bang rewrite.

Trade-offs:
- Optional tooling becomes async (module/data import boundaries).
- Requires discipline in code review: new optional tooling must honor gating + lazy loading.

## Verification (how to prove it)

- Manual:
  - With defaults, Makam Tools and Payload Mode menus are not present.
  - Enabling/disabling toggles updates menus without restart.
  - If a tool module import fails, ABCarus stays usable (no crash; tool remains closed).

- Dev-only instrumentation (recommended):
  - Add a dev env var (e.g., `ABCARUS_DEV_LOG_LAZY_IMPORTS=1`) to log each dynamic tool `import()` call.

- Simple enforcement check (recommended):
  - A lightweight script/harness that asserts forbidden top-level imports are not present in core startup files.

## Relationship to other ADRs

- **ADR‑0010:** ADR‑0012 supplies the enforcement mechanism (defaults + gating + lazy loading) for the “Core vs Tools” boundary.
- **ADR‑0011:** ADR‑0012 does not change Payload Mode’s safety contract; it adds “default OFF + gated” as a product decision.
- **ADR‑0006/ADR‑0007:** Optional tools must not bypass or weaken core invariants.

## Acceptance

- Default installation:
  - Makam Tools are OFF and do not load at startup.
  - Payload Mode is OFF and does not load at startup.
  - Editor Help is ON and available in Basic settings (toggleable OFF).

- Runtime:
  - Enabling/disabling Makam Tools and Payload Mode updates menus without restart.
  - Tool open requests while disabled → toast + no state change.
  - Tool import/runtime errors → no crash; core remains usable.
