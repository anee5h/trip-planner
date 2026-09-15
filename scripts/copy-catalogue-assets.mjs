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
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
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

// KAI-132: publish the lite (summary) catalogue as a runtime asset too.
// It must NOT be statically imported (that inlines 2.67 MB into the
// shared chunk); loadLiteIndex() fetches it by URL on catalogue routes.
const LITE_SRC = path.join(
  ROOT,
  "src/shared/data/destinations-index.lite.json",
);
const LITE_DEST = path.join(DEST_DIR, "destinations-index.lite.json");
if (!existsSync(LITE_SRC)) {
  console.error(`copy-catalogue-assets: missing ${LITE_SRC}`);
  process.exit(1);
}
copyFileSync(LITE_SRC, LITE_DEST);
console.log(
  `copy-catalogue-assets: ${path.basename(LITE_SRC)} -> public/data/`,
);
const RELATIONSHIP_SRC = path.join(
  ROOT,
  "src/shared/data/destination-relationships.json",
);
const RELATIONSHIP_DEST = path.join(DEST_DIR, "destination-relationships.json");
if (!existsSync(RELATIONSHIP_SRC)) {
  console.error(`copy-catalogue-assets: missing ${RELATIONSHIP_SRC}`);
  process.exit(1);
}
copyFileSync(RELATIONSHIP_SRC, RELATIONSHIP_DEST);
console.log(
  `copy-catalogue-assets: ${path.basename(RELATIONSHIP_SRC)} -> public/data/`,
);

// Cloudflare Pages rejects individual assets larger than 25 MiB. Keep the
// canonical Toei graph in source data, but publish it as a deterministic
// gzip-encoded JSON response so the browser can transparently decode it while
// the scheduled-transit loader continues to validate the original JSON bytes.
const TOEI_SRC = path.join(
  ROOT,
  "src/shared/data/transit/toei-oedo-gtfs-20260314.json",
);
const TRANSIT_DEST_DIR = path.join(ROOT, "public/data/transit");
const TOEI_DEST = path.join(
  TRANSIT_DEST_DIR,
  "toei-oedo-gtfs-20260314.json.gz",
);
if (!existsSync(TOEI_SRC)) {
  console.error(`copy-catalogue-assets: missing ${TOEI_SRC}`);
  process.exit(1);
}
mkdirSync(TRANSIT_DEST_DIR, { recursive: true });
writeFileSync(TOEI_DEST, gzipSync(readFileSync(TOEI_SRC), { level: 9 }));
console.log(
  `copy-catalogue-assets: ${path.basename(TOEI_SRC)} -> public/data/transit/${path.basename(TOEI_DEST)}`,
);
