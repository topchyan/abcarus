import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let Resvg;
try {
  ({ Resvg } = await import("@resvg/resvg-js"));
} catch (err) {
  console.error("Missing dependency: @resvg/resvg-js. Run `npm install` first.");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const iconPath = path.join(root, "assets", "brand", "abcarus-icon.svg");
const outDir = path.join(root, "assets", "brand", "png");
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];

function assertNoDisallowedSvg(svg) {
  const checks = [
    { re: /<filter\b/i, label: "filter" },
    { re: /<linearGradient\b/i, label: "linearGradient" },
    { re: /<radialGradient\b/i, label: "radialGradient" },
    { re: /<image\b/i, label: "image" },
    { re: /data:image\//i, label: "embedded raster image" },
    { re: /<text\b/i, label: "text element" },
  ];
  for (const check of checks) {
    if (check.re.test(svg)) {
      throw new Error(`SVG validation failed: found ${check.label}.`);
    }
  }
}

function readPngSize(buffer) {
  if (buffer.length < 24) throw new Error("PNG too small to read header.");
  const signature = buffer.slice(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("Invalid PNG signature.");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

if (!fs.existsSync(iconPath)) {
  throw new Error(`Icon SVG not found: ${iconPath}`);
}

const svg = fs.readFileSync(iconPath, "utf8");
assertNoDisallowedSvg(svg);

fs.mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const pngData = resvg.render();
  const buffer = pngData.asPng();
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, buffer);
  const dims = readPngSize(buffer);
  if (dims.width !== size || dims.height !== size) {
    throw new Error(`Unexpected PNG size for ${outPath}: ${dims.width}x${dims.height}`);
  }
}

for (const size of sizes) {
  const outPath = path.join(outDir, `icon-${size}.png`);
  if (!fs.existsSync(outPath)) {
    throw new Error(`Missing PNG output: ${outPath}`);
  }
}

console.log(`Generated ${sizes.length} icons in ${outDir}`);
