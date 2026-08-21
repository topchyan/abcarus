const { Menu } = require("electron");
const fs = require("fs");
const path = require("path");

function formatRecentLabel(entry) {
  const base = entry.basename || path.basename(entry.path || "");
  const x = entry.xNumber ? `X:${entry.xNumber}` : "X:";
  const title = entry.title ? ` ${entry.title}` : "";
  return `${base}  ${x}${title}`;
}

function splitPathEnv(raw) {
  return String(raw || "")
    .split(path.delimiter)
    .map((p) => String(p || "").trim())
    .filter(Boolean);
}

function normalizeExecutablePath(rawPath) {
  return String(rawPath || "").trim();
}

function executableCandidates(name) {
  const base = String(name || "").trim();
  if (!base) return [];
  if (process.platform !== "win32") return [base];
  const extRaw = String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM");
  const extList = extRaw
    .split(";")
    .map((ext) => String(ext || "").trim().toLowerCase())
    .filter(Boolean);
  const lower = base.toLowerCase();
  if (extList.some((ext) => lower.endsWith(ext))) return [base];
  return [base, ...extList.map((ext) => `${base}${ext}`)];
}

function hasExecutableSync(filePath) {
  const abs = normalizeExecutablePath(filePath);
  if (!abs) return false;
  try {
    if (process.platform === "win32") {
      fs.accessSync(abs, fs.constants.F_OK);
    } else {
      fs.accessSync(abs, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function resolveExecutableSync(configuredPath, names) {
  const configured = normalizeExecutablePath(configuredPath);
  if (configured && hasExecutableSync(configured)) return configured;
  const dirs = splitPathEnv(process.env.PATH);
  const candidates = Array.isArray(names) ? names : [names];
  for (const rawName of candidates) {
    for (const name of executableCandidates(rawName)) {
      for (const dir of dirs) {
        const candidatePath = path.join(dir, name);
        if (hasExecutableSync(candidatePath)) return candidatePath;
      }
    }
  }
  return "";
}

function canExportMp3(appState) {
  const settings = appState && appState.settings ? appState.settings : {};
  const timidity = resolveExecutableSync(settings.mp3ExportTimidityPath, ["timidity", "timidity++"]);
  const ffmpeg = resolveExecutableSync(settings.mp3ExportFfmpegPath, ["ffmpeg"]);
  return Boolean(timidity && ffmpeg);
}

function buildDiagnosticsSubmenu(appState, sendMenuAction) {
  const payloadEnabled = Boolean(appState && appState.settings && appState.settings.payloadModeEnabled);
  const debugFlags = (appState && appState.debugFlags) ? appState.debugFlags : {};
  const debugMessagesEnabled = Boolean(debugFlags.showMessages);
  const autoDumpEnabled = Boolean(debugFlags.autoDump);
  return [
    { label: "Save Debug Dump…", accelerator: "CmdOrCtrl+Shift+D", click: () => sendMenuAction("dumpDebug") },
    { role: "toggleDevTools", label: "Toggle Developer Tools" },
    { label: "Open Settings Folder", click: () => sendMenuAction("openSettingsFolder") },
    { type: "separator" },
    {
      label: "Options",
      submenu: [
        {
          label: "Debug Messages",
          type: "checkbox",
          checked: debugMessagesEnabled,
          click: (item) => {
            if (appState && appState.debugFlags) appState.debugFlags.showMessages = Boolean(item.checked);
            sendMenuAction({ type: "toggleDebugMessages", value: Boolean(item.checked) });
          },
        },
        {
          label: "Automatic Dumps",
          type: "checkbox",
          checked: autoDumpEnabled,
          click: (item) => {
            if (appState && appState.debugFlags) appState.debugFlags.autoDump = Boolean(item.checked);
            sendMenuAction({ type: "toggleAutoDump", value: Boolean(item.checked) });
          },
        },
      ],
    },
    ...(payloadEnabled ? [{ type: "separator" }, { label: "Payload Mode (Current Tune)…", click: () => sendMenuAction("openPayloadMode") }] : []),
  ];
}

function buildMenuTemplate(appState, sendMenuAction) {
  const recentFolders = appState.recentFolders.length
    ? appState.recentFolders.map((entry) => ({
        label: entry.label || entry.path,
        click: () => sendMenuAction({ type: "openRecentFolder", entry }),
      }))
    : [{ label: "No recent folders", enabled: false }];
  const recentFiles = appState.recentFiles.length
    ? appState.recentFiles.map((entry) => ({
        label: entry.basename || path.basename(entry.path || ""),
        click: () => sendMenuAction({ type: "openRecentFile", entry }),
      }))
    : [{ label: "No recent files", enabled: false }];
  const recentTunes = appState.recentTunes.length
    ? appState.recentTunes.map((entry) => ({
        label: formatRecentLabel(entry),
        click: () => sendMenuAction({ type: "openRecentTune", entry }),
      }))
    : [{ label: "No recent tunes", enabled: false }];

  const isMac = process.platform === "darwin";
  const replaceAccel = isMac ? "Cmd+Alt+F" : "Ctrl+H";

  const fileMenu = {
    label: "File",
    submenu: [
      { label: "New File", accelerator: "CmdOrCtrl+N", click: () => sendMenuAction("new") },
      {
        label: "Templates",
        submenu: [
          {
            label: "Templates Library…",
            click: () => sendMenuAction("templatesModal"),
          },
          {
            label: "New Tune From Template",
            accelerator: "CmdOrCtrl+Shift+N",
            click: () => sendMenuAction("newFromTemplate"),
          },
        ],
      },
      {
        label: "New Tune (Add to Active File)",
        accelerator: "CmdOrCtrl+Alt+N",
        click: () => sendMenuAction("newTune"),
      },
      { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => sendMenuAction("open") },
      {
        label: "Open Folder as Library…",
        accelerator: "CmdOrCtrl+Shift+O",
        click: () => sendMenuAction("openFolder"),
      },
      {
        label: "Import",
        submenu: [
          { label: "MusicXML…", click: () => sendMenuAction("importMusicXml") },
          { label: "MIDI…", click: () => sendMenuAction("importMidi") },
        ],
      },
      { type: "separator" },
      { label: "Recent Folders", submenu: recentFolders },
      { label: "Recent Files", submenu: recentFiles },
      { label: "Recent Tunes", submenu: recentTunes },
      { type: "separator" },
      { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendMenuAction("save") },
      { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => sendMenuAction("saveAs") },
      { label: "Revert to Disk", accelerator: "CmdOrCtrl+Alt+R", click: () => sendMenuAction("revertToDisk") },
      { type: "separator" },
      ...(process.platform === "linux"
        ? []
        : [{
          label: "Print Preview",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => sendMenuAction("printPreview"),
        }]),
      { label: "Print…", accelerator: "CmdOrCtrl+P", click: () => sendMenuAction("print") },
      { label: "Print All Tunes…", click: () => sendMenuAction("printAll") },
      {
        label: "Export",
        submenu: [
          { label: "PDF…", accelerator: "CmdOrCtrl+E", click: () => sendMenuAction("exportPdf") },
          { label: "PDF (All Tunes)…", click: () => sendMenuAction("exportPdfAll") },
          { type: "separator" },
          { label: "MusicXML…", accelerator: "CmdOrCtrl+Shift+E", click: () => sendMenuAction("exportMusicXml") },
          { label: "MusicXML (All Tunes)…", click: () => sendMenuAction("exportMusicXmlAll") },
          { label: "MIDI…", click: () => sendMenuAction("exportMidi") },
          { label: "MP3…", click: () => sendMenuAction("exportMp3"), enabled: canExportMp3(appState) },
        ],
      },
      { type: "separator" },
      { label: "Close File", accelerator: "CmdOrCtrl+W", click: () => sendMenuAction("close") },
      ...(isMac ? [] : [{ label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => sendMenuAction("quit") }]),
    ],
  };

  const editMenu = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { label: "Find…", accelerator: "CmdOrCtrl+F", click: () => sendMenuAction("find") },
      { label: "Replace…", accelerator: replaceAccel, click: () => sendMenuAction("replace") },
      { label: "Go to Line…", accelerator: "CmdOrCtrl+G", click: () => sendMenuAction("gotoLine") },
      { label: "Toggle Comment", accelerator: "CmdOrCtrl+/", click: () => sendMenuAction("toggleComment") },
      { label: "ABC Helpers…", accelerator: "Ctrl+F2", click: () => sendMenuAction("abcHelpers") },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac ? [{ role: "pasteAndMatchStyle" }] : []),
      { role: "selectAll" },
      ...(isMac
        ? []
        : [
          { type: "separator" },
          { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => sendMenuAction("settings") },
          { label: "Fonts…", accelerator: "F9", click: () => sendMenuAction("fonts") },
        ]),
    ],
  };

  const viewMenu = {
    label: "View",
    submenu: [
      ...(isMac ? [{ role: "togglefullscreen" }, { type: "separator" }] : []),
      { label: "Library Catalog…", accelerator: "CmdOrCtrl+Shift+L", click: () => sendMenuAction("libraryList") },
      { label: "Toggle Library", accelerator: "CmdOrCtrl+L", click: () => sendMenuAction("toggleLibrary") },
      { label: "Toggle File Header", accelerator: "CmdOrCtrl+Alt+H", click: () => sendMenuAction("toggleFileHeader") },
      { label: "Toggle Split Orientation", accelerator: "CmdOrCtrl+Alt+\\", click: () => sendMenuAction("toggleSplitOrientation") },
      {
        label: "Split Orientation",
        submenu: [
          { label: "Vertical", click: () => sendMenuAction({ type: "setSplitOrientation", value: "vertical" }) },
          { label: "Horizontal", click: () => sendMenuAction({ type: "setSplitOrientation", value: "horizontal" }) },
        ],
      },
      { type: "separator" },
      { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: () => sendMenuAction("zoomIn") },
      { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => sendMenuAction("zoomOut") },
      { label: "Reset Zoom", accelerator: "CmdOrCtrl+0", click: () => sendMenuAction("zoomReset") },
      { label: "Reset Layout", accelerator: "F8", click: () => sendMenuAction("resetLayout") },
    ],
  };

  const playMenu = {
    label: "Play",
    submenu: [
      { label: "Start Over", accelerator: "F4", click: () => sendMenuAction("playStart") },
      { label: "Play / Pause", accelerator: "F5", click: () => sendMenuAction("playToggle") },
      { label: "Focus Mode", accelerator: "F7", click: () => sendMenuAction("toggleFocusMode") },
      { label: "Go to Measure…", accelerator: "CmdOrCtrl+Shift+G", click: () => sendMenuAction("playGotoMeasure") },
      { type: "separator" },
      {
        label: "Options",
        submenu: [
          {
            label: "Notes While Typing",
            type: "checkbox",
            checked: Boolean(appState && appState.settings && appState.settings.noteTypingPreviewEnabled),
            click: (item) => {
              const next = Boolean(item && item.checked);
              if (appState && appState.settings) appState.settings.noteTypingPreviewEnabled = next;
              sendMenuAction({ type: "toggleNoteTypingPreview", value: next });
            },
          },
        ],
      },
    ],
  };

  const toolsMenu = {
    label: "Tools",
    submenu: [
      {
        label: "Transpose",
        submenu: [
          {
            label: "Up Semitone",
            accelerator: "CmdOrCtrl+Shift+Up",
            click: () => sendMenuAction("transformTransposeUp"),
          },
          {
            label: "Down Semitone",
            accelerator: "CmdOrCtrl+Shift+Down",
            click: () => sendMenuAction("transformTransposeDown"),
          },
        ],
      },
      {
        label: "Note Lengths",
        submenu: [
          {
            label: "Double",
            accelerator: "CmdOrCtrl+Shift+Right",
            click: () => sendMenuAction("transformDouble"),
          },
          {
            label: "Half",
            accelerator: "CmdOrCtrl+Shift+Left",
            click: () => sendMenuAction("transformHalf"),
          },
        ],
      },
      {
        label: "Turkish Notation",
        submenu: [
          {
            label: "To Concert",
            accelerator: "CmdOrCtrl+Shift+0",
            click: () => sendMenuAction("transformTurkishToConcert"),
          },
          {
            label: "To Bolahenk",
            accelerator: "CmdOrCtrl+Shift+9",
            click: () => sendMenuAction("transformTurkishToBolahenk"),
          },
        ],
      },
      {
        label: "Bar Layout",
        submenu: [
          {
            label: "Measures per Line",
            submenu: [
              ...Array.from({ length: 9 }, (_value, index) => {
                const value = index + 1;
                return {
                  label: String(value),
                  accelerator: `CmdOrCtrl+Alt+${value}`,
                  click: () => sendMenuAction({ type: "transformMeasures", value }),
                };
              }),
            ],
          },
          {
            label: "Reflow by Linebreak Marker",
            click: () => sendMenuAction("transformLinebreakMarkers"),
          },
          {
            label: "Align Bars",
            accelerator: "CmdOrCtrl+Shift+A",
            click: () => sendMenuAction("alignBars"),
          },
        ],
      },
      { type: "separator" },
      { label: "Library Metadata…", click: () => sendMenuAction("libraryMetadata") },
      {
        label: "Set List",
        submenu: [
          {
            label: "Show/Hide Panel",
            accelerator: "F6",
            click: () => sendMenuAction("toggleSetList"),
          },
          {
            label: "Print Active Set List…",
            accelerator: "CmdOrCtrl+Alt+P",
            click: () => sendMenuAction("printSetList"),
          },
        ],
      },
      {
        label: "Source Links",
        submenu: [
          { label: "Update YouTube Metadata (Active File)…", click: () => sendMenuAction("updateYouTubeMetadata") },
        ],
      },
      ...((appState && appState.settings && (appState.settings.supportMicrotonalNotation || appState.settings.makamToolsEnabled || appState.settings.studyToolsEnabled))
        ? [
            {
              label: "Study",
              submenu: [
                {
                  label: "Intonation Explorer…",
                  click: () => sendMenuAction("openIntonationExplorer"),
                },
              ],
            },
          ]
        : []),
      {
        label: "Renumber X (Active File)…",
        accelerator: "CmdOrCtrl+Shift+X",
        click: () => sendMenuAction("renumberXInFile"),
      },
    ],
  };

  const helpMenu = {
    label: "Help",
    role: isMac ? "help" : undefined,
    submenu: [
      { label: "ABC Guide", accelerator: "F1", click: () => sendMenuAction("helpGuide") },
      { label: "ABCarus User Guide", click: () => sendMenuAction("helpUserGuide") },
      { type: "separator" },
      { label: "ABC Notation Homepage", click: () => sendMenuAction({ type: "helpLink", url: "https://abcnotation.com/" }) },
      { label: "abc2svg / abcm2ps Reference (Jef Moine)", click: () => sendMenuAction({ type: "helpLink", url: "http://moinejf.free.fr/abcm2ps-doc/index.html" }) },
      { label: "ABCusers (Groups.io)", click: () => sendMenuAction({ type: "helpLink", url: "https://groups.io/g/abcusers/topics" }) },
      { label: "ABCNotation User Group (Facebook)", click: () => sendMenuAction({ type: "helpLink", url: "https://www.facebook.com/groups/498671610282070" }) },
      { type: "separator" },
      { label: "Report an Issue…", click: () => sendMenuAction({ type: "helpLink", url: "https://github.com/topchyan/abcarus/issues/new/choose" }) },
      { type: "separator" },
      { label: "Diagnostics", submenu: buildDiagnosticsSubmenu(appState, sendMenuAction) },
      ...(isMac ? [] : [{ type: "separator" }, { label: "About", click: () => sendMenuAction("about") }]),
    ],
  };

	  const macAppMenu = isMac
	    ? {
	      label: appState && appState.name ? appState.name : "ABCarus",
	      submenu: [
	        { role: "about", label: "About ABCarus" },
	        { type: "separator" },
	        { label: "Settings…", accelerator: "Cmd+,", click: () => sendMenuAction("settings") },
	        { label: "Fonts…", accelerator: "F9", click: () => sendMenuAction("fonts") },
	        { type: "separator" },
	        { role: "services" },
	        { type: "separator" },
	        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    }
    : null;

  const macWindowMenu = isMac
    ? {
      label: "Window",
      role: "windowMenu",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    }
    : null;

  return [
    ...(macAppMenu ? [macAppMenu] : []),
    {
      ...fileMenu,
    },
    {
      ...editMenu,
    },
    {
      ...viewMenu,
    },
    playMenu,
    toolsMenu,
    ...(macWindowMenu ? [macWindowMenu] : []),
    helpMenu,
  ];
}

function applyMenu(appState, sendMenuAction) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(appState, sendMenuAction)));
}

module.exports = { applyMenu };
