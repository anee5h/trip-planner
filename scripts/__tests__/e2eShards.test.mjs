/**
 * KAI-99: the E2E shard manifest guard must fail CI when a spec is ever
 * left unassigned — a new e2e spec would otherwise silently never run.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const E2E_DIR = path.resolve(process.cwd(), "e2e");
const GUARD = path.resolve(process.cwd(), "scripts/e2e-shards.mjs");

function runCheck() {
  try {
    const out = execFileSync("node", [GUARD, "--check"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    return { ok: true, out };
  } catch (error) {
    const e = /** @type {{ stdout?: string; stderr?: string }} */ (error);
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("KAI-99 E2E shard manifest guard", () => {
  it("passes on the current manifest", () => {
    const result = runCheck();
    expect(result.ok).toBe(true);
    expect(result.out).toContain("E2E shard manifest OK");
  });

  it("fails when a new spec is not assigned to any bin", () => {
    const stray = path.join(E2E_DIR, "kai-zz-unassigned.spec.ts");
    fs.writeFileSync(
      stray,
      'import { test } from "@playwright/test";\ntest("unassigned", () => {});\n',
    );
    try {
      const result = runCheck();
      expect(result.ok).toBe(false);
      expect(result.out).toContain("kai-zz-unassigned");
      expect(result.out).toContain("NOT assigned to any bin");
    } finally {
      fs.rmSync(stray, { force: true });
    }
  });

  it("fails when a bin lists a spec that does not exist", () => {
    const guardSource = fs.readFileSync(GUARD, "utf8");
    const patched = guardSource.replace(
      '1: ["kai-89-data-safety"],',
      '1: ["kai-89-data-safety", "kai-zz-ghost"],',
    );
    const tmpGuard = path.join(
      process.cwd(),
      "scripts",
      "e2e-shards-ghost.mjs",
    );
    fs.writeFileSync(tmpGuard, patched);
    try {
      const result = (() => {
        try {
          execFileSync("node", [tmpGuard, "--check"], {
            encoding: "utf8",
            stdio: "pipe",
          });
          return { ok: true, out: "" };
        } catch (error) {
          const e = /** @type {{ stdout?: string; stderr?: string }} */ (error);
          return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
        }
      })();
      expect(result.ok).toBe(false);
      expect(result.out).toContain("kai-zz-ghost");
    } finally {
      fs.rmSync(tmpGuard, { force: true });
    }
  });

  it("fails when an assigned spec is missing its weight (degenerates to 0)", () => {
    const guardSource = fs.readFileSync(GUARD, "utf8");
    // Delete a real spec's weight: the guard must reject it instead of
    // silently treating the spec as 0s.
    const patched = guardSource.replace('"kai-98-ja-labels": 13,', "");
    const tmpGuard = path.join(
      process.cwd(),
      "scripts",
      "e2e-shards-noweight.mjs",
    );
    fs.writeFileSync(tmpGuard, patched);
    try {
      const result = (() => {
        try {
          execFileSync("node", [tmpGuard, "--check"], {
            encoding: "utf8",
            stdio: "pipe",
          });
          return { ok: true, out: "" };
        } catch (error) {
          const e = /** @type {{ stdout?: string; stderr?: string }} */ (error);
          return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
        }
      })();
      expect(result.ok).toBe(false);
      expect(result.out).toContain("kai-98-ja-labels");
      expect(result.out).toContain("missing a positive weight");
    } finally {
      fs.rmSync(tmpGuard, { force: true });
    }
  });

  it("fails on a stale WEIGHTS entry for a spec that is no longer binned", () => {
    const guardSource = fs.readFileSync(GUARD, "utf8");
    // Drop the spec from its bin but keep the weight entry: the guard
    // must flag the orphaned weight.
    const patched = guardSource
      .replace('    "kai-98-ja-labels",\n', "")
      .replace('"kai-98-ja-labels": 13,', '"kai-98-ja-labels": 13,');
    const tmpGuard = path.join(
      process.cwd(),
      "scripts",
      "e2e-shards-stale.mjs",
    );
    fs.writeFileSync(tmpGuard, patched);
    try {
      const result = (() => {
        try {
          execFileSync("node", [tmpGuard, "--check"], {
            encoding: "utf8",
            stdio: "pipe",
          });
          return { ok: true, out: "" };
        } catch (error) {
          const e = /** @type {{ stdout?: string; stderr?: string }} */ (error);
          return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
        }
      })();
      expect(result.ok).toBe(false);
      expect(result.out).toContain("stale WEIGHTS entry");
    } finally {
      fs.rmSync(tmpGuard, { force: true });
    }
  });
});
