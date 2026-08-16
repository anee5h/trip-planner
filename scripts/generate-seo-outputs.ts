#!/usr/bin/env tsx
/**
 * KAI-68 SEO output generator.
 *
 * Runs after `vite build`. Writes into dist/:
 *   - destinations/<id>/index.html   prerendered page per canonical
 *                                    destination, EN + JA (KAI-97: status is
 *                                    a quality signal, not an indexability
 *                                    gate — the full catalogue is indexed)
 *   - sitemap.xml                    public hub paths + all canonical
 *                                    destinations
 *   - data/kai68-public-destinations.json  manifest for the Pages Function
 *
 * Determinism (GEN-002 pattern, mirrors scripts/catalog/generate-outputs.ts):
 *   - inputs are the built dist/index.html shell + the committed catalogue
 *   - outputs are sorted by destination id, no timestamps, fixed formatting
 *
 * Modes:
 *   generate (default)  writes outputs into dist/, exits 1 on any failure
 *   --check             regenerates in memory and byte-compares against the
 *                       existing dist/ outputs; exits 1 on any mismatch or
 *                       missing file. Never touches the tree.
 *
 * Failure contract: a destination with missing canonical content (name,
 * description, heroImage) fails the build — an empty prerender must never
 * ship silently.
 */

import fs from "fs";
import path from "path";
import {
  buildPrerenderOutputs,
  loadPrerenderDestinations,
} from "../src/seo/prerender.js";

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SHELL_PATH = path.join(DIST_DIR, "index.html");
const OUTPUT_PATHS = ["/sitemap.xml", "/data/kai68-public-destinations.json"];

function log(message: string): void {
  console.log(`[kai-68] ${message}`);
}

function fail(message: string): never {
  console.error(`[kai-68] ERROR: ${message}`);
  process.exit(1);
}

interface Generated {
  outputs: Map<string, string>;
  totalCount: number;
}

function generate(): Generated {
  const shell = fs.readFileSync(SHELL_PATH, "utf8");
  if (!shell.includes('<div id="root"></div>')) {
    fail(
      `dist/index.html is missing the #root mount point; run "npm run build" first.`,
    );
  }
  const destinations = loadPrerenderDestinations();
  if (destinations.length === 0) {
    fail("catalogue is empty; refusing to generate an empty prerender set.");
  }
  const outputs = buildPrerenderOutputs(shell, destinations);
  return { outputs, totalCount: destinations.length };
}

function writeOutputs(generated: Generated): void {
  for (const [outputPath, content] of generated.outputs) {
    const absolute = path.join(DIST_DIR, outputPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  log(
    `wrote ${generated.outputs.size} outputs ` +
      `(${generated.totalCount} canonical destinations indexed).`,
  );
}

function check(generated: Generated): void {
  const mismatches: string[] = [];
  for (const outputPath of OUTPUT_PATHS) {
    const absolute = path.join(DIST_DIR, outputPath);
    if (!fs.existsSync(absolute)) {
      mismatches.push(`${outputPath}: MISSING`);
      continue;
    }
    const committed = fs.readFileSync(absolute, "utf8");
    const fresh = generated.outputs.get(outputPath);
    if (committed !== fresh) mismatches.push(`${outputPath}: STALE`);
  }
  for (const outputPath of generated.outputs.keys()) {
    if (OUTPUT_PATHS.includes(outputPath)) continue;
    const absolute = path.join(DIST_DIR, outputPath);
    if (!fs.existsSync(absolute)) {
      mismatches.push(`${outputPath}: MISSING`);
      continue;
    }
    const committed = fs.readFileSync(absolute, "utf8");
    const fresh = generated.outputs.get(outputPath);
    if (committed !== fresh) mismatches.push(`${outputPath}: STALE`);
  }
  if (mismatches.length > 0) {
    console.error(
      `[kai-68] SEO outputs out of date (${mismatches.length}):\n` +
        mismatches.map((m) => `  - ${m}`).join("\n") +
        `\nRun "npm run build" (or npm run seo:generate) to refresh.`,
    );
    process.exit(1);
  }
  log(
    `check passed: ${generated.outputs.size} outputs byte-identical ` +
      `(${generated.totalCount} canonical destinations indexed).`,
  );
}

const isCheck = process.argv.includes("--check");

if (isCheck) {
  check(generate());
} else {
  writeOutputs(generate());
}
