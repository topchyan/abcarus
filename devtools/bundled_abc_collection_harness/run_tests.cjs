const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { copyBundledAbcCollection } = require("../../src/main/bundled_abc_collection");

(async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "abcarus-abc-collection-"));
  try {
    const corpus = path.join(root, "corpus");
    const destinationParent = path.join(root, "destination");
    await fs.promises.mkdir(path.join(corpus, "group"), { recursive: true });
    await fs.promises.mkdir(destinationParent, { recursive: true });
    await fs.promises.writeFile(path.join(corpus, "group", "one.abc"), "X:1\nK:C\nC|");
    await fs.promises.writeFile(path.join(corpus, "group", "license.txt"), "license");
    await fs.promises.writeFile(path.join(corpus, "ignored.xml"), "<score/>");

    const first = await copyBundledAbcCollection({ fs, path, corpusRoot: corpus, destinationParent, version: "test" });
    assert.equal(first.ok, true);
    assert.equal(first.count, 1);
    assert.equal(fs.existsSync(path.join(first.root, "group", "one.abc")), true);
    assert.equal(fs.existsSync(path.join(first.root, "group", "license.txt")), true);
    assert.equal(fs.existsSync(path.join(first.root, "ignored.xml")), false);
    assert.match(await fs.promises.readFile(path.join(first.root, "README.txt"), "utf8"), /editable copies/);

    const second = await copyBundledAbcCollection({ fs, path, corpusRoot: corpus, destinationParent });
    assert.notEqual(second.root, first.root);
    assert.equal(path.basename(second.root), "music21 ABC Collection (2)");
    console.log("bundled ABC collection tests: OK");
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
