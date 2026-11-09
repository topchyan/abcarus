import { applyYouTubeMetadata, collectYouTubeSources } from "./youtube_metadata_model.js";
import { normalizeSourceUrl, parseYouTubeVideoId } from "../../source_link.js";

function createYouTubeMetadataAction({ api = null, state = {}, actions = {} } = {}) {
  const {
    findTuneById = () => null,
    getActiveFileEntry = () => null,
    getActiveFilePath = () => "",
    getActiveTuneMeta = () => null,
    getRawMode = () => false,
  } = state;
  const {
    readFile = async () => ({ ok: false }),
    refreshLibraryFile = async () => null,
    requireCleanForFileOp = async () => true,
    selectTune = async () => {},
    setStatus = () => {},
    showSaveError = async () => {},
    showToast = () => {},
    withFileLock = async (_path, fn) => fn(),
    writeFile = async () => ({ ok: false }),
  } = actions;

  function hasYouTubeSourceForTune(tuneId) {
    const resolved = tuneId ? findTuneById(tuneId) : null;
    const fields = resolved && resolved.tune && resolved.tune.headerFields;
    const values = fields && Array.isArray(fields.F) ? fields.F : [];
    return values.some((value) => parseYouTubeVideoId(normalizeSourceUrl(value)));
  }

  function resolveTuneScope(tuneId, fileText) {
    const resolved = tuneId ? findTuneById(tuneId) : null;
    if (!resolved || !resolved.file || !resolved.tune) {
      throw new Error("The selected tune is no longer available. Refresh the Library and try again.");
    }
    const filePath = String(resolved.file.path || "");
    const start = Number(resolved.tune.startOffset);
    const end = Number(resolved.tune.endOffset);
    if (!filePath || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > fileText.length) {
      throw new Error("Tune location is stale. Refresh the Library and try again.");
    }
    const text = fileText.slice(start, end);
    const xMatch = text.replace(/^\s+/, "").match(/^X:\s*([^\r\n]*)/);
    const actualX = xMatch ? String(xMatch[1] || "").trim() : "";
    const expectedX = resolved.tune.xNumber != null ? String(resolved.tune.xNumber).trim() : "";
    if (!actualX || (expectedX && actualX !== expectedX)) {
      throw new Error("Tune identity changed on disk. Refresh the Library and try again.");
    }
    return { ...resolved, filePath, start, end, text };
  }

  async function update({ tuneId = "" } = {}) {
    const requestedTune = String(tuneId || "");
    const initialTune = requestedTune ? findTuneById(requestedTune) : null;
    const filePath = requestedTune
      ? String(initialTune && initialTune.file && initialTune.file.path || "")
      : String(getActiveFilePath() || "");
    if (!filePath) return showToast(requestedTune ? "The selected tune is no longer available." : "No active file selected.", 2200);
    if (getRawMode()) return showToast("Raw mode: switch to tune mode before updating YouTube metadata.", 2800);
    if (!(await requireCleanForFileOp(filePath, "updating YouTube metadata"))) return;
    setStatus("Reading YouTube metadata…");
    try {
      await withFileLock(filePath, async () => {
        const readRes = await readFile(filePath);
        if (!readRes || !readRes.ok) throw new Error(readRes && readRes.error ? readRes.error : "Unable to read file.");
        const before = String(readRes.data || "");
        const tuneScope = requestedTune ? resolveTuneScope(requestedTune, before) : null;
        const sourceText = tuneScope ? tuneScope.text : before;
        const previousTune = getActiveTuneMeta();
        const previousFile = getActiveFileEntry();
        const previousFilePath = previousFile && previousFile.path ? String(previousFile.path) : "";
        const previousTunePath = previousTune && previousTune.path ? String(previousTune.path) : previousFilePath;
        const previousOrdinal = previousTune && previousTunePath === filePath && previousFile && Array.isArray(previousFile.tunes)
          ? previousFile.tunes.findIndex((tune) => tune && tune.id === previousTune.id)
          : -1;
        const sources = collectYouTubeSources(sourceText);
        if (!sources.length) {
          await api.confirmYouTubeMetadataUpdate({
            updateCount: 0,
            detail: tuneScope
              ? "No YouTube F: links were found in the selected tune."
              : "No YouTube F: links were found in the active file.",
          });
          setStatus("No YouTube links found.");
          return;
        }
        const unique = Array.from(new Map(sources.map((item) => [item.videoId, item])).values());
        const metadata = new Map();
        const failures = [];
        for (let i = 0; i < unique.length; i += 1) {
          const item = unique[i];
          setStatus(`Reading YouTube metadata… ${i + 1}/${unique.length}`);
          const result = await api.fetchYouTubeMetadata(item.url);
          if (result && result.ok) metadata.set(item.videoId, result);
          else failures.push({ ...item, error: result && result.error ? result.error : "Unavailable." });
        }
        const result = applyYouTubeMetadata(sourceText, metadata);
        const report = [
          `YouTube links: ${sources.length}`,
          `Ready to update: ${result.updated}`,
          `Already current: ${result.unchanged}`,
          `Unavailable or failed: ${failures.length}`,
        ];
        if (failures.length) {
          report.push("", "Unavailable:");
          for (const item of failures.slice(0, 30)) {
            report.push(`X:${item.xNumber || "?"}${item.title ? ` ${item.title}` : ""} — ${item.error}`);
          }
          if (failures.length > 30) report.push(`…and ${failures.length - 30} more.`);
        }
        const confirmed = await api.confirmYouTubeMetadataUpdate({ updateCount: result.updated, detail: report.join("\n") });
        if (!confirmed) {
          setStatus("YouTube metadata update canceled.");
          return;
        }
        if (!result.updated) {
          setStatus(failures.length
            ? `YouTube metadata check finished · ${failures.length} unavailable.`
            : "YouTube metadata is up to date.");
          return;
        }
        const nextFileText = tuneScope
          ? `${before.slice(0, tuneScope.start)}${result.text}${before.slice(tuneScope.end)}`
          : result.text;
        const writeRes = await writeFile(filePath, nextFileText, { expectedData: before });
        if (!writeRes || !writeRes.ok) {
          if (writeRes && writeRes.conflict) throw new Error("File changed on disk while YouTube metadata was being read. Nothing was written.");
          throw new Error(writeRes && writeRes.error ? writeRes.error : "Unable to write file.");
        }
        const updatedFile = await refreshLibraryFile(filePath, { force: true });
        if (previousOrdinal >= 0 && previousTune && updatedFile && Array.isArray(updatedFile.tunes)) {
          const replacement = (previousOrdinal >= 0 ? updatedFile.tunes[previousOrdinal] : null)
            || updatedFile.tunes.find((tune) => String(tune.xNumber || "") === String(previousTune.xNumber || "") && String(tune.title || "") === String(previousTune.title || ""))
            || updatedFile.tunes.find((tune) => String(tune.xNumber || "") === String(previousTune.xNumber || ""));
          if (replacement && replacement.id) await selectTune(replacement.id, { skipConfirm: true, suppressRecent: true });
        }
        setStatus(`YouTube metadata updated · ${result.updated} link${result.updated === 1 ? "" : "s"}.`);
      });
    } catch (error) {
      setStatus("Error");
      await showSaveError(error && error.message ? error.message : String(error));
    }
  }

  return {
    hasYouTubeSourceForTune,
    updateActiveFile: () => update(),
    updateTune: (tuneId) => update({ tuneId }),
  };
}

export { createYouTubeMetadataAction };
