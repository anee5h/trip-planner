import fs from "node:fs";
import { SourceMap } from "node:module";

const LOCATION_RE = /(https?:\/\/[^\s()]+):(\d+):(\d+)(?=\)?$)/;

function unresolved(line, reason) {
  return `${line} [unresolved: ${reason}]`;
}

export function resolveStackFrame(line, mapsDir) {
  const match = line.match(LOCATION_RE);
  if (!match) return line;

  const [location, urlText, lineText, columnText] = match;
  let url;
  try {
    url = new URL(urlText);
  } catch {
    return unresolved(line, "invalid frame URL");
  }

  const assetMatch = url.pathname.match(/^\/assets\/([^/]+\.js)$/);
  if (!assetMatch) return unresolved(line, "not a /assets/*.js bundle");

  const relativeMap = `assets/${assetMatch[1]}.map`;
  const mapPath = `${mapsDir.replace(/[\\/]+$/, "")}/${relativeMap}`;
  if (!fs.existsSync(mapPath)) {
    return unresolved(line, `missing map ${relativeMap}`);
  }

  let origin;
  try {
    const payload = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    origin = new SourceMap(payload).findOrigin(
      Number(lineText),
      Number(columnText),
    );
  } catch (error) {
    return unresolved(line, `invalid map (${error.message})`);
  }

  if (!origin?.fileName || !origin.lineNumber || !origin.columnNumber) {
    return unresolved(line, "no mapping for this location");
  }

  const mapped = `${origin.fileName}:${origin.lineNumber}:${origin.columnNumber}${origin.name ? ` (${origin.name})` : ""}`;
  return `${line.slice(0, match.index)}${mapped}${line.slice(match.index + location.length)}`;
}

export function resolveStack(stack, mapsDir) {
  return stack
    .split(/\r?\n/)
    .map((line) => resolveStackFrame(line, mapsDir))
    .join("\n");
}

function parseArgs(args) {
  let mapsDir;
  let stackFile;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--maps") mapsDir = args[++index];
    else if (args[index] === "--stack-file") stackFile = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!mapsDir)
    throw new Error(
      "Usage: node scripts/resolve-stack.mjs --maps <dir> [--stack-file <path>]",
    );
  if (stackFile === undefined) {
    const stack = fs.readFileSync(0, "utf8");
    return { mapsDir, stack };
  }
  return { mapsDir, stack: fs.readFileSync(stackFile, "utf8") };
}

if (process.argv[1]?.endsWith("/scripts/resolve-stack.mjs")) {
  try {
    const { mapsDir, stack } = parseArgs(process.argv.slice(2));
    process.stdout.write(`${resolveStack(stack, mapsDir)}\n`);
  } catch (error) {
    console.error(`resolve-stack: ${error.message}`);
    process.exitCode = 1;
  }
}
