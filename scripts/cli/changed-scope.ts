import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

const IMAGE_FIELD_LINE = /^\+\s*"(heroImage|image)"\s*:/;
const REMOVED_IMAGE_FIELD_LINE = /^-\s*"(heroImage|image)"\s*:/;
const GIT_JSON_MAX_BUFFER = 20 * 1024 * 1024;

/** Extract destination IDs whose detail diff changes an image field. */
export function parseChangedImageDiff(raw: string): Set<string> {
  const changedImageIds = new Set<string>();
  let currentId: string | undefined;
  for (const line of raw.split("\n")) {
    const fileMatch =
      /^diff --git a\/public\/data\/destinations\/([^/]+)\.json b\/public\/data\/destinations\/([^/]+)\.json$/.exec(
        line,
      );
    if (fileMatch) {
      currentId = fileMatch[2];
      continue;
    }
    if (
      currentId &&
      (IMAGE_FIELD_LINE.test(line) || REMOVED_IMAGE_FIELD_LINE.test(line))
    ) {
      changedImageIds.add(currentId);
    }
  }
  return changedImageIds;
}

function imageProjection(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return { heroImage: record.heroImage, image: record.image };
}

function readJsonAtRef(ref: string, file: string): unknown {
  if (ref === "WORKTREE") {
    return JSON.parse(readFileSync(file, "utf-8"));
  }
  const gitRef = ref === "INDEX" ? `:${file}` : `${ref}:${file}`;
  return JSON.parse(
    execFileSync("git", ["show", gitRef], {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: GIT_JSON_MAX_BUFFER,
    }),
  );
}

function changedImageIdsBetweenIndexRefs(
  beforeRef: string,
  afterRef: string,
): Set<string> | null {
  try {
    const before = readJsonAtRef(
      beforeRef,
      "src/shared/data/destinations-index.json",
    );
    const after = readJsonAtRef(
      afterRef,
      "src/shared/data/destinations-index.json",
    );
    if (!Array.isArray(before) || !Array.isArray(after)) return null;

    const beforeById = new Map(
      before.map((record) => [(record as { id: string }).id, record]),
    );
    const changedImageIds = new Set<string>();
    for (const record of after) {
      const id = (record as { id: string }).id;
      if (
        JSON.stringify(imageProjection(beforeById.get(id))) !==
        JSON.stringify(imageProjection(record))
      ) {
        changedImageIds.add(id);
      }
    }
    return changedImageIds;
  } catch {
    return null;
  }
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

/**
 * Return only destination records whose externally fetched image values
 * changed. Generated budget-only rewrites can touch every detail JSON without
 * changing heroImage/image; those records must not re-run the remote image
 * validator against pre-existing catalogue debt.
 *
 * If either side cannot be read, keep the destination in scope (fail closed)
 * rather than allowing an external change to bypass validation.
 */
export function getChangedDestinationImageScope(
  diffBase = "origin/main",
  diffHead = "HEAD",
): ChangedScope {
  const scope = getChangedDestinationScope(diffBase, diffHead);
  if (scope.changedDestinationIds.size === 0 && !scope.indexChanged) {
    return scope;
  }

  const changedImageIds = new Set<string>();

  if (scope.indexChanged) {
    const committedIndexIds = changedImageIdsBetweenIndexRefs(
      diffBase,
      diffHead,
    );
    if (!committedIndexIds) return scope;
    for (const id of committedIndexIds) changedImageIds.add(id);

    // The default HEAD mode intentionally includes dirty working-tree state,
    // matching getChangedDestinationScope's union semantics. Compare each
    // Git layer so staged changes cannot disappear when the worktree matches
    // HEAD; explicit refs remain ref-pure.
    if (diffHead === "HEAD") {
      const stagedIndexIds = changedImageIdsBetweenIndexRefs(diffHead, "INDEX");
      const workingIndexIds = changedImageIdsBetweenIndexRefs(
        "INDEX",
        "WORKTREE",
      );
      if (!stagedIndexIds || !workingIndexIds) return scope;
      for (const id of stagedIndexIds) changedImageIds.add(id);
      for (const id of workingIndexIds) changedImageIds.add(id);
    }
  }

  try {
    const committedDiff = execFileSync(
      "git",
      [
        "diff",
        "--unified=0",
        `${diffBase}...${diffHead}`,
        "--",
        "public/data/destinations",
      ],
      {
        encoding: "utf-8",
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const detailDiffs = [committedDiff];
    if (diffHead === "HEAD") {
      detailDiffs.push(
        execFileSync(
          "git",
          ["diff", "--unified=0", "--", "public/data/destinations"],
          {
            encoding: "utf-8",
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "ignore"],
          },
        ),
        execFileSync(
          "git",
          ["diff", "--cached", "--unified=0", "--", "public/data/destinations"],
          {
            encoding: "utf-8",
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "ignore"],
          },
        ),
      );
    }
    for (const diff of detailDiffs) {
      for (const id of parseChangedImageDiff(diff)) {
        changedImageIds.add(id);
      }
    }
  } catch {
    return scope;
  }

  return {
    ...scope,
    changedDestinationIds: changedImageIds,
    indexChanged: false,
  };
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
  // package.json controls the check scripts; package-lock.json changes what
  // `npm ci` installs, which can alter audit/generation behaviour. No other
  // package-manager/runtime control file exists in this repo (.npmrc, yarn,
  // pnpm and bun locks are absent; .nvmrc/.node-version are ignored by CI,
  // which pins node via setup-node in the workflows).
  if (normalized === "package.json" || normalized === "package-lock.json") {
    return true;
  }
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
