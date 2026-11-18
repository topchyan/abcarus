import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prunePythonRuntime } from "../../scripts/python_runtime_prune_lib.mjs";

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "abcarus-python-prune-"));
try {
  const site = path.join(root, "lib", "python3.11", "site-packages");
  const corpus = path.join(site, "music21", "corpus");
  await fs.promises.mkdir(path.join(corpus, "abc-set"), { recursive: true });
  await fs.promises.mkdir(path.join(corpus, "xml-set"), { recursive: true });
  await fs.promises.mkdir(path.join(site, "music21", "tests"), { recursive: true });
  await fs.promises.mkdir(path.join(site, "music21", "test"), { recursive: true });
  await fs.promises.mkdir(path.join(site, "numpy", "__pycache__"), { recursive: true });
  await fs.promises.mkdir(path.join(root, "unrelated", "tests"), { recursive: true });
  await fs.promises.writeFile(path.join(corpus, "__init__.py"), "");
  await fs.promises.writeFile(path.join(corpus, "license.txt"), "license");
  await fs.promises.writeFile(path.join(corpus, "abc-set", "tunes.abc"), "X:1\nK:C\nC|");
  await fs.promises.writeFile(path.join(corpus, "abc-set", "license.txt"), "license");
  await fs.promises.writeFile(path.join(corpus, "xml-set", "score.xml"), "<score/>");
  await fs.promises.writeFile(path.join(site, "music21", "tests", "test_x.py"), "");
  await fs.promises.writeFile(path.join(site, "music21", "test", "testRunner.py"), "runtime dependency");
  await fs.promises.writeFile(path.join(site, "numpy", "__pycache__", "x.pyc"), "cache");
  await fs.promises.writeFile(path.join(root, "unrelated", "tests", "keep.txt"), "keep");

  const result = await prunePythonRuntime(root);
  assert.equal(result.corpusAbcFiles, 1);
  assert.equal(fs.existsSync(path.join(corpus, "abc-set", "tunes.abc")), true);
  assert.equal(fs.existsSync(path.join(corpus, "abc-set", "license.txt")), true);
  assert.equal(fs.existsSync(path.join(corpus, "__init__.py")), true);
  assert.equal(fs.existsSync(path.join(corpus, "xml-set", "score.xml")), false);
  assert.equal(fs.existsSync(path.join(site, "music21", "tests")), false);
  assert.equal(fs.existsSync(path.join(site, "music21", "test", "testRunner.py")), true);
  assert.equal(fs.existsSync(path.join(site, "numpy", "__pycache__")), false);
  assert.equal(fs.existsSync(path.join(root, "unrelated", "tests", "keep.txt")), true);
  console.log("python runtime prune tests: OK");
} finally {
  await fs.promises.rm(root, { recursive: true, force: true });
}
