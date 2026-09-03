import { NEW_FILE_MINIMAL_ABC } from "../../abc/default_documents.js";
import { composeHeaderPrefixPayload } from "../../abc/header_prefix_model.js";
import { callAbc2svgSafely } from "../../security/abc_security.js";

function formatConversionError(res) {
  if (!res) return "Unknown error.";
  const parts = [];
  if (res.error) parts.push(String(res.error));
  if (res.detail) parts.push(String(res.detail));
  if (!parts.length) return "Unknown error.";
  return parts.join("\n\n");
}

function countTunesByX(text) {
  try {
    const m = String(text || "").match(/^X:\s*\d+\s*$/gm);
    return m ? m.length : 0;
  } catch {
    return 0;
  }
}

export function hasXml2abcBarsPerLineFlag(value) {
  const text = String(value || "");
  if (!text.trim()) return false;
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens.some((token) => /^-b(?:$|=|\d)/.test(String(token || "")));
}

function createImportExportFeature({
  api,
  windowRef = typeof window !== "undefined" ? window : null,
  getEditorText = () => "",
  getSuggestedBaseName = () => "untitled",
  getCurrentDoc = () => null,
  getActiveFilePath = () => "",
  getActiveFileEntry = () => null,
  getActiveTuneMeta = () => null,
  buildConversionHeaderPrefix = (_entryHeader, _tuneText) => ({ text: "" }),
  getSettings = () => ({}),
  getPlaybackPayload = () => ({ text: "" }),
  ensureSafeToAbandonCurrentDoc = async () => false,
  requireCleanForFileOp = async () => false,
  confirmImportTarget = async () => "cancel",
  confirmAppendToFile = async () => "cancel",
  showSaveDialog = async () => null,
  showSaveError = async () => {},
  showOpenError = async () => {},
  showToast = () => {},
  setStatus = () => {},
  logError = () => {},
  readFile = async () => ({ ok: false, error: "Unable to read file." }),
  writeFile = async () => ({ ok: false, error: "Unable to write file." }),
  withFileLock = async (_filePath, operation) => operation(),
  safeBasename = (filePath) => String(filePath || ""),
  safeDirname = () => "",
  stripFileExtension = (name) => String(name || ""),
  initializeNewImportFile = async () => {},
  createBlankDocument = () => ({ path: null, dirty: false, content: "" }),
  setCurrentDocument = () => {},
  markCurrentDocumentClean = () => {},
  setActiveTuneText = () => {},
  setImportedTuneActive = () => {},
  refreshLibraryFile = async () => null,
  markDiskConflictPath = () => {},
  getNextXNumber = () => 1,
  ensureXNumberInAbc = (text) => text,
  appendTuneToContent = (content, tune) => `${content || ""}${tune || ""}`,
  normalizeMeasuresLineBreaks = (text) => text,
  transformMeasuresPerLine = (text) => text,
  alignBarsInText = (text) => text,
  ensureAbc2svgLoader = () => {},
  getAbcCtor = () => null,
  normalizeHeaderNoneSpacing = (text) => text,
  normalizeAccThreeQuarterToneForAbc2svg = (text) => text,
  ensureAbc2svgModulesAsync = async () => true,
  ensureMidiGenLoaded = async () => {},
} = {}) {
  let midiImportInProgress = false;
  let musicXmlBatchExportInProgress = false;

  function deriveTitleFromPath(filePath) {
    if (!filePath) return "Imported tune";
    const name = safeBasename(filePath) || "Imported tune";
    const base = name.replace(/\.[^.]+$/, "");
    return base.trim() || "Imported tune";
  }

  function ensureTitleInAbc(abcText, fallbackTitle) {
    const text = String(abcText || "");
    if (!text.trim()) return text;
    if (/^T:/m.test(text)) return text;
    const title = fallbackTitle || "Imported tune";
    const lines = text.split(/\r\n|\n|\r/);
    const xIdx = lines.findIndex((line) => /^X:/.test(line));
    const insertIdx = xIdx >= 0 ? xIdx + 1 : 0;
    lines.splice(insertIdx, 0, `T:${title}`);
    return lines.join("\n");
  }

  function prepareImportedAbc(abcText, fallbackTitle) {
    let prepared = ensureTitleInAbc(String(abcText || ""), fallbackTitle);
    const settings = getSettings() || {};
    if (settings.stripImportedMeasureComments !== false) {
      prepared = prepared
        .split(/\r\n|\n|\r/)
        .map((line) => line.replace(/\s+%\d+\s*$/, ""))
        .join("\n");
    }
    if (settings.autoFormatImportedAbc !== false) {
      const preserveXml2abcWrapping = hasXml2abcBarsPerLineFlag(settings.xml2abcArgs);
      prepared = preserveXml2abcWrapping
        ? normalizeMeasuresLineBreaks(prepared)
        : normalizeMeasuresLineBreaks(transformMeasuresPerLine(prepared, 4));
      const aligned = alignBarsInText(prepared);
      return aligned || prepared;
    }
    return prepared;
  }

  function installMidiProgressHandler() {
    if (!api || typeof api.onImportMidiProgress !== "function") return false;
    api.onImportMidiProgress((payload) => {
      if (!midiImportInProgress || !payload) return;
      const total = Number(payload.total) || 0;
      const done = Number(payload.done) || 0;
      if (done <= 0) {
        setStatus("Importing MIDI…");
        return;
      }
      if (total > 0 && done >= total) {
        setStatus("Finalizing MIDI import…");
        return;
      }
      const src = payload.sourcePath ? safeBasename(String(payload.sourcePath)) : "";
      setStatus(src ? `Importing MIDI… ${done}/${total} (${src})` : `Importing MIDI… ${done}/${total}`);
    });
    return true;
  }

  function installMusicXmlBatchProgressHandler() {
    if (!api || typeof api.onExportMusicXmlAllProgress !== "function") return false;
    api.onExportMusicXmlAllProgress((payload) => {
      if (!musicXmlBatchExportInProgress || !payload) return;
      const done = Number(payload.done) || 0;
      const total = Number(payload.total) || 0;
      const verb = payload.phase === "write" ? "Writing MusicXML" : "Converting MusicXML";
      setStatus(total > 0 ? `${verb}… ${done}/${total}` : `${verb}…`);
    });
    return true;
  }

  async function importPreparedAbcItems(preparedItems, opts = {}) {
    const items = Array.isArray(preparedItems) ? preparedItems : [];
    if (!items.length) {
      setStatus("Ready");
      return;
    }
    const cleanContext = String(opts.cleanContext || "importing files");
    const preflightOk = await ensureSafeToAbandonCurrentDoc(cleanContext);
    if (!preflightOk) {
      setStatus("Ready");
      return;
    }

    const currentDoc = getCurrentDoc();
    const activeFilePath = getActiveFilePath();
    const activeTuneMeta = getActiveTuneMeta();
    const suggestDir = (() => {
      try {
        if (currentDoc && currentDoc.path) return safeDirname(String(currentDoc.path));
        if (activeFilePath) return safeDirname(String(activeFilePath));
        if (activeTuneMeta && activeTuneMeta.path) return safeDirname(String(activeTuneMeta.path));
      } catch {}
      return "";
    })();

    let existingTargetPath = (currentDoc && currentDoc.path)
      ? String(currentDoc.path)
      : (activeFilePath ? String(activeFilePath) : "");
    if (!existingTargetPath && activeTuneMeta && activeTuneMeta.path) existingTargetPath = String(activeTuneMeta.path);

    const targetChoice = await confirmImportTarget(existingTargetPath || "");
    if (targetChoice === "cancel") {
      setStatus("Ready");
      return;
    }

    let targetPath = existingTargetPath;
    if (targetChoice === "new_file") {
      const ok = await ensureSafeToAbandonCurrentDoc("creating a new file");
      if (!ok) {
        setStatus("Ready");
        return;
      }
      const newPath = await showSaveDialog("import.abc", suggestDir);
      if (!newPath) {
        setStatus("Ready");
        return;
      }
      const created = await writeFile(newPath, "");
      if (!created || !created.ok) {
        setStatus("Error");
        await showSaveError((created && created.error) ? created.error : "Unable to create target file.");
        return;
      }
      targetPath = String(newPath);
      await initializeNewImportFile(targetPath);
      try {
        await refreshLibraryFile(targetPath);
      } catch {}
    } else if (!targetPath) {
      setStatus("Ready");
      return;
    }

    if (!(await requireCleanForFileOp(targetPath, cleanContext))) {
      setStatus("Ready");
      return;
    }

    let dropPlaceholderTune = false;
    try {
      const readRes = await readFile(targetPath);
      if (readRes && readRes.ok) {
        const before = String(readRes.data || "");
        const looksEmpty = !before.trim();
        const looksLikeNewFile = before.trim() === NEW_FILE_MINIMAL_ABC.trim();
        if (looksLikeNewFile) dropPlaceholderTune = true;
        if (!looksEmpty && !looksLikeNewFile) {
          const confirm = await confirmAppendToFile(targetPath);
          if (confirm !== "append") {
            setStatus("Ready");
            return;
          }
        }
      }
    } catch {}

    if (targetPath) {
      try {
        await withFileLock(targetPath, async () => {
          const readRes = await readFile(targetPath);
          if (!readRes || !readRes.ok) throw new Error((readRes && readRes.error) ? readRes.error : "Unable to read target file.");
          const before = String(readRes.data || "");
          if (targetChoice !== "new_file") {
            const verifyRes = await readFile(targetPath);
            if (!verifyRes || !verifyRes.ok) throw new Error((verifyRes && verifyRes.error) ? verifyRes.error : "Unable to verify file before importing.");
            const verifyText = String(verifyRes.data || "");
            if (verifyText !== before) throw new Error("Refusing to import: target file changed on disk. Refresh/reopen the file and try again.");
          }

          const beforeTrimmed = before.trim();
          const isEmpty = !beforeTrimmed;
          const isPlaceholder = beforeTrimmed === NEW_FILE_MINIMAL_ABC.trim();
          const beforeTuneCount = (isEmpty || (dropPlaceholderTune && isPlaceholder)) ? 0 : countTunesByX(before);
          let updated = (dropPlaceholderTune && isPlaceholder) ? "" : before;
          let lastWithX = "";
          for (const item of items) {
            const nextX = getNextXNumber(updated);
            lastWithX = ensureXNumberInAbc(String(item.abcText || ""), nextX);
            updated = appendTuneToContent(updated, lastWithX);
          }

          const writeRes = await writeFile(targetPath, updated, { expectedData: before });
          if (!writeRes || !writeRes.ok) {
            if (writeRes && writeRes.conflict) markDiskConflictPath(targetPath, true);
            throw new Error((writeRes && writeRes.error) ? writeRes.error : "Unable to write imported tunes.");
          }

          const updatedFile = await refreshLibraryFile(targetPath);
          if (updatedFile && updatedFile.tunes && updatedFile.tunes.length) {
            const tune = updatedFile.tunes[Math.min(beforeTuneCount, updatedFile.tunes.length - 1)];
            const tuneText = updated.slice(tune.startOffset, tune.endOffset);
            setImportedTuneActive({
              tune,
              tuneText,
              file: updatedFile,
            });
          } else {
            setActiveTuneText(lastWithX, null, { markDirty: false });
            markCurrentDocumentClean();
          }
        });
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        logError(msg);
        setStatus("Error");
        await showSaveError(msg);
        return;
      }

      for (const item of items) {
        if (item && item.backend) {
          const p = item.sourcePath ? ` (${safeBasename(item.sourcePath)})` : "";
          logError(`Import backend${p}: ${item.backend}`);
        }
        if (item && item.warnings) {
          const p = item.sourcePath ? ` (${safeBasename(item.sourcePath)})` : "";
          logError(`Import warning${p}: ${item.warnings}`);
        }
      }
      setStatus(`OK (imported ${items.length} file${items.length === 1 ? "" : "s"})`);
      return;
    }

    const ok = await ensureSafeToAbandonCurrentDoc("importing a file");
    if (!ok) {
      setStatus("Ready");
      return;
    }

    if (!getCurrentDoc()) setCurrentDocument(createBlankDocument());
    const last = items.length ? items[items.length - 1] : null;
    setActiveTuneText(last ? String(last.abcText || "") : "", null, { markDirty: true });
    for (const item of items) {
      if (item && item.backend) {
        const p = item.sourcePath ? ` (${safeBasename(item.sourcePath)})` : "";
        logError(`Import backend${p}: ${item.backend}`);
      }
      if (item && item.warnings) {
        const p = item.sourcePath ? ` (${safeBasename(item.sourcePath)})` : "";
        logError(`Import warning${p}: ${item.warnings}`);
      }
    }
    setStatus("OK");
  }

  async function importMusicXml() {
    if (!api) return;
    if (typeof api.pickMusicXmlFiles !== "function") return;
    if (typeof api.convertMusicXmlFile !== "function") return;
    const preflightOk = await ensureSafeToAbandonCurrentDoc("importing MusicXML");
    if (!preflightOk) {
      setStatus("Ready");
      return;
    }

    let cancelRequested = false;
    const cancelHintToast = () => {
      try {
        showToast("Importing… Press Esc to cancel.", 2600);
      } catch {}
    };
    const cancelHandler = (e) => {
      try {
        if (!e) return;
        if (e.key !== "Escape") return;
        cancelRequested = true;
        e.preventDefault();
        e.stopPropagation();
      } catch {}
    };

    setStatus("Choose MusicXML files…");
    const pickRes = await api.pickMusicXmlFiles();
    if (!pickRes || pickRes.canceled) {
      setStatus("Ready");
      return;
    }
    if (!pickRes.ok) {
      const msg = formatConversionError(pickRes);
      logError(msg);
      setStatus("Error");
      await showOpenError(msg);
      return;
    }
    const pickedPaths = Array.isArray(pickRes.paths) ? pickRes.paths.map(String) : [];
    if (!pickedPaths.length) {
      setStatus("Ready");
      return;
    }

    const preparedItems = [];
    const total = pickedPaths.length;
    if (windowRef && typeof windowRef.addEventListener === "function") {
      windowRef.addEventListener("keydown", cancelHandler, true);
    }
    cancelHintToast();
    try {
      for (let i = 0; i < pickedPaths.length; i += 1) {
        if (cancelRequested) break;
        const sourcePath = pickedPaths[i];
        setStatus(`Converting MusicXML… ${i + 1}/${total}`);
        const converted = await api.convertMusicXmlFile(sourcePath);
        if (!converted || !converted.ok) {
          const msg = formatConversionError(converted);
          logError(msg);
          setStatus("Error");
          await showOpenError(msg);
          return;
        }
        const fallbackTitle = deriveTitleFromPath(converted.sourcePath ? converted.sourcePath : sourcePath);
        preparedItems.push({
          abcText: prepareImportedAbc(String(converted.abcText || ""), fallbackTitle),
          warnings: converted.warnings ? converted.warnings : null,
          sourcePath: converted.sourcePath ? converted.sourcePath : sourcePath,
        });
      }
    } finally {
      if (windowRef && typeof windowRef.removeEventListener === "function") {
        windowRef.removeEventListener("keydown", cancelHandler, true);
      }
    }

    if (cancelRequested && preparedItems.length) {
      try {
        showToast(`Import canceled (imported ${preparedItems.length}/${total}).`, 2600);
      } catch {}
    } else if (cancelRequested) {
      setStatus("Ready");
      return;
    }

    await importPreparedAbcItems(preparedItems, { cleanContext: "importing MusicXML" });
  }

  async function importMidi() {
    if (!api || typeof api.importMidi !== "function") return;
    const preflightOk = await ensureSafeToAbandonCurrentDoc("importing MIDI");
    if (!preflightOk) {
      setStatus("Ready");
      return;
    }
    setStatus("Choose MIDI files…");
    midiImportInProgress = true;
    let res = null;
    try {
      res = await api.importMidi();
    } finally {
      midiImportInProgress = false;
    }
    if (!res || res.canceled) {
      setStatus("Ready");
      return;
    }
    if (!res.ok) {
      const msg = formatConversionError(res);
      logError(msg);
      setStatus("Error");
      await showOpenError(msg);
      return;
    }

    const rawItems = Array.isArray(res.items) ? res.items : [];
    if (!rawItems.length) {
      setStatus("Ready");
      return;
    }

    const preparedItems = rawItems.map((item) => {
      const sourcePath = item && item.sourcePath ? String(item.sourcePath) : "";
      const fallbackTitle = deriveTitleFromPath(sourcePath);
      return {
        abcText: prepareImportedAbc(String((item && item.abcText) || ""), fallbackTitle),
        warnings: item && item.warnings ? item.warnings : null,
        sourcePath,
      };
    });

    await importPreparedAbcItems(preparedItems, { cleanContext: "importing MIDI" });
  }

  async function exportMusicXml() {
    if (!api || typeof api.exportMusicXml !== "function") return;
    const abcText = getEditorText();
    if (!abcText.trim()) {
      setStatus("No notation to export.");
      return;
    }

    setStatus("Exporting…");
    try {
      const res = await api.exportMusicXml(abcText, getSuggestedBaseName());
      if (!res || res.canceled) {
        setStatus("Ready");
        return;
      }
      if (!res.ok) {
        const msg = formatConversionError(res);
        logError(msg);
        setStatus("Error");
        await showSaveError(msg);
        return;
      }
      if (res.warnings) logError(`Export warning: ${res.warnings}`);
      setStatus("OK");
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      logError(msg);
      setStatus("Error");
      await showSaveError(msg);
    }
  }

  async function exportMusicXmlAll() {
    if (!api || typeof api.exportMusicXmlAll !== "function") return;
    const filePath = String(getActiveFilePath() || "");
    if (!filePath) {
      setStatus("No active file to export.");
      return;
    }
    if (!(await requireCleanForFileOp(filePath, "exporting all tunes to MusicXML"))) {
      setStatus("Ready");
      return;
    }
    setStatus("Preparing MusicXML export…");
    try {
      const refreshed = await refreshLibraryFile(filePath, { force: true });
      const entry = refreshed || getActiveFileEntry();
      const readRes = await readFile(filePath);
      if (!readRes || !readRes.ok) throw new Error(readRes && readRes.error ? readRes.error : "Unable to read active file.");
      const content = String(readRes.data || "");
      const tunes = entry && Array.isArray(entry.tunes) ? entry.tunes : [];
      if (!tunes.length) throw new Error("The active file contains no tunes.");
      const items = [];
      for (let i = 0; i < tunes.length; i += 1) {
        const tune = tunes[i];
        if (!tune || !Number.isFinite(tune.startOffset) || !Number.isFinite(tune.endOffset)) {
          throw new Error(`Tune ${i + 1} has invalid file boundaries. Refresh the Library and try again.`);
        }
        const tuneText = content.slice(tune.startOffset, tune.endOffset);
        if (!tuneText.trim()) continue;
        const prefix = buildConversionHeaderPrefix(entry.headerText || "", tuneText);
        items.push({
          abcText: composeHeaderPrefixPayload(prefix, tuneText),
          xNumber: tune.xNumber || "",
          title: tune.title || "",
        });
      }
      if (!items.length) throw new Error("The active file contains no exportable tunes.");
      setStatus(`Converting MusicXML… 0/${items.length}`);
      musicXmlBatchExportInProgress = true;
      let res = null;
      try {
        res = await api.exportMusicXmlAll({
          sourceName: stripFileExtension(safeBasename(filePath)) || "ABC tunes",
          items,
        });
      } finally {
        musicXmlBatchExportInProgress = false;
      }
      if (!res || res.canceled) {
        setStatus("Ready");
        return;
      }
      if (!res.ok) {
        const msg = formatConversionError(res);
        logError(msg);
        setStatus("Error");
        await showSaveError(msg);
        return;
      }
      if (res.warnings) logError(`Export warning: ${res.warnings}`);
      const exported = Number(res.exported) || 0;
      const failed = Number(res.failed) || 0;
      setStatus(failed
        ? `Completed (exported ${exported}/${items.length}; ${failed} failed)`
        : `OK (exported ${exported}/${items.length} tunes)`);
      showToast(
        failed
          ? `MusicXML: exported ${exported}/${items.length}. See export-report.txt in ${res.outputDir}`
          : `MusicXML: exported ${exported} tunes to ${res.outputDir}`,
        8000,
      );
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      logError(msg);
      setStatus("Error");
      await showSaveError(msg);
    }
  }

  async function buildMidiBytesFromAbc() {
    ensureAbc2svgLoader();
    const AbcCtor = getAbcCtor();
    if (!AbcCtor) throw new Error("abc2svg not available.");
    const payload = getPlaybackPayload();
    let text = normalizeHeaderNoneSpacing(payload.text || "");
    if (/[\\^_]3\/4/.test(text)) {
      text = normalizeAccThreeQuarterToneForAbc2svg(text);
    }
    const modulesOk = await ensureAbc2svgModulesAsync(text);
    if (!modulesOk) throw new Error("Failed to load abc2svg modules.");
    await ensureMidiGenLoaded();

    const errors = [];
    const user = {
      errtxt: "",
      img_out: () => {},
      err: (m) => {
        const msg = String(m || "").trim();
        if (msg) errors.push(msg);
      },
      errmsg: (m, line, col) => {
        const msg = String(m || "").trim();
        if (!msg) return;
        if (Number.isFinite(line) && Number.isFinite(col)) {
          errors.push(`Line ${line + 1}, Col ${col + 1}: ${msg}`);
        } else {
          errors.push(msg);
        }
        user.errtxt += `${msg}\n`;
      },
    };

    const win = windowRef || {};
    const prevAbc = win.abc;
    const prevUser = win.user;
    const abc2svgGlobal = win.abc2svg || null;
    const prevPrintErr = abc2svgGlobal ? abc2svgGlobal.printErr : undefined;
    let abc = null;
    try {
      abc = new AbcCtor(user);
      win.abc = abc;
      win.user = user;
      if (abc2svgGlobal && typeof abc2svgGlobal.printErr !== "function") {
        abc2svgGlobal.printErr = (message) => {
          const msg = String(message || "").trim();
          if (msg) errors.push(msg);
        };
      }
      callAbc2svgSafely(abc, "midi_export", text);
      if (typeof win.midigen !== "function") throw new Error("midigen() not loaded.");
      win.midigen();
    } finally {
      if (abc2svgGlobal) {
        if (prevPrintErr === undefined) delete abc2svgGlobal.printErr;
        else abc2svgGlobal.printErr = prevPrintErr;
      }
      if (prevAbc === undefined) delete win.abc;
      else win.abc = prevAbc;
      if (prevUser === undefined) delete win.user;
      else win.user = prevUser;
    }

    const tunes = abc && Array.isArray(abc.tunes) ? abc.tunes : [];
    const midi = tunes.length ? tunes[0][4] : null;
    if (!midi || !midi.length) {
      const detail = errors.length ? errors[0] : "No MIDI output produced.";
      throw new Error(detail);
    }
    return midi;
  }

  async function exportMidiLike(type) {
    const fn = type === "mp3" ? api && api.exportMp3 : api && api.exportMidi;
    if (typeof fn !== "function") return;
    const abcText = getEditorText();
    if (!abcText.trim()) {
      setStatus("No notation to export.");
      return;
    }
    setStatus("Exporting…");
    try {
      const midiBytes = await buildMidiBytesFromAbc();
      const res = await fn.call(api, midiBytes, getSuggestedBaseName());
      if (!res || res.canceled) {
        setStatus("Ready");
        return;
      }
      if (!res.ok) {
        const msg = formatConversionError(res);
        logError(msg);
        setStatus("Error");
        await showSaveError(msg);
        return;
      }
      setStatus("OK");
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      logError(msg);
      setStatus("Error");
      await showSaveError(msg);
    }
  }

  return {
    exportMidi: () => exportMidiLike("midi"),
    exportMp3: () => exportMidiLike("mp3"),
    exportMusicXml,
    exportMusicXmlAll,
    importMidi,
    importMusicXml,
    importPreparedAbcItems,
    installMusicXmlBatchProgressHandler,
    installMidiProgressHandler,
  };
}

export {
  createImportExportFeature,
  formatConversionError,
};
