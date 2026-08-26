const assert = require("assert").strict;
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  PROFILE_VERSION,
  composeStateDocument,
  loadStateDocument,
  loadProfileDocument,
  parseProfileDocument,
  saveStateDocument,
  serializeProfileDocument,
  splitStateDocument,
} = require("../../src/main/state_store");

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abcarus-state-store-"));
  const filePath = path.join(dir, "abcarus-profile.json");
  try {
    const first = composeStateDocument({ lastFolder: "/music", settings: { renderZoom: 1 } }, { futureField: "keep" });
    await saveStateDocument({ fs, path, filePath, data: first });
    assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).profileVersion, PROFILE_VERSION);
    assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).stateVersion, undefined);

    const second = composeStateDocument({ lastFolder: "/scores", settings: { renderZoom: 1.2 } }, { futureField: "keep" });
    await saveStateDocument({ fs, path, filePath, data: second });
    assert.equal(JSON.parse(fs.readFileSync(`${filePath}.bak`, "utf8")).lastFolder, "/music");

    const retryPath = path.join(dir, "retry-profile.json");
    fs.writeFileSync(retryPath, JSON.stringify(first), "utf8");
    let transientRenameFailures = 0;
    const retryFs = {
      ...fs,
      promises: {
        ...fs.promises,
        rename: async (from, to) => {
          if (to === retryPath && transientRenameFailures < 2) {
            transientRenameFailures += 1;
            const error = new Error("simulated Windows file lock");
            error.code = "EPERM";
            throw error;
          }
          return fs.promises.rename(from, to);
        },
      },
    };
    await saveStateDocument({ fs: retryFs, path, filePath: retryPath, data: second });
    assert.equal(transientRenameFailures, 2, "transient profile replacement failures must be retried");
    assert.equal(JSON.parse(fs.readFileSync(retryPath, "utf8")).lastFolder, "/scores");

    const lockedBackupPath = path.join(dir, "locked-backup-profile.json");
    fs.writeFileSync(lockedBackupPath, JSON.stringify(first), "utf8");
    const lockedBackupFs = {
      ...fs,
      promises: {
        ...fs.promises,
        writeFile: async (target, ...args) => {
          if (String(target).includes(`${path.basename(lockedBackupPath)}.bak`)) {
            const error = new Error("simulated locked backup");
            error.code = "EACCES";
            throw error;
          }
          return fs.promises.writeFile(target, ...args);
        },
      },
    };
    await saveStateDocument({ fs: lockedBackupFs, path, filePath: lockedBackupPath, data: second });
    assert.equal(
      JSON.parse(fs.readFileSync(lockedBackupPath, "utf8")).lastFolder,
      "/scores",
      "a locked backup must not block the canonical profile write",
    );

    fs.writeFileSync(filePath, "{ broken", "utf8");
    const recovered = await loadStateDocument({ fs, filePath });
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.source, "backup");
    assert.equal(recovered.data.lastFolder, "/music");
    await saveStateDocument({ fs, path, filePath, data: recovered.data, skipBackup: true });
    assert.equal(JSON.parse(fs.readFileSync(`${filePath}.bak`, "utf8")).lastFolder, "/music");

    const split = splitStateDocument({
      lastFolder: "/scores",
      globalHeaderMigrationVersion: 1,
      futureField: { enabled: true },
      stateVersion: 99,
    });
    assert.deepEqual(split.known, {
      lastFolder: "/scores",
      globalHeaderMigrationVersion: 1,
      stateVersion: 99,
    });
    assert.deepEqual(split.extras, { futureField: { enabled: true } });
    assert.deepEqual(composeStateDocument(split.known, split.extras), {
      futureField: { enabled: true },
      profileVersion: PROFILE_VERSION,
      lastFolder: "/scores",
      globalHeaderMigrationVersion: 1,
    });
    assert.equal(
      composeStateDocument({ settingsFile: { mode: "file", path: "/old/abcarus.properties" } }).settingsFile,
      undefined,
      "legacy attached properties path must not survive in the unified profile",
    );
    const transferText = serializeProfileDocument(composeStateDocument({ settings: { renderZoom: 1.25 } }));
    const transferred = parseProfileDocument(transferText);
    assert.equal(transferred.profileVersion, PROFILE_VERSION);
    assert.equal(transferred.settings.renderZoom, 1.25);
    assert.throws(() => parseProfileDocument('{"unrelated":true}'), /not an ABCarus profile/);

    const legacyPath = path.join(dir, "state.json");
    const migratedPath = path.join(dir, "fresh-profile.json");
    const settingsPath = path.join(dir, "settings-profile.json");
    const settingsDocument = composeStateDocument({
      settings: {
        abc2xmlArgs: "-x -y value",
        xml2abcArgs: "-x -b 3",
      },
    });
    await saveStateDocument({ fs, path, filePath: settingsPath, data: settingsDocument });
    const settingsReloaded = await loadProfileDocument({ fs, profilePath: settingsPath, legacyStatePath: legacyPath });
    assert.equal(settingsReloaded.data.settings.abc2xmlArgs, "-x -y value", "abc2xml flags must survive a profile write/read cycle");
    assert.equal(settingsReloaded.data.settings.xml2abcArgs, "-x -b 3", "xml2abc flags must survive a profile write/read cycle");

    fs.writeFileSync(legacyPath, JSON.stringify({ stateVersion: 1, settings: { renderZoom: 1.4 } }), "utf8");
    const legacyLoaded = await loadProfileDocument({ fs, profilePath: migratedPath, legacyStatePath: legacyPath });
    assert.equal(legacyLoaded.legacy, true);
    assert.equal(legacyLoaded.data.settings.renderZoom, 1.4);
    fs.writeFileSync(migratedPath, JSON.stringify({ profileVersion: 1, settings: { renderZoom: 0.9 } }), "utf8");
    const profileLoaded = await loadProfileDocument({ fs, profilePath: migratedPath, legacyStatePath: legacyPath });
    assert.equal(profileLoaded.legacy, false);
    assert.equal(profileLoaded.data.settings.renderZoom, 0.9, "canonical profile must win over legacy state.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("state store harness: all tests passed");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
