import { createAppendCurrentTuneAction } from "./append_current_tune_action.js";
import { createDeleteTuneAction } from "./delete_tune_action.js";
import { createDuplicateTuneAction } from "./duplicate_tune_action.js";
import { createNewFileAction } from "./new_file_action.js";
import { createPasteMoveTuneAction } from "./paste_move_tune_action.js";
import { createRenumberXAction } from "./renumber_x_action.js";
import { createTuneClipboardController } from "./tune_clipboard_controller.js";

function createLibraryCrudDomain({
  api = null,
  state = {},
  actions = {},
} = {}) {
  let tuneClipboardController = null;

  const findTuneById = (tuneId) => tuneClipboardController
    ? tuneClipboardController.findTuneById(tuneId)
    : null;
  const getTuneText = (tune, fileMeta) => tuneClipboardController
    ? tuneClipboardController.getTuneText(tune, fileMeta)
    : "";
  const getClipboardTune = () => tuneClipboardController
    ? tuneClipboardController.getClipboardTune()
    : null;
  const setClipboardTune = (next) => tuneClipboardController
    ? tuneClipboardController.setClipboardTune(next)
    : null;
  const clearClipboardTune = () => {
    if (tuneClipboardController) tuneClipboardController.clearClipboardTune();
  };

  tuneClipboardController = createTuneClipboardController({
    state: {
      getLibraryIndex: state.getLibraryIndex,
    },
    actions: {
      readFile: actions.readFile,
      setBufferStatus: actions.setBufferStatus,
      setStatus: actions.setStatus,
      showSaveError: actions.showSaveError,
    },
  });

  const appendCurrentTuneAction = createAppendCurrentTuneAction({
    api,
    state: {
      getActiveFilePath: state.getActiveFilePath,
      getActiveTuneMeta: state.getActiveTuneMeta,
      getActiveTuneUid: state.getActiveTuneUid,
      getCurrentDocumentPath: state.getCurrentDocumentPath,
      getCurrentNavFilePath: state.getCurrentNavFilePath,
      getEditorText: state.getEditorText,
    },
    actions: {
      confirmAppendToFile: actions.confirmAppendToFile,
      ensureSafeToAbandonCurrentDoc: actions.ensureSafeToAbandonCurrentDoc,
      ensureXNumberInAbc: actions.ensureXNumberInAbc,
      getActiveFileEntry: actions.getActiveFileEntry,
      getNextXNumber: actions.getNextXNumber,
      markHeaderClean: actions.markHeaderClean,
      markDiskConflictPath: actions.markDiskConflictPath,
      parseTuneIdentityFields: actions.parseTuneIdentityFields,
      patchCurrentDocument: actions.patchCurrentDocument,
      pathsEqual: actions.pathsEqual,
      readFile: actions.readFile,
      refreshLibraryFile: actions.refreshLibraryFile,
      selectTune: actions.selectTune,
      setActiveFilePath: actions.libraryDocumentContext.setActiveFile,
      setIsNewTuneDraft: actions.setIsNewTuneDraft,
      setStatus: actions.setStatus,
      setDirtyIndicator: actions.setDirtyIndicator,
      showSaveError: actions.showSaveError,
      showToast: actions.showToast,
      updateHeaderStateUI: actions.updateHeaderStateUI,
      withFileLock: actions.withFileLock,
      writeFile: actions.writeFile,
    },
  });

  const newFileAction = createNewFileAction({
    api,
    actions: {
      confirmOverwrite: actions.confirmOverwrite,
      ensureSafeToAbandonCurrentDoc: actions.ensureSafeToAbandonCurrentDoc,
      ensureXNumberInAbc: actions.ensureXNumberInAbc,
      markDiskConflictPath: actions.markDiskConflictPath,
      fileExists: actions.fileExists,
      getDefaultSaveDir: actions.getDefaultSaveDir,
      getSuggestedBaseName: actions.getSuggestedBaseName,
      loadLibraryFileIntoEditor: actions.loadLibraryFileIntoEditor,
      mkdirp: actions.mkdirp,
      patchCurrentDocument: actions.patchCurrentDocument,
      refreshLibraryFile: actions.refreshLibraryFile,
      safeBasename: actions.safeBasename,
      safeDirname: actions.safeDirname,
      setActiveFilePath: actions.libraryDocumentContext.setActiveFile,
      setActiveTuneText: actions.libraryDocumentContext.setActiveTuneTextForLibrary,
      setDirtyIndicator: actions.setDirtyIndicator,
      setFileNameMeta: actions.setFileNameMeta,
      showSaveDialog: actions.showSaveDialog,
      showSaveError: actions.showSaveError,
      showToast: actions.showToast,
      stripFileExtension: actions.stripFileExtension,
      updateFileHeaderPanel: actions.updateFileHeaderPanel,
      updateWindowTitle: actions.updateWindowTitle,
      withFileLock: actions.withFileLock,
      writeFile: actions.writeFile,
    },
  });

  const deleteTuneAction = createDeleteTuneAction({
    state: {
      getLibraryIndex: state.getLibraryIndex,
      getActiveTuneId: state.getActiveTuneId,
      getRawMode: state.getRawMode,
    },
    actions: {
      clearActiveTune: actions.libraryDocumentContext.clearActiveTune,
      confirmDeleteTune: actions.confirmDeleteTune,
      ensureSafeToAbandonCurrentDoc: actions.ensureSafeToAbandonCurrentDoc,
      findTuneById,
      markCurrentDocumentClean: actions.markCurrentDocumentClean,
      markDiskConflictPath: actions.markDiskConflictPath,
      pathsEqual: actions.pathsEqual,
      refreshLibraryFile: actions.refreshLibraryFile,
      requireCleanForFileOp: actions.requireCleanForFileOp,
      readFile: actions.readFile,
      selectTune: actions.selectTune,
      setActiveFilePath: actions.libraryDocumentContext.setActiveFile,
      setDirtyIndicator: actions.setDirtyIndicator,
      showCleanFileDocument: actions.libraryDocumentContext.showCleanFileDocument,
      showSaveError: actions.showSaveError,
      withFileLock: actions.withFileLock,
      writeFile: actions.writeFile,
    },
  });

  const duplicateTuneAction = createDuplicateTuneAction({
    actions: {
      ensureCopyTitleInAbc: actions.ensureCopyTitleInAbc,
      findTuneById,
      markActiveTuneButton: actions.markActiveTuneButton,
      markDiskConflictPath: actions.markDiskConflictPath,
      pathsEqual: actions.pathsEqual,
      readFile: actions.readFile,
      refreshLibraryFile: actions.refreshLibraryFile,
      renumberXInTextKeepingFirst: actions.renumberXInTextKeepingFirst,
      requireCleanForFileOp: actions.requireCleanForFileOp,
      selectTune: actions.selectTune,
      setActiveFilePath: actions.libraryDocumentContext.setActiveFile,
      setActiveTuneId: actions.libraryDocumentContext.setActiveTuneIdOnly,
      setActiveTuneText: actions.libraryDocumentContext.setActiveTuneTextForLibrary,
      setStatus: actions.setStatus,
      showSaveError: actions.showSaveError,
      withFileLock: actions.withFileLock,
      writeFile: actions.writeFile,
    },
  });

  const pasteMoveTuneAction = createPasteMoveTuneAction({
    state: {
      getActiveFilePath: state.getActiveFilePath,
      getActiveTuneId: state.getActiveTuneId,
      getActiveTuneMeta: state.getActiveTuneMeta,
      getClipboardTune,
      getHeaderDirty: state.getHeaderDirty,
      getIsNewTuneDraft: state.getIsNewTuneDraft,
      hasGlobalUnsavedChanges: state.hasGlobalUnsavedChanges,
      isCurrentDocumentDirty: state.isCurrentDocumentDirty,
    },
    actions: {
      clearClipboardTune,
      confirmAppendToFile: actions.confirmAppendToFile,
      ensureXNumberInAbc: actions.ensureXNumberInAbc,
      findTuneById,
      getActiveEditFilePath: actions.getActiveEditFilePath,
      getNextXNumber: actions.getNextXNumber,
      getTuneText,
      markDiskConflictPath: actions.markDiskConflictPath,
      pathsEqual: actions.pathsEqual,
      readFile: actions.readFile,
      refreshLibraryFile: actions.refreshLibraryFile,
      removeTuneFromContent: actions.removeTuneFromContent,
      renumberXInTextKeepingFirst: actions.renumberXInTextKeepingFirst,
      requireCleanForFileOp: actions.requireCleanForFileOp,
      setActiveFilePath: actions.libraryDocumentContext.setActiveFile,
      setClipboardTune,
      setStatus: actions.setStatus,
      selectTune: actions.selectTune,
      showSaveError: actions.showSaveError,
      withFileLock: actions.withFileLock,
      withFileLocks: actions.withFileLocks,
      writeFile: actions.writeFile,
    },
  });

  const renumberXAction = createRenumberXAction({
    api,
    state: {
      getActiveFilePath: state.getActiveFilePath,
      getActiveTuneMeta: state.getActiveTuneMeta,
      getCurrentDocumentPath: state.getCurrentDocumentPath,
      getHeaderDirty: state.getHeaderDirty,
      getIsNewTuneDraft: state.getIsNewTuneDraft,
      getLibraryIndex: state.getLibraryIndex,
      getRawMode: state.getRawMode,
      isCurrentDocumentDirty: state.isCurrentDocumentDirty,
    },
    actions: {
      hasUnsavedChangesForFile: actions.hasUnsavedChangesForFile,
      loadLibraryFileIntoEditor: actions.loadLibraryFileIntoEditor,
      markCurrentDocumentClean: actions.markCurrentDocumentClean,
      markDiskConflictPath: actions.markDiskConflictPath,
      pathsEqual: actions.pathsEqual,
      patchCurrentDocument: actions.patchCurrentDocument,
      readFile: actions.readFile,
      refreshLibraryFile: actions.refreshLibraryFile,
      renumberXLinesConsecutive: actions.renumberXLinesConsecutive,
      setDirtyIndicator: actions.setDirtyIndicator,
      setStatus: actions.setStatus,
      showSaveError: actions.showSaveError,
      showToast: actions.showToast,
      withFileLock: actions.withFileLock,
      writeFile: actions.writeFile,
    },
  });

  return {
    appendCurrentTuneAction,
    clearClipboardTune,
    copyTuneById: (tuneId, mode) => tuneClipboardController.copyTuneById(tuneId, mode),
    deleteTuneAction,
    duplicateTuneAction,
    findTuneById,
    getClipboardTune,
    getTuneText,
    newFileAction,
    pasteMoveTuneAction,
    renumberXAction,
    setClipboardTune,
    tuneClipboardController,
  };
}

export {
  createLibraryCrudDomain,
};
