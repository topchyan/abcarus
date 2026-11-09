import {
  TRANSLITERATION_PROFILES,
  buildTransliteratedTune,
  collectLyricLines,
  hasArmenianLyrics,
  insertTuneAfterOffset,
  joinFileHeaderAndTune,
  prepareTransliteratedCopy,
  suggestTransliteratedFileName,
  transliterateAdditionalText,
  transliterateLyricLines,
} from "./lyrics_transliteration_model.mjs";

function createLyricsTransliterationFeature({
  elements = {},
  getEditorText = () => "",
  getHeaderText = () => "",
  getActiveFilePath = () => "",
  getActiveTuneMeta = () => null,
  getNextXNumber = () => 1,
  isCurrentDocumentDirty = () => false,
  getHeaderDirty = () => false,
  confirmUnsavedChanges = async () => "cancel",
  performSaveFlow = async () => false,
  renderAbcToSvgMarkup = async () => ({ ok: false, error: "Unable to render." }),
  showSaveDialog = async () => null,
  readFile = async () => ({ ok: false, error: "Unable to read file." }),
  writeFile = async () => ({ ok: false, error: "Unable to write file." }),
  withFileLock = async (_path, operation) => operation(),
  refreshLibraryFile = async () => null,
  selectTune = async () => false,
  markDiskConflictPath = () => {},
  safeDirname = () => "",
  sanitizeFileName = (name) => String(name || ""),
  showSaveError = async () => {},
  showToast = () => {},
  setStatus = () => {},
  transliterationApi = null,
} = {}) {
  let sourceTune = "";
  let sourceHeader = "";
  let renderRevision = 0;
  let renderTimer = null;

  const profileById = new Map(TRANSLITERATION_PROFILES.map((profile) => [profile.id, profile]));

  function selectedProfile() {
    return profileById.get(elements.profile?.value) || TRANSLITERATION_PROFILES[0];
  }

  function outputMode() {
    return elements.mode?.value === "transliterated" ? "transliterated" : "both";
  }

  function setMessage(message, isError = false) {
    if (!elements.message) return;
    elements.message.textContent = String(message || "");
    elements.message.classList.toggle("error", Boolean(isError));
  }

  function close() {
    if (!elements.modal) return;
    elements.modal.classList.remove("open");
    elements.modal.setAttribute("aria-hidden", "true");
    if (renderTimer) clearTimeout(renderTimer);
  }

  function buildDraftTune() {
    const profile = selectedProfile();
    const lyricsDraft = buildTransliteratedTune(sourceTune, elements.generated.value, {
      mode: outputMode(),
      profileLabel: profile.shortLabel,
    });
    return transliterateAdditionalText(lyricsDraft, {
      mode: outputMode(),
      standard: profile.id,
      transliterate: transliterationApi?.transliterate,
    });
  }

  function buildPreparedCopy(xNumber) {
    return prepareTransliteratedCopy(buildDraftTune(), { xNumber });
  }

  async function renderPreview() {
    const revision = ++renderRevision;
    if (elements.score) elements.score.setAttribute("aria-busy", "true");
    try {
      const result = await renderAbcToSvgMarkup(joinFileHeaderAndTune(sourceHeader, buildDraftTune()), {
        suppressGlobalErrors: true,
      });
      if (revision !== renderRevision) return;
      if (!result || !result.ok) throw new Error(result?.error || "Unable to render preview.");
      elements.score.innerHTML = result.svg;
      const warningCount = Array.isArray(result.errors) ? result.errors.length : 0;
      const firstWarning = warningCount ? String(result.errors[0]?.message || "").trim() : "";
      setMessage(warningCount
        ? `Preview rendered with ${warningCount} notation warning${warningCount === 1 ? "" : "s"}${firstWarning ? `: ${firstWarning}` : ""}. Review pronunciation and syllable alignment.`
        : "Generated draft. Review pronunciation and syllable alignment before creating the copy.");
    } catch (error) {
      if (revision !== renderRevision) return;
      if (elements.score) elements.score.textContent = "Preview unavailable.";
      setMessage(error?.message || String(error), true);
    } finally {
      if (revision === renderRevision && elements.score) elements.score.removeAttribute("aria-busy");
    }
  }

  function schedulePreview() {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { void renderPreview(); }, 180);
  }

  function regenerate() {
    const profile = selectedProfile();
    const generated = transliterateLyricLines(sourceTune, {
      standard: profile.id,
      transliterate: transliterationApi?.transliterate,
    });
    elements.generated.value = `${generated.join("\n")}\n`;
    schedulePreview();
  }

  async function open() {
    sourceTune = String(getEditorText() || "");
    sourceHeader = String(getHeaderText() || "");
    if (!sourceTune.trim()) {
      showToast("Open a tune first.", 2400);
      return false;
    }
    if (!hasArmenianLyrics(sourceTune)) {
      showToast("No Armenian text was found in w: lyric lines.", 3200);
      return false;
    }
    if (!transliterationApi || typeof transliterationApi.transliterate !== "function") {
      await showSaveError("The Armenian transliteration engine is unavailable.");
      return false;
    }
    elements.original.value = `${collectLyricLines(sourceTune).map((entry) => entry.line).join("\n")}\n`;
    const meta = getActiveTuneMeta();
    if (elements.insertButton) {
      elements.insertButton.disabled = !getActiveFilePath() || !meta || !Number.isFinite(Number(meta.endOffset));
    }
    regenerate();
    elements.modal.classList.add("open");
    elements.modal.setAttribute("aria-hidden", "false");
    elements.generated.focus();
    return true;
  }

  async function saveSeparateCopy() {
    try {
      const meta = getActiveTuneMeta() || {};
      const tune = buildPreparedCopy(1);
      const content = joinFileHeaderAndTune(sourceHeader, tune);
      const activePath = String(getActiveFilePath() || "");
      const rawSuggestedName = suggestTransliteratedFileName(activePath, {
        xNumber: meta.xNumber || "",
        title: meta.title || "",
        profileId: selectedProfile().id,
      });
      const suggestedName = `${sanitizeFileName(rawSuggestedName.replace(/\.abc$/i, ""))}.abc`;
      const filePath = await showSaveDialog(
        suggestedName,
        activePath ? safeDirname(activePath) : "",
      );
      if (!filePath) return false;
      const result = await writeFile(filePath, content);
      if (!result || !result.ok) throw new Error(result?.error || "Unable to create the transliterated copy.");
      close();
      setStatus("Transliterated copy created.");
      showToast("Transliterated copy created. Original tune unchanged.", 3200);
      return true;
    } catch (error) {
      await showSaveError(error?.message || String(error));
      return false;
    }
  }

  async function ensureSavedBeforeInsert() {
    if (!isCurrentDocumentDirty() && !getHeaderDirty()) return true;
    const choice = await confirmUnsavedChanges("inserting the transliterated copy");
    if (choice === "cancel") return false;
    if (choice === "dont_save") {
      showToast("Save or discard the current edits before inserting a copy.", 3200);
      return false;
    }
    return Boolean(await performSaveFlow());
  }

  async function insertAfterCurrentTune() {
    const filePath = String(getActiveFilePath() || "");
    if (!filePath) {
      await showSaveError("Save the source tune before inserting a copy into its file.");
      return false;
    }
    if (!(await ensureSavedBeforeInsert())) return false;

    try {
      const meta = getActiveTuneMeta() || {};
      const startOffset = Number(meta.startOffset);
      const endOffset = Number(meta.endOffset);
      if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || endOffset <= startOffset) {
        throw new Error("Active tune boundaries are stale. Refresh the Library and try again.");
      }
      let nextX = null;
      await withFileLock(filePath, async () => {
        const readResult = await readFile(filePath);
        if (!readResult || !readResult.ok) throw new Error(readResult?.error || "Unable to read the active file.");
        const before = String(readResult.data || "");
        const activeSlice = before.slice(startOffset, endOffset).replace(/^\s+/, "");
        const sliceX = activeSlice.match(/^X:\s*([^\r\n]*)/i)?.[1]?.trim() || "";
        const expectedX = String(meta.xNumber || "").trim();
        if (!sliceX || (expectedX && sliceX !== expectedX)) {
          throw new Error("Active tune boundaries are stale. Refresh the Library and try again.");
        }
        nextX = getNextXNumber(before);
        const inserted = insertTuneAfterOffset(before, buildPreparedCopy(nextX), endOffset);
        const writeResult = await writeFile(filePath, inserted, { expectedData: before });
        if (!writeResult || !writeResult.ok) {
          if (writeResult?.conflict) markDiskConflictPath(filePath, true);
          throw new Error(writeResult?.error || "Unable to insert the transliterated copy.");
        }
      });

      const updatedFile = await refreshLibraryFile(filePath, { force: true });
      const insertedTune = updatedFile?.tunes?.find((tune) => String(tune?.xNumber || "") === String(nextX));
      if (!insertedTune) throw new Error("The copy was created, but ABCarus could not select it after refreshing the Library.");
      await selectTune(insertedTune.tuneUid || insertedTune.id, { skipConfirm: true, suppressRecent: true });
      close();
      setStatus(`Inserted transliterated copy as X:${nextX}.`);
      showToast(`Transliterated copy inserted as X:${nextX}.`, 2800);
      return true;
    } catch (error) {
      await showSaveError(error?.message || String(error));
      return false;
    }
  }

  for (const profile of TRANSLITERATION_PROFILES) {
    const option = elements.profile?.ownerDocument?.createElement("option");
    if (!option) continue;
    option.value = profile.id;
    option.textContent = profile.label;
    elements.profile.append(option);
  }
  if (elements.profile) elements.profile.value = TRANSLITERATION_PROFILES[0].id;
  elements.closeButton?.addEventListener("click", close);
  elements.cancelButton?.addEventListener("click", close);
  elements.saveButton?.addEventListener("click", () => { void saveSeparateCopy(); });
  elements.insertButton?.addEventListener("click", () => { void insertAfterCurrentTune(); });
  elements.profile?.addEventListener("change", regenerate);
  elements.mode?.addEventListener("change", schedulePreview);
  elements.generated?.addEventListener("input", schedulePreview);
  elements.modal?.addEventListener("click", (event) => {
    if (event.target === elements.modal) close();
  });
  elements.modal?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  return { close, insertAfterCurrentTune, open, renderPreview, saveSeparateCopy };
}

export { createLyricsTransliterationFeature };
