import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkNoPublicSourcemaps } from "../check-no-public-sourcemaps.mjs";
import { moveSourcemaps } from "../strip-sourcemaps.mjs";

let tempRoot;
let distDir;
let mapsDir;

function writeWorker(appShell) {
  fs.writeFileSync(
    path.join(distDir, "sw.js"),
    `const APP_SHELL = ${JSON.stringify(appShell, null, 2)};\n`,
  );
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kai-398-sourcemaps-"));
  distDir = path.join(tempRoot, "dist");
  mapsDir = path.join(tempRoot, ".sourcemaps");
  fs.mkdirSync(path.join(distDir, "assets"), { recursive: true });
  writeWorker(["/", "/assets/index.js"]);
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("checkNoPublicSourcemaps", () => {
  it("passes when dist has no maps or source map references", () => {
    fs.writeFileSync(
      path.join(distDir, "assets", "index.js"),
      "const app = 1;",
    );

    expect(checkNoPublicSourcemaps(distDir)).toEqual({
      filesChecked: 2,
      appShellEntries: 2,
    });
  });

  it("fails when a stray .map file remains in dist", () => {
    fs.writeFileSync(path.join(distDir, "assets", "index.js.map"), "{}");

    expect(() => checkNoPublicSourcemaps(distDir)).toThrow(/source map files/);
  });

  it("fails when a text asset has a sourceMappingURL comment", () => {
    fs.writeFileSync(
      path.join(distDir, "assets", "index.js"),
      "//# sourceMappingURL=index.js.map",
    );

    expect(() => checkNoPublicSourcemaps(distDir)).toThrow(
      /sourceMappingURL directive/,
    );
  });

  it("fails when the service worker precache includes a map URL", () => {
    writeWorker(["/", "/assets/index.js.map"]);

    expect(() => checkNoPublicSourcemaps(distDir)).toThrow(
      /service worker precache/,
    );
  });
});

describe("moveSourcemaps", () => {
  it("moves every map with its relative path and clears stale maps", () => {
    fs.mkdirSync(path.join(distDir, "data"), { recursive: true });
    fs.writeFileSync(path.join(distDir, "assets", "index.js.map"), "asset-map");
    fs.writeFileSync(
      path.join(distDir, "data", "catalog.json.map"),
      "data-map",
    );
    fs.mkdirSync(path.join(mapsDir, "stale"), { recursive: true });
    fs.writeFileSync(path.join(mapsDir, "stale", "old.js.map"), "old");

    const result = moveSourcemaps(distDir, mapsDir);

    expect(result).toEqual({ count: 2, totalBytes: 17 });
    expect(fs.existsSync(path.join(distDir, "assets", "index.js.map"))).toBe(
      false,
    );
    expect(
      fs.readFileSync(path.join(mapsDir, "assets", "index.js.map"), "utf8"),
    ).toBe("asset-map");
    expect(
      fs.readFileSync(path.join(mapsDir, "data", "catalog.json.map"), "utf8"),
    ).toBe("data-map");
    expect(fs.existsSync(path.join(mapsDir, "stale", "old.js.map"))).toBe(
      false,
    );
  });

  it("clears the previous artifact and fails if the build emitted no maps", () => {
    fs.mkdirSync(mapsDir, { recursive: true });
    fs.writeFileSync(path.join(mapsDir, "old.js.map"), "old");

    expect(() => moveSourcemaps(distDir, mapsDir)).toThrow(
      /No source maps found/,
    );
    expect(fs.readdirSync(mapsDir)).toEqual([]);
  });

  it("clears the previous artifact before failing for a missing dist directory", () => {
    fs.mkdirSync(mapsDir, { recursive: true });
    fs.writeFileSync(path.join(mapsDir, "old.js.map"), "old");
    const missingDist = path.join(tempRoot, "missing-dist");

    expect(() => moveSourcemaps(missingDist, mapsDir)).toThrow(
      /Build output directory does not exist/,
    );
    expect(fs.readdirSync(mapsDir)).toEqual([]);
  });
});
