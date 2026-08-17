/**
 * check:catalog-sync — generated-file currency and idempotency check.
 *
 * Regenerates every public/data/destinations/<id>.json file,
 * destinations-meta.json, and destinations-index.lite.json from the index
 * IN MEMORY (never touching the
 * working tree) using the same generator as `sync-destination-details`
 * (scripts/catalog/generate-outputs.ts), then:
 *
 *   1. compares generated content byte-for-byte with the committed files —
 *      any difference means the committed generated output is stale;
 *   2. generates a second time and compares the two generations — any
 *      difference means the generator is not idempotent.
 *
 * Source/detail/meta field consistency is additionally enforced by the audit
 * (category E, SYNC_* findings) inside check:catalog-warnings.
 *
 * Exit codes: 0 pass, 1 fail. Read-only.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { generateCatalogueOutputs } from "./catalog/generate-outputs.js";

export interface SyncCheckOptions {
  rootDir?: string;
}

export interface SyncComparison {
  /** Output keys (detail:<id> or meta) whose committed file differs from a
   *  fresh generation, or that exist on only one side. */
  stale: string[];
  /** Output keys whose second generation differs from the first. */
  changedOnRegen: string[];
}

export function compareGeneratedOutputs(
  committed: Map<string, string>,
  firstGeneration: Map<string, string>,
  secondGeneration: Map<string, string>,
): SyncComparison {
  const stale: string[] = [];
  for (const key of new Set([...committed.keys(), ...firstGeneration.keys()])) {
    if (committed.get(key) !== firstGeneration.get(key)) stale.push(key);
  }
  const changedOnRegen: string[] = [];
  for (const key of firstGeneration.keys()) {
    if (firstGeneration.get(key) !== secondGeneration.get(key)) {
      changedOnRegen.push(key);
    }
  }
  return { stale: stale.sort(), changedOnRegen: changedOnRegen.sort() };
}

export function outputKeyDisplayName(key: string): string {
  if (key === "meta") return "src/shared/data/destinations-meta.json";
  if (key === "client-index") {
    return "src/shared/data/destinations-index.lite.json";
  }
  return `public/data/destinations/${key.slice("detail:".length)}.json`;
}

/** Flattens generated outputs into the "detail:<id>" / "meta" key space. */
export function toOutputMap(o: {
  detailFiles: Map<string, string>;
  meta: string;
  clientIndex: string;
}): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, content] of o.detailFiles) {
    map.set(`detail:${id}`, content);
  }
  map.set("meta", o.meta);
  map.set("client-index", o.clientIndex);
  return map;
}

export function loadCommittedOutputs(rootDir: string): Map<string, string> {
  const committed = new Map<string, string>();
  const detailsDir = path.join(rootDir, "public/data/destinations");
  if (fs.existsSync(detailsDir)) {
    for (const file of fs.readdirSync(detailsDir).sort()) {
      if (!file.endsWith(".json")) continue;
      committed.set(
        `detail:${file.slice(0, -".json".length)}`,
        fs.readFileSync(path.join(detailsDir, file), "utf-8"),
      );
    }
  }
  const metaPath = path.join(rootDir, "src/shared/data/destinations-meta.json");
  committed.set("meta", fs.readFileSync(metaPath, "utf-8"));
  const clientIndexPath = path.join(
    rootDir,
    "src/shared/data/destinations-index.lite.json",
  );
  committed.set("client-index", fs.readFileSync(clientIndexPath, "utf-8"));
  return committed;
}

export async function runSyncCheck(
  options: SyncCheckOptions = {},
): Promise<number> {
  const rootDir = options.rootDir ?? process.cwd();

  console.log(`\n🧰 Generated-file synchronization + idempotency check`);
  console.log(`=====================================================`);

  const committed = loadCommittedOutputs(rootDir);
  const firstGeneration = await generateCatalogueOutputs({ rootDir });
  const secondGeneration = await generateCatalogueOutputs({ rootDir });
  const cmp = compareGeneratedOutputs(
    committed,
    toOutputMap(firstGeneration),
    toOutputMap(secondGeneration),
  );

  console.log(
    `Generated ${firstGeneration.detailFiles.size} detail files + meta + client index from the index (run 1 of 2).`,
  );

  let failed = false;
  if (cmp.changedOnRegen.length > 0) {
    failed = true;
    console.error(
      `\n❌ Stage failed: idempotency — a second generation changed ${cmp.changedOnRegen.length} file(s):`,
    );
    for (const key of cmp.changedOnRegen) {
      console.error(`  CHANGED ${outputKeyDisplayName(key)}`);
    }
    console.error(
      `\n   The generator (scripts/catalog/generate-outputs.ts) is not deterministic.`,
    );
  } else {
    console.log(
      `✔ Second generation produced zero diff — generation is idempotent.`,
    );
  }

  if (cmp.stale.length > 0) {
    failed = true;
    console.error(
      `\n❌ Stage failed: sync — ${cmp.stale.length} committed generated file(s) do not match the index:`,
    );
    for (const key of cmp.stale) {
      console.error(`  STALE ${outputKeyDisplayName(key)}`);
    }
    console.error(
      `\nReproduce locally:\n  npm run check:catalog-ci\n  npm run sync-destination-details   # regenerate, then commit the result`,
    );
  } else {
    console.log(
      `✔ All committed generated files are current (byte-identical to a fresh generation).`,
    );
  }

  if (failed) {
    console.log(
      `\nAny unexpected generated-file diff must be investigated, not committed blindly.`,
    );
    return 1;
  }
  return 0;
}

// CLI entry (guarded so check-catalog-ci.ts can import runSyncCheck).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const code = await runSyncCheck();
  process.exit(code);
}
