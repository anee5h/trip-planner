/**
 * derive-report lastApplied semantics (owner final-pass review #2).
 *
 * - --apply with changes > 0 records migration evidence
 * - --apply with changes === 0 PRESERVES the previous lastApplied
 * - --check preserves lastApplied and writes NO files
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  nextReport,
  type ReportChange,
  type ReportShape,
} from "../../derive-destination-models";

const SCRIPT_DIR = path.resolve(__dirname, "..");
const ROOT = path.resolve(SCRIPT_DIR, "..", "..");

const change = (id: string, model = "season-model-v1"): ReportChange => ({
  id,
  model,
  action: "set",
  reason: `test change for ${id}`,
  fields: ["season"],
});

function committedWith(
  lastApplied: ReportShape["lastApplied"],
): Partial<ReportShape> {
  return {
    modelVersion: "kai-89-models-v1",
    generatedAt: "2026-08-14",
    pendingChanges: 0,
    pendingByModel: [],
    touchedRecords: {},
    modelClusterIds: [],
    historyNote: "test history",
    lastApplied,
  };
}

describe("nextReport lastApplied semantics", () => {
  it("non-zero apply records migration evidence (timestamp, count, byModel)", () => {
    const report = nextReport(
      committedWith({
        at: "2026-08-14T02:16",
        changeCount: 14,
        byModel: [["walking-model-v1", 14]],
      }),
      [change("a"), change("b")],
      { "season-model-v1": ["a", "b"] },
      [],
      true,
    );
    expect(report.lastApplied?.changeCount).toBe(2);
    expect(report.lastApplied?.byModel).toEqual([["season-model-v1", 2]]);
    expect(report.lastApplied?.at).toBeTruthy();
    expect(report.lastApplied?.sample?.length).toBe(2);
  });

  it("clean apply (0 changes) preserves the previous lastApplied exactly", () => {
    const previous = {
      at: "2026-08-14T02:16",
      changeCount: 14,
      byModel: [["walking-model-v1", 14]] as Array<[string, number]>,
    };
    const report = nextReport(committedWith(previous), [], {}, [], true);
    expect(report.lastApplied).toEqual(previous);
  });

  it("--check preserves lastApplied (no mutation of report state)", () => {
    const previous = {
      at: "2026-08-14T02:16",
      changeCount: 14,
      byModel: [["walking-model-v1", 14]] as Array<[string, number]>,
    };
    const committed = committedWith(previous);
    const before = JSON.stringify(committed);
    const report = nextReport(committed, [], {}, [], false);
    expect(report.lastApplied).toEqual(previous);
    // The committed input is never mutated:
    expect(JSON.stringify(committed)).toBe(before);
  });

  it("absent previous evidence yields the honest null+note state, never a fake 0", () => {
    const report = nextReport(undefined, [], {}, [], true);
    expect(report.lastApplied?.changeCount).toBeNull();
    expect(report.lastApplied?.note).toContain(
      "pre-fix evidence was overwritten",
    );
    expect(report.historyNote).toContain("zero-change apply");
  });
});

describe("derive --check side effects (integration)", () => {
  it("--check exits 0 on the committed catalogue and writes nothing", () => {
    const reportPath = path.join(ROOT, "scripts/models/derive-report.json");
    const indexPath = path.join(
      ROOT,
      "src/shared/data/destinations-index.json",
    );
    const reportBefore = fs.readFileSync(reportPath, "utf8");
    const indexBefore = fs.readFileSync(indexPath, "utf8");
    const statBefore = fs.statSync(reportPath);

    // The committed catalogue MUST be converged: a clean checkout makes
    // --check exit exactly 0 (a non-zero exit here means stale generated
    // files were committed). --check NEVER writes, proven by byte+mtime.
    execFileSync(
      "npx",
      ["tsx", "scripts/derive-destination-models.ts", "--check"],
      { cwd: ROOT, stdio: "pipe" },
    );
    expect(fs.readFileSync(reportPath, "utf8")).toBe(reportBefore);
    expect(fs.readFileSync(indexPath, "utf8")).toBe(indexBefore);
    // mtime must be untouched (no rewrite).
    expect(fs.statSync(reportPath).mtimeMs).toBe(statBefore.mtimeMs);
  });

  it("apply with changes records pendingChanges 0 and lastApplied evidence", () => {
    const committed = committedWith({
      at: "2026-08-14T02:16",
      changeCount: 88,
      byModel: [["comfort-model-v1", 86]],
    });
    const report = nextReport(
      committed,
      [change("a"), change("b", "budget-model-v1")],
      { "budget-model-v1": ["a", "b"] },
      [],
      true,
    );
    // A successful apply leaves NO pending changes (the committed report
    // must never claim unapplied work that `derive --check` says is 0).
    expect(report.pendingChanges).toBe(0);
    expect(report.pendingByModel).toEqual([]);
    expect(report.lastApplied?.changeCount).toBe(2);
  });

  it("dry run reports pending changes; apply zeroes them", () => {
    const dry = nextReport(undefined, [change("a")], {}, [], false);
    expect(dry.pendingChanges).toBe(1);
    const applied = nextReport(undefined, [change("a")], {}, [], true);
    expect(applied.pendingChanges).toBe(0);
  });
});
