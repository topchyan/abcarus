#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import {
  buildRendererStyleBundle,
  rendererStyleModulePaths,
} from "./renderer_style_manifest.mjs";

const sources = await Promise.all(rendererStyleModulePaths.map((filePath) => readFile(filePath, "utf8")));
await writeFile("src/renderer/style.css", buildRendererStyleBundle(sources), "utf8");
