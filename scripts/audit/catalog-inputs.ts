/**
 * Shared catalogue input loader for the integrity audit.
 *
 * Both scripts/audit-catalog-integrity.ts (the CLI) and
 * scripts/check-catalog-warnings.ts (the CI gate) read exactly the same
 * files, so the two entry points can never drift apart.
 */

import fs from "fs";
import path from "path";
import type { Destination } from "../../src/shared/types/destination.js";
import type { DetailFileEntry } from "./catalog-integrity.js";

export interface CatalogInputs {
  destinations: Destination[];
  details: DetailFileEntry[];
  metaEntries: { id: string; [k: string]: unknown }[];
}

export function loadCatalogInputs(rootDir: string): CatalogInputs {
  const indexPath = path.join(
    rootDir,
    "src/shared/data/destinations-index.json",
  );
  const metaPath = path.join(rootDir, "src/shared/data/destinations-meta.json");
  const detailsDir = path.join(rootDir, "public/data/destinations");

  const destinations = JSON.parse(
    fs.readFileSync(indexPath, "utf-8"),
  ) as Destination[];
  const metaEntries = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
    id: string;
    [k: string]: unknown;
  }[];

  const details: DetailFileEntry[] = [];
  if (fs.existsSync(detailsDir)) {
    for (const file of fs.readdirSync(detailsDir).sort()) {
      if (!file.endsWith(".json")) continue;
      const id = file.slice(0, -".json".length);
      const record = JSON.parse(
        fs.readFileSync(path.join(detailsDir, file), "utf-8"),
      ) as Destination;
      details.push({ id, record });
    }
  }

  return { destinations, details, metaEntries };
}
