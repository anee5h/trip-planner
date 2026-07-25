import fs from "fs";
import path from "path";
import type { Destination } from "../../src/shared/types/destination";
import type { Collection } from "../../src/shared/types/collection";
import type { CatalogData, ValidationContext } from "../validators/types";
import { DEFAULT_VALIDATION_CONFIG } from "../config/validation-rules";

let cachedCatalog: CatalogData | null = null;

export async function loadCatalog(): Promise<CatalogData> {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const rootDir = process.cwd();
  const destPath = path.join(
    rootDir,
    "src/shared/data/destinations-index.json",
  );
  const colPath = path.join(rootDir, "src/shared/data/collections-index.json");

  const destData = JSON.parse(
    fs.readFileSync(destPath, "utf-8"),
  ) as Destination[];
  const colData = JSON.parse(fs.readFileSync(colPath, "utf-8")) as Collection[];

  cachedCatalog = {
    destinations: destData,
    collections: colData,
  };

  return cachedCatalog;
}

export async function createValidationContext(): Promise<ValidationContext> {
  const catalog = await loadCatalog();
  return {
    catalog,
    config: DEFAULT_VALIDATION_CONFIG,
  };
}
