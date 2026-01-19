import { build } from "esbuild";

async function main() {
  const res = await build({
    entryPoints: ["src/renderer/renderer.js"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    logLevel: "silent",
  });

  if (!res || !Array.isArray(res.outputFiles) || res.outputFiles.length === 0) {
    throw new Error("Renderer build produced no output.");
  }
}

main().catch((err) => {
  process.stderr.write(`Renderer build check failed: ${err?.stack || err}\n`);
  process.exitCode = 1;
});

