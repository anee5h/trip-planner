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

export function moveSourcemaps(distDir, mapsDir) {
  fs.rmSync(mapsDir, { recursive: true, force: true });
  fs.mkdirSync(mapsDir, { recursive: true });

  if (!fs.existsSync(distDir)) {
    throw new Error(`Build output directory does not exist: ${distDir}`);
  }

  const mapFiles = listFiles(distDir).filter((file) => file.endsWith(".map"));
  if (mapFiles.length === 0) {
    throw new Error(`No source maps found in ${distDir}; refusing to continue`);
  }

  let totalBytes = 0;
  for (const source of mapFiles) {
    const relativePath = path.relative(distDir, source);
    const destination = path.join(mapsDir, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    totalBytes += fs.statSync(source).size;
    fs.renameSync(source, destination);
  }

  return { count: mapFiles.length, totalBytes };
}

function main() {
  const root = process.cwd();
  const result = moveSourcemaps(
    path.join(root, "dist"),
    path.join(root, ".sourcemaps"),
  );
  const megabytes = (result.totalBytes / (1024 * 1024)).toFixed(2);
  console.log(
    `Moved ${result.count} source maps (${result.totalBytes} bytes; ${megabytes} MB) to .sourcemaps/`,
  );
}

if (process.argv[1]?.endsWith("/scripts/strip-sourcemaps.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(`strip-sourcemaps: ${error.message}`);
    process.exitCode = 1;
  }
}
