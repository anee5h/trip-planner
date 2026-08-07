/**
 * Shared catalogue output generator.
 *
 * GEN-001: This is the single implementation used by both
 *          scripts/sync-destination-details.ts (writes the files) and
 *          scripts/check-catalog-sync.ts (proves the committed files are
 *          current and that a second generation produces zero diff), so the
 *          local command and the CI check can never drift apart.
 * GEN-002: Output is deterministic: JSON.stringify with 2-space indent plus
 *          the repo's prettier formatting, key order inherited from the
 *          index records. A second generation is byte-identical.
 * GEN-003: Generation never touches the working tree when run through
 *          check-catalog-sync; it returns content so the check can compare
 *          against committed files without mutating anything.
 */

import fs from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";
import type { Destination } from "../../src/shared/types/destination.js";
import { buildDestinationsMeta } from "./meta.mjs";

export interface GeneratedCatalogueOutputs {
  /** Destination id → formatted detail file content. */
  detailFiles: Map<string, string>;
  /** Formatted destinations-meta.json content. */
  meta: string;
}

export interface GenerateOptions {
  rootDir?: string;
  indexPath?: string;
}

/** Format a generated JSON document with the repo's prettier config so that
 *  regeneration is idempotent (output matches what lint-staged would commit). */
async function formatJson(content: string, rootDir: string): Promise<string> {
  const config = (await resolveConfig(rootDir)) ?? {};
  return format(content, { ...config, parser: "json" });
}

export async function generateCatalogueOutputs(
  options: GenerateOptions = {},
): Promise<GeneratedCatalogueOutputs> {
  const rootDir = options.rootDir ?? process.cwd();
  const indexPath =
    options.indexPath ??
    path.join(rootDir, "src/shared/data/destinations-index.json");

  const destinations = JSON.parse(
    fs.readFileSync(indexPath, "utf-8"),
  ) as Destination[];

  const detailFiles = new Map<string, string>();
  for (const destination of destinations) {
    detailFiles.set(
      destination.id,
      await formatJson(`${JSON.stringify(destination, null, 2)}\n`, rootDir),
    );
  }
  const meta = await formatJson(
    `${JSON.stringify(buildDestinationsMeta(destinations), null, 2)}\n`,
    rootDir,
  );
  return { detailFiles, meta };
}
