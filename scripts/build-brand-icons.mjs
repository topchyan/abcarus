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
const iconSmallPath = path.join(root, "assets", "brand", "abcarus-icon-small.svg");
const outDir = path.join(root, "assets", "brand", "png");
const sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];
const legacyIconsDir = path.join(root, "assets", "icons");
const iconsetDir = path.join(legacyIconsDir, "ABCarus.iconset");

const ICONSET_ENTRIES = [
  { src: 16, name: "icon_16x16.png" },
  { src: 32, name: "icon_16x16@2x.png" },
  { src: 32, name: "icon_32x32.png" },
  { src: 64, name: "icon_32x32@2x.png" },
  { src: 128, name: "icon_128x128.png" },
  { src: 256, name: "icon_128x128@2x.png" },
  { src: 256, name: "icon_256x256.png" },
  { src: 512, name: "icon_256x256@2x.png" },
  { src: 512, name: "icon_512x512.png" },
  { src: 1024, name: "icon_512x512@2x.png" },
];

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

const svgLarge = fs.readFileSync(iconPath, "utf8");
assertNoDisallowedSvg(svgLarge);

let svgSmall = null;
if (fs.existsSync(iconSmallPath)) {
  svgSmall = fs.readFileSync(iconSmallPath, "utf8");
  assertNoDisallowedSvg(svgSmall);
}

fs.mkdirSync(outDir, { recursive: true });

const iconBuffers = new Map();

for (const size of sizes) {
  const svg = svgSmall && size <= 16 ? svgSmall : svgLarge;
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const pngData = resvg.render();
  const buffer = pngData.asPng();
  iconBuffers.set(size, buffer);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, buffer);
  const dims = readPngSize(buffer);
  if (dims.width !== size || dims.height !== size) {
    throw new Error(`Unexpected PNG size for ${outPath}: ${dims.width}x${dims.height}`);
  }
}

if (process.env.ABCARUS_WRITE_LEGACY_ICONS === "1") {
  fs.mkdirSync(legacyIconsDir, { recursive: true });
  for (const size of sizes) {
    const buffer = iconBuffers.get(size);
    if (!buffer) continue;
    const outPath = path.join(legacyIconsDir, `abcarus_${size}.png`);
    fs.writeFileSync(outPath, buffer);
  }
  const icon512 = iconBuffers.get(512);
  if (icon512) {
    fs.writeFileSync(path.join(legacyIconsDir, "icon.png"), icon512);
  }

  fs.mkdirSync(iconsetDir, { recursive: true });
  for (const entry of ICONSET_ENTRIES) {
    const buffer = iconBuffers.get(entry.src);
    if (!buffer) continue;
    fs.writeFileSync(path.join(iconsetDir, entry.name), buffer);
  }
}

for (const size of sizes) {
  const outPath = path.join(outDir, `icon-${size}.png`);
  if (!fs.existsSync(outPath)) {
    throw new Error(`Missing PNG output: ${outPath}`);
  }
}

console.log(`Generated ${sizes.length} icons in ${outDir}`);
