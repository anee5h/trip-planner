import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redactSensitiveValues } from "../../src/shared/utils/redact.ts";
import { resolveStack, resolveStackFrame } from "../resolve-stack.mjs";

let tempRoot;
let mapsDir;

const fixtureMap = {
  version: 3,
  file: "index-Abc123.js",
  sources: ["src/crash.ts"],
  names: ["crash"],
  mappings: "AAAA;AACA;AACAA",
  sourcesContent: [
    'const ready = true;\nfunction recover() {\n  throw new Error("boom");\n}',
  ],
};

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kai-398-resolve-stack-"));
  mapsDir = path.join(tempRoot, "maps");
  fs.mkdirSync(path.join(mapsDir, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(mapsDir, "assets", "index-Abc123.js.map"),
    JSON.stringify(fixtureMap),
  );
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("resolveStack", () => {
  it.each([
    [
      "    at crash (https://meguruto.app/assets/index-Abc123.js:3:1)",
      "    at crash (src/crash.ts:3:1 (crash))",
    ],
    [
      "    at https://meguruto.app/assets/index-Abc123.js:3:1",
      "    at src/crash.ts:3:1 (crash)",
    ],
    [
      "crash@https://meguruto.app/assets/index-Abc123.js:3:1",
      "crash@src/crash.ts:3:1 (crash)",
    ],
  ])("resolves the original source for frame %s", (frame, expected) => {
    expect(resolveStack(frame, mapsDir)).toBe(expected);
  });

  it("leaves a frame in place with a note when its map is missing", () => {
    const frame = "    at crash (https://meguruto.app/assets/missing.js:3:1)";

    expect(resolveStackFrame(frame, mapsDir)).toBe(
      `${frame} [unresolved: missing map assets/missing.js.map]`,
    );
  });

  it("does not let redaction alter a realistic production frame URL", () => {
    const frame =
      "    at crash (https://meguruto.app/assets/index-Abc123.js:1:2345)";

    expect(redactSensitiveValues(frame)).toBe(frame);
  });
});
