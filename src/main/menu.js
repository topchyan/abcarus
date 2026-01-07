const { Menu } = require("electron");
const path = require("path");

function formatRecentLabel(entry) {
  const base = entry.basename || path.basename(entry.path || "");
  const x = entry.xNumber ? `X:${entry.xNumber}` : "X:";
  const title = entry.title ? ` ${entry.title}` : "";
  return `${base}  ${x}${title}`;
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

  return [
    {
      label: "File",
      submenu: [
        { label: "New File", accelerator: "CmdOrCtrl+N", click: () => sendMenuAction("new") },
        {
          label: "New Tune From Template",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendMenuAction("newFromTemplate"),
        },
        {
          label: "New Tune (Draft in Active File)",
          accelerator: "CmdOrCtrl+Alt+N",
          click: () => sendMenuAction("newTune"),
        },
        { label: "Open", accelerator: "CmdOrCtrl+O", click: () => sendMenuAction("open") },
        {
          label: "Open Folder",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => sendMenuAction("openFolder"),
        },
        {
          label: "Import",
          submenu: [
            { label: "MusicXML…", click: () => sendMenuAction("importMusicXml") },
          ],
        },
        { type: "separator" },
        { label: "Recent Folders", submenu: recentFolders },
        { label: "Recent Files", submenu: recentFiles },
        { label: "Recent Tunes", submenu: recentTunes },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendMenuAction("save") },
        { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => sendMenuAction("saveAs") },
        { label: "Append to Active File…", click: () => sendMenuAction("appendToActiveFile") },
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
          label: "Export PDF…",
          accelerator: "CmdOrCtrl+E",
          click: () => sendMenuAction("exportPdf"),
        },
        { label: "Export PDF (All Tunes)…", click: () => sendMenuAction("exportPdfAll") },
        {
          label: "Export MusicXML…",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => sendMenuAction("exportMusicXml"),
        },
        { type: "separator" },
        { label: "Close", accelerator: "CmdOrCtrl+W", click: () => sendMenuAction("close") },
        { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => sendMenuAction("quit") },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { label: "Find…", accelerator: "CmdOrCtrl+F", click: () => sendMenuAction("find") },
        { label: "Replace…", accelerator: "CmdOrCtrl+H", click: () => sendMenuAction("replace") },
        { label: "Go to Line…", accelerator: "CmdOrCtrl+G", click: () => sendMenuAction("gotoLine") },
        { label: "Toggle Comment", accelerator: "CmdOrCtrl+/", click: () => sendMenuAction("toggleComment") },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "toggleDevTools" },
        { type: "separator" },
        { label: "Library Catalog…", accelerator: "CmdOrCtrl+Shift+L", click: () => sendMenuAction("libraryList") },
        { label: "Toggle Library", accelerator: "CmdOrCtrl+L", click: () => sendMenuAction("toggleLibrary") },
        { label: "Toggle File Header", accelerator: "Alt+H", click: () => sendMenuAction("toggleFileHeader") },
        { type: "separator" },
        { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: () => sendMenuAction("zoomIn") },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => sendMenuAction("zoomOut") },
        { label: "Reset Zoom", accelerator: "CmdOrCtrl+0", click: () => sendMenuAction("zoomReset") },
        { label: "Reset Layout", accelerator: "F8", click: () => sendMenuAction("resetLayout") },
        { type: "separator" },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => sendMenuAction("settings") },
      ],
    },
    {
      label: "Play",
      submenu: [
        { label: "Start Over", accelerator: "F4", click: () => sendMenuAction("playStart") },
        { label: "Play / Pause", accelerator: "F5", click: () => sendMenuAction("playToggle") },
        { label: "Previous Measure", click: () => sendMenuAction("playPrev") },
        { label: "Next Measure", click: () => sendMenuAction("playNext") },
      ],
    },
    {
      label: "Tools",
      submenu: [
        {
          label: "Transform",
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
              label: "Measures per Line",
              submenu: [
                ...Array.from({ length: 9 }, (_value, index) => {
                  const value = index + 1;
                  return {
                    label: String(value),
                    click: () => sendMenuAction({ type: "transformMeasures", value }),
                  };
                }),
              ],
            },
          ],
        },
        { type: "separator" },
        {
          label: "Renumber X (Active File)…",
          accelerator: "CmdOrCtrl+Shift+X",
          click: () => sendMenuAction("renumberXInFile"),
        },
        { label: "Align Bars", accelerator: "CmdOrCtrl+Shift+A", click: () => sendMenuAction("alignBars") },
        { type: "separator" },
        { label: "Save Debug Dump…", accelerator: "CmdOrCtrl+Shift+D", click: () => sendMenuAction("dumpDebug") },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "ABC Guide (F1)", accelerator: "F1", click: () => sendMenuAction("helpGuide") },
        { type: "separator" },
        { label: "ABC Notation Homepage", click: () => sendMenuAction({ type: "helpLink", url: "https://abcnotation.com/" }) },
        { label: "ABCusers (Groups.io)", click: () => sendMenuAction({ type: "helpLink", url: "https://groups.io/g/abcusers/topics" }) },
        { label: "ABCNotation User Group (Facebook)", click: () => sendMenuAction({ type: "helpLink", url: "https://www.facebook.com/groups/498671610282070" }) },
        { type: "separator" },
        { label: "About", click: () => sendMenuAction("about") },
      ],
    },
  ];
}

function applyMenu(appState, sendMenuAction) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(appState, sendMenuAction)));
}

module.exports = { applyMenu };
