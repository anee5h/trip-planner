import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Lists changed files: committed changes vs diffBase (three-dot diff, with a
 * fallback to the working tree vs diffHead when the base ref is unavailable,
 * e.g. shallow local clones) UNION uncommitted changes (staged + unstaged +
 * untracked via `git status --porcelain`), so dirty working trees are never
 * invisible to the classifier.
 */
function listChangedFiles(diffBase: string, diffHead: string): string {
  const rootDir = process.cwd();
  let committed = "";
  try {
    committed = execSync(`git diff --name-only ${diffBase}...${diffHead}`, {
      encoding: "utf-8",
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    try {
      committed = execSync(`git diff --name-only ${diffHead}`, {
        encoding: "utf-8",
        cwd: rootDir,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      committed = "";
    }
  }
  let uncommitted = "";
  try {
    uncommitted = execSync(`git status --porcelain`, {
      encoding: "utf-8",
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    uncommitted = "";
  }
  const statusPaths = uncommitted
    .split("\n")
    .map((l) => l.slice(3).trim()) // strip the 2-char status + space
    .filter(Boolean);
  return [committed, ...statusPaths].filter(Boolean).join("\n");
}

export interface ChangedScope {
  changedDestinationIds: Set<string>;
  indexChanged: boolean;
}

export interface CatalogueScope {
  /** True when at least one changed file can affect catalogue integrity. */
  relevant: boolean;
  /** All changed files (for diagnostics). */
  changedFiles: string[];
  /** The subset of changed files that are catalogue-affecting. */
  relevantFiles: string[];
}

export function parseChangedFiles(raw: string): ChangedScope {
  const indexPath = path.join(
    "src",
    "shared",
    "data",
    "destinations-index.json",
  );
  const destinationsDir = path.join("public", "data", "destinations") + "/";

  const changedFiles = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const indexChanged = changedFiles.some((f) => f === indexPath);
  const changedDestinationIds = new Set<string>();

  for (const file of changedFiles) {
    if (!file.startsWith(destinationsDir)) continue;
    if (!file.endsWith(".json")) continue;
    const basename = path.basename(file, ".json");
    if (basename) changedDestinationIds.add(basename);
  }

  return { changedDestinationIds, indexChanged };
}

export function getChangedDestinationScope(
  diffBase = "origin/main",
  diffHead = "HEAD",
): ChangedScope {
  return parseChangedFiles(listChangedFiles(diffBase, diffHead));
}

// ---------------------------------------------------------------------------
// Catalogue-integrity scope (used by check:catalog-ci and its workflow).
// ---------------------------------------------------------------------------

/**
 * Path prefixes that can materially affect catalogue integrity: canonical
 * source data (index, meta, collections, transport registries), generated
 * detail files, generation/sync scripts, audit code, schemas, validators,
 * and the package/workflow files that control the checks.
 */
const CATALOGUE_AFFECTING_PREFIXES = [
  "src/shared/data/",
  "public/data/",
  "scripts/",
  "src/shared/types/",
  ".github/workflows/",
] as const;

/**
 * True when a changed path can affect catalogue integrity. This is the
 * single source of truth used by CI and the local command; the workflow
 * deliberately has no YAML `paths` filter, so a path can never bypass the
 * check by being missing from a hand-maintained list.
 */
export function isCatalogueAffectingPath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  if (normalized === "package.json") return true;
  return CATALOGUE_AFFECTING_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

/** Pure classifier over a `git diff --name-only`-style listing. */
export function parseCatalogueScope(raw: string): CatalogueScope {
  const changedFiles = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const relevantFiles = changedFiles.filter(isCatalogueAffectingPath);
  return { relevant: relevantFiles.length > 0, changedFiles, relevantFiles };
}

export function getChangedCatalogueScope(
  diffBase = "origin/main",
  diffHead = "HEAD",
): CatalogueScope {
  return parseCatalogueScope(listChangedFiles(diffBase, diffHead));
}
