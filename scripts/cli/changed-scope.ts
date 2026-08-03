import { execSync } from "node:child_process";
import path from "node:path";

export interface ChangedScope {
  changedDestinationIds: Set<string>;
  indexChanged: boolean;
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
  const rootDir = process.cwd();
  let raw = "";
  try {
    raw = execSync(`git diff --name-only ${diffBase}...${diffHead}`, {
      encoding: "utf-8",
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    try {
      raw = execSync(`git diff --name-only ${diffHead}`, {
        encoding: "utf-8",
        cwd: rootDir,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return {
        changedDestinationIds: new Set(),
        indexChanged: false,
      };
    }
  }

  return parseChangedFiles(raw);
}
