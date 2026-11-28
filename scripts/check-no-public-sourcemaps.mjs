import fs from "node:fs";
import path from "node:path";

function listFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export function checkNoPublicSourcemaps(distDir) {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Build output directory does not exist: ${distDir}`);
  }

  const files = listFiles(distDir);
  const mapFiles = files.filter((file) => file.endsWith(".map"));
  if (mapFiles.length > 0) {
    throw new Error(
      `Public source map files found in dist/: ${mapFiles.map((file) => path.relative(distDir, file)).join(", ")}`,
    );
  }

  for (const file of files) {
    const contents = fs.readFileSync(file);
    if (contents.includes(0)) continue; // Binary assets cannot contain a sourceMappingURL directive.
    if (contents.toString("utf8").includes("sourceMappingURL=")) {
      throw new Error(
        `Public sourceMappingURL directive found in dist/${path.relative(distDir, file)}`,
      );
    }
  }

  const workerPath = path.join(distDir, "sw.js");
  if (!fs.existsSync(workerPath)) {
    throw new Error("Generated service worker is missing from dist/sw.js");
  }
  const worker = fs.readFileSync(workerPath, "utf8");
  const appShellMatch = worker.match(/const APP_SHELL = (\[[\s\S]*?\]);/);
  if (!appShellMatch) {
    throw new Error("Generated service worker has no APP_SHELL precache list");
  }

  let appShell;
  try {
    appShell = JSON.parse(appShellMatch[1]);
  } catch {
    throw new Error("Generated service worker APP_SHELL is not valid JSON");
  }
  const precachedMaps = appShell.filter(
    (asset) => typeof asset === "string" && /\.map(?:$|[?#])/i.test(asset),
  );
  if (precachedMaps.length > 0) {
    throw new Error(
      `Source maps found in the service worker precache: ${precachedMaps.join(", ")}`,
    );
  }

  return { filesChecked: files.length, appShellEntries: appShell.length };
}

function main() {
  const result = checkNoPublicSourcemaps(path.resolve("dist"));
  console.log(
    `Verified ${result.filesChecked} dist files and ${result.appShellEntries} service worker precache entries contain no public source maps.`,
  );
}

if (process.argv[1]?.endsWith("/scripts/check-no-public-sourcemaps.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(`check-no-public-sourcemaps: ${error.message}`);
    process.exitCode = 1;
  }
}
