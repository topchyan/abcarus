# abc2svg upgrade playbook (pipeline)

This is the repeatable, “conveyor belt” method for upgrading `third_party/abc2svg/` without surprises.

Principles:
- One upgrade = one coherent checkpoint (easy to revert).
- **Tolerant-read / strict-write**: avoid hidden transforms and undocumented patching.
- Prefer upstream fixes; keep local patches small, explicit, and temporary.

Related docs:
- Upgrade review framework: `docs/third-party-review.md`
- Workflow quick reference: `WORKFLOW.md`

---

## 0) When to upgrade

Upgrade when at least one is true:
- We need a bug fix (e.g., playback crash, drum parsing regression).
- We need a feature that unblocks real user workflows.
- Security/maintenance: upstream is moving and our pinned snapshot is too old.

Avoid upgrading “just because” during periods of heavy upstream churn; prefer a short stabilization window (1–3 days) if upstream is landing many core changes.

---

## 1) Collect a candidate snapshot (local-only)

1) Download an upstream archive (zip/tar) or export a fossil checkout as an archive.
2) Put it under `third_party/_upd/` (gitignored; never commit).
3) Record upstream identity:
   - fossil artifact hash or tag
   - date/time
   - short reason (“fixes %%MIDI drum crash in abc2mid”)

Tip: prefer naming archives like `abc2svg-<date>-<artifact>.zip` to keep context.

---

## 2) Generate a review report (no changes)

Run:
- `npm run thirdparty:review -- --candidate third_party/_upd/<abc2svg>.zip --abc2svg-build`

This produces a report under `scripts/local/third-party-reviews/` (local-only) and helps classify:
- SAFE
- NEEDS PATCH
- HOLD

---

## 3) Apply the upgrade (single component, minimal diff)

Apply into `third_party/abc2svg/`:
- `npm run abc2svg:upgrade -- --zip third_party/_upd/<abc2svg>.zip --apply`

Guidelines:
- Keep the change limited to `third_party/abc2svg/**` whenever feasible.
- Do not “refactor around” the upgrade in the same commit.

---

## 4) Regression checks (repeatable)

### 4.1 Harness checks (fast)

- `npm run test:measures`
- `npm run test:transpose`
- `npm run test:settings`
- `npm run test:truth-scale`

### 4.2 Manual smoke tests (must-run)

Playback / Follow:
- Start playback on a real-world tune (audio starts within ~1–2s).
- Follow mode does not freeze/jump abnormally on multi-voice tunes.

Drums:
- A tune with `%%MIDI drum...` does not crash playback/MIDI generation.

Render:
- Render a “normal” tune and a “dense” tune; verify layout isn’t obviously broken.

Print/PDF:
- Export or Print Preview a tune; confirm the output is readable and stable.

If a specific bug motivated the upgrade, include its reproduction case as a mandatory check.

---

## 5) Decide: SAFE / NEEDS PATCH / HOLD

### SAFE
- No regressions observed in checks.
- No local patch required.

### NEEDS PATCH
- Upgrade is acceptable, but requires a **small, explicit, well-scoped** local patch.
- Patch must be documented (see below).
- Prefer filing upstream immediately with a minimal reproduction.

### HOLD
- Upgrade breaks an important scenario or introduces unacceptable regressions.
- Keep the current pinned version; optionally re-try later with a newer snapshot.

---

## 6) Local patch policy (if needed)

If we patch abc2svg locally:
- Keep it minimal and isolated.
- Document it:
  - `NOTICE.md` (if licensing/third-party notices need an update)
  - plus a short note in `CHANGELOG.md` when user-visible
  - include upstream artifact ID and why the patch exists
- Prefer upstream submission so we can drop the patch later.

When upstream ships a proper fix, remove our local patch in the next upgrade.

---

## 7) Commit structure (recommended)

Recommended commit sequence:
1) `chore(third_party): upgrade abc2svg to <artifact/date>`
2) (Optional) `fix(third_party): patch abc2svg for <issue>`
3) `docs: note abc2svg upgrade changes` (only if needed; keep small)

---

## 8) Release decision

Cut a patch release if:
- The upgrade is user-visible (fixes crashes, playback errors, import/export issues), or
- It changes output materially (rendering/printing differences).

Otherwise, you can batch it into the next planned release.

