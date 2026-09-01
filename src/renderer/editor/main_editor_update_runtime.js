import { EditorView } from "../../../third_party/codemirror/cm.js";

export function createMainEditorUpdateRuntime({
  isDirtySuppressed = () => false,
  isPayloadMode = () => false,
  hasCurrentDocument = () => false,
  ensureCurrentDocument = () => {},
  patchCurrentDocument = () => {},
  setDirtyIndicator = () => {},
  handleTypingPreviewChange = () => {},
  incrementAbRevision = () => {},
  hasAbPlan = () => false,
  clearAbPlan = () => {},
  isChordProEnabled = () => false,
  isChordProFullView = () => false,
  handleChordProDocChanged = () => {},
  handleChordProSelectionOffset = () => {},
  isRawMode = () => false,
  scheduleRender = () => {},
  scheduleSourceLinkUpdate = () => {},
  isPlaying = () => false,
  getFollowPlayback = () => false,
  scheduleCursorNoteHighlight = () => {},
  clearNoteSelection = () => {},
  updatePlaybackRangeFromSelection = () => {},
  getActiveErrorHighlight = () => null,
  handlePlaybackSelectionTransportState = () => {},
  updatePracticeUi = () => {},
  clearPracticeHighlight = () => {},
  setCursorStatus = () => {},
  setMeasureInputStatus = () => {},
} = {}) {
  let pendingRenderTimer = null;
  let pendingPlaybackRangeOrigin = null;
  let suppressPlaybackRangeSelectionSync = false;

  function clearPendingRender() {
    if (!pendingRenderTimer) return;
    clearTimeout(pendingRenderTimer);
    pendingRenderTimer = null;
  }

  function schedulePendingRender() {
    clearPendingRender();
    pendingRenderTimer = setTimeout(() => {
      pendingRenderTimer = null;
      scheduleRender();
    }, 400);
  }

  function handleUpdate(update) {
    if (update.docChanged) {
      if (!isDirtySuppressed() && !isPayloadMode() && !hasCurrentDocument()) {
        ensureCurrentDocument();
      }
      handleTypingPreviewChange(update);
      incrementAbRevision();
      if (hasAbPlan()) clearAbPlan({ toast: true });
      if (!isDirtySuppressed() && hasCurrentDocument() && !isPayloadMode()) {
        patchCurrentDocument({ content: update.state.doc.toString(), dirty: true }, { create: false });
        setDirtyIndicator(true);
      }
      if (!isDirtySuppressed() && hasCurrentDocument() && !isPayloadMode()) {
        if (isChordProEnabled()) {
          handleChordProDocChanged(update.state.doc.toString());
        }
      }
      if (!isDirtySuppressed() && !isRawMode() && !isChordProFullView()) {
        schedulePendingRender();
        scheduleSourceLinkUpdate();
      }
    }

    if (!isRawMode() && update.selectionSet && !isPlaying()) {
      const idx = update.state.selection.main.anchor;
      handleChordProSelectionOffset(idx);
      if (getFollowPlayback()) {
        scheduleCursorNoteHighlight(idx);
      } else {
        clearNoteSelection();
      }
      if (!suppressPlaybackRangeSelectionSync) {
        const origin = pendingPlaybackRangeOrigin || "cursor";
        pendingPlaybackRangeOrigin = null;
        updatePlaybackRangeFromSelection(
          update.state.selection,
          origin,
          getActiveErrorHighlight()
        );
      } else {
        pendingPlaybackRangeOrigin = null;
      }
      handlePlaybackSelectionTransportState(clearPracticeHighlight);
    }

    if (update.selectionSet || update.docChanged) {
      updatePracticeUi();
      const pos = update.state.selection.main.head;
      const lineInfo = update.state.doc.lineAt(pos);
      setCursorStatus(
        lineInfo.number,
        pos - lineInfo.from + 1,
        pos + 1,
        update.state.doc.lines,
        update.state.doc.length
      );
      if (isRawMode() || isPayloadMode() || isChordProFullView()) {
        setMeasureInputStatus(null);
      } else {
        setMeasureInputStatus(update.state.doc.toString(), pos);
      }
    }
  }

  return {
    clearPendingRender,
    extension: EditorView.updateListener.of(handleUpdate),
    setPendingPlaybackRangeOrigin(origin) {
      pendingPlaybackRangeOrigin = origin || null;
    },
    setSuppressPlaybackRangeSelectionSync(value) {
      suppressPlaybackRangeSelectionSync = Boolean(value);
    },
  };
}
