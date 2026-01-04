# ADR-0001: LibraryStore in renderer, LibraryService in main (no IPC state replication)

Date: 2026-01-02  
Status: Accepted

## Context

In ABCarus, the library UI (Tree + Modal) relies on filesystem scanning, metadata extraction (discover), parsing (parse), and write operations (rename/move/bulk). With large collections, the bottleneck quickly shifts from CPU to cross-process synchronization: payload sizes and event frequency between Electron processes. Trying to keep a canonical `LibraryStore` in `main` and “stream” state into the renderer effectively becomes its own project: diffs, state versions, resync recovery, deduplication, and payload controls—otherwise IPC turns into a slow cache layered on top of a slow pipeline.

We need an approach that minimizes risk, preserves invariants (tolerant-read/strict-write, transactional writes, throttled progress), and provides a clear path toward discover/parse split and a persisted index.

## Decision

The canonical library UI state (`LibraryStoreState`) lives in the renderer. All UI state changes go through `LibraryActions` in the renderer.

The `main` process hosts `LibraryService` as a narrow, I/O-adjacent surface: discover, parse-file, stat-guard, atomic write operations, persisted index maintenance (read/write/migrations), bulk gating (“allow/deny” policy), and preflight checks.

IPC is used as RPC (request/response) plus a limited progress stream, strictly throttled. Replicating/streaming a “live store” over IPC is not used.

The persisted index is physically written and maintained in `main` (atomically, versioned). The renderer hydrates via RPC (fetching the needed slices), then updates its store.

## Alternatives considered

Alternative A: Keep `LibraryStore` in `main` and have the renderer subscribe to diffs/snapshots. This increases complexity, desync risk, and IPC load, especially with large libraries and frequent updates.

Alternative B: Duplicate the store in both processes and “merge” changes. This almost guarantees divergence and hard-to-debug edge cases under failure/race conditions.

The chosen model (store in renderer, service in main) localizes complexity and keeps IPC “thin”.

## Consequences

Positive: lower risk of IPC stalls; Tree/Modal share a single source of truth in one process; accelerators (persisted index) are implemented as service optimizations without changing the UI contract; easier vertical slices (openTune + parse-file via actions).

Negative: the renderer owns UI-store consistency and must carefully handle concurrent requests (e.g., parallel openTune); team discipline is required to avoid introducing hidden “state pushes” of large snapshots into the renderer.

## Invariants

Tolerant-read/strict-write: reads/scans tolerate partial data and errors; writes and bulk operations run only with strict validation and predictable outcomes.

Transactional writes: write operations are atomic (temp + replace/rename with retries), with clear stages and rollback on failure; renderer state updates only after confirmed results from `main`.

Progress throttling: scan/parse progress must never be “one event per file” at unbounded frequency; a final completion signal is required.

## Practical implementation

Renderer implements `LibraryActions.openTune()` as the only open path: resolve “intent” → stat-guard/parse via `LibraryService` → update `LibraryStore` → pass data into the editor.

Main implements `LibraryService.parseFile(path)` and `discover(path|roots)` as pure I/O operations with robust error handling, optionally using a persisted index and incremental refresh.

The persisted index lives in `userData`, has a format version, is written atomically, and falls back safely to rebuild on any incompatibility or corruption.

## Migration plan

Start by introducing the discover/parse mode and new actions for openTune/parse-file; move Modal to read from the renderer store and open only via actions. Then add the persisted index as a discover/parse accelerator. After that, gradually move rename/move/bulk and Tree to the same store/actions, including transactional writes and bulk gating.

## Open questions

Do we need multi-window / multiple renderers in the future? If so, we should write a separate ADR for a synchronization model (likely via a service API and explicit “sessions”, but without uncontrolled state streaming).

Key/path normalization for Windows/macOS should be handled as a separate technical decision (case-sensitivity, separators, long paths) with an accompanying test suite.
