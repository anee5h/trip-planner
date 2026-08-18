#!/usr/bin/env node
/**
 * KAI-121: copy catalogue assets into public/ for runtime lazy fetch.
 *
 * The full destinations index (~6.5 MB) must NOT be part of the JS module
 * graph (any import — static, dynamic, or ?url — makes Vite emit a chunk
 * that lands in the entry closure / preload set). Instead it lives in
 * public/data/ as a plain static asset and is fetched at runtime by
 * loadDestinationsIndex() only when a full-data consumer needs it.
 *
 * The committed source stays src/shared/data/destinations-index.json
 * (single source of truth); this step publishes a deployable copy.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, "src/shared/data/destinations-index.json");
const DEST_DIR = path.join(ROOT, "public/data");
const DEST = path.join(DEST_DIR, "destinations-index.json");

if (!existsSync(SRC)) {
  console.error(`copy-catalogue-assets: missing ${SRC}`);
  process.exit(1);
}
mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(SRC, DEST);
console.log(`copy-catalogue-assets: ${path.basename(SRC)} -> public/data/`);
