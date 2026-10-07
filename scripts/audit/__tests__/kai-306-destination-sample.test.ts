import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const script = resolve(
  repoRoot,
  "scripts/audit/kai-306-destination-sample.mjs",
);
const manifestPath = resolve(
  repoRoot,
  "qa/kai-306/destination-sample-audit.json",
);
const canonicalPath = resolve(
  repoRoot,
  "src/shared/data/destinations-index.json",
);

type Change = {
  path: string[];
  before: unknown;
  after: unknown;
};

function writePath(
  value: unknown,
  path: string[],
  next: unknown,
  present: boolean,
): void {
  const parent = path
    .slice(0, -1)
    .reduce<Record<string, unknown>>(
      (current, segment) => current[segment] as Record<string, unknown>,
      value as Record<string, unknown>,
    );
  const finalSegment = path[path.length - 1]!;
  if (present) parent[finalSegment] = next;
  else delete parent[finalSegment];
}

function run(args: string[]) {
  return spawnSync("node", [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

describe("KAI-306 audit reproducibility", () => {
  it("keeps each destination finding note unique", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      records: Array<{ id: string; findingNotes: string[] }>;
    };
    const duplicates = manifest.records.flatMap((record) => {
      const uniqueNotes = new Set(record.findingNotes);
      return uniqueNotes.size === record.findingNotes.length ? [] : [record.id];
    });
    expect(duplicates).toEqual([]);
  });

  it("keeps gate totals aligned and renders only captured route observations", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      methodology: {
        beforeResult: unknown;
        afterResult: unknown;
        outcomeAdjudication: string;
      };
      scope: { baselineResult: unknown; finalResult: unknown };
    };
    const report = readFileSync(
      resolve(repoRoot, "qa/kai-306/destination-sample-audit.md"),
      "utf8",
    );

    expect(manifest.methodology.beforeResult).toEqual(
      manifest.scope.baselineResult,
    );
    expect(manifest.methodology.afterResult).toEqual(
      manifest.scope.finalResult,
    );
    expect(manifest.methodology.outcomeAdjudication).toContain(
      "manually adjudicated",
    );
    expect(report).toContain(manifest.methodology.outcomeAdjudication);
    expect("undefined").toMatch(/\bundefined\b/);
    expect(report).not.toMatch(/\bundefined\b/);
  });

  it("checks the frozen cohort, candidate source, and rendered report", () => {
    const result = run(["--check"]);
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("replays A and B states and rejects a mixed C state", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      base: { commit: string; canonicalPath: string };
      records: Array<{ id: string; changes: Change[] }>;
    };
    const tempDir = mkdtempSync(join(tmpdir(), "kai306-replay-"));
    try {
      const basePath = join(tempDir, "base.json");
      const outputA = join(tempDir, "candidate-a.json");
      const outputB = join(tempDir, "candidate-b.json");
      const mixedPath = join(tempDir, "mixed.json");
      const outputC = join(tempDir, "candidate-c.json");
      const base = execFileSync(
        "git",
        ["show", `${manifest.base.commit}:${manifest.base.canonicalPath}`],
        { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
      writeFileSync(basePath, base);

      const first = run(["--replay", "--input", basePath, "--output", outputA]);
      expect(first.status, first.stderr || first.stdout).toBe(0);
      expect(first.stdout).toContain("state=A");
      expect(JSON.parse(readFileSync(outputA, "utf8"))).toEqual(
        JSON.parse(readFileSync(canonicalPath, "utf8")),
      );

      const second = run(["--replay", "--input", outputA, "--output", outputB]);
      expect(second.status, second.stderr || second.stdout).toBe(0);
      expect(second.stdout).toContain("state=B");
      expect(readFileSync(outputB, "utf8")).toBe(readFileSync(outputA, "utf8"));

      const mixed = JSON.parse(readFileSync(outputA, "utf8")) as Array<
        Record<string, unknown>
      >;
      const firstChanged = manifest.records.find(
        (record) => record.changes.length > 0,
      )!;
      const change = firstChanged.changes[0]!;
      const target = mixed.find((record) => record.id === firstChanged.id)!;
      writePath(target, change.path, change.before, change.beforePresent);
      writeFileSync(mixedPath, `${JSON.stringify(mixed, null, 2)}\n`);

      const third = run([
        "--replay",
        "--input",
        mixedPath,
        "--output",
        outputC,
      ]);
      expect(third.status).not.toBe(0);
      expect(`${third.stderr}\n${third.stdout}`).toContain("State C");
      expect(existsSync(outputC)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
