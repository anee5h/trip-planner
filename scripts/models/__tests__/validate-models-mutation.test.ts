/**
 * Mutation tests for the KAI-89 validate-models gates (review fix #1):
 * every gate must FAIL when its invariant is corrupted. The gates only
 * enforce what the generator must not produce, so each mutation injects a
 * corruption the models are contractually forbidden to emit.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateCatalogue, type GateResult } from "../validate-models";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const INDEX_PATH = path.join(ROOT, "src/shared/data/destinations-index.json");

function loadIndex(): Array<Record<string, any>> {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
}

function withMutations(
  mutate: (index: Array<Record<string, any>>) => void,
): string {
  const index = loadIndex();
  mutate(index);
  const tmp = path.join(
    os.tmpdir(),
    `kai89-mutated-index-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmp, JSON.stringify(index));
  return tmp;
}

// gateOf: 6+ call sites need lockstep gate-name lookup, so the tiny helper
// is a deliberate contract, not a rename.
const gateOf = (results: GateResult[], gate: string) =>
  results.find((r) => r.gate === gate);

describe("KAI-89 validate-models mutation guards", () => {
  it("baseline: all gates pass on the committed catalogue", () => {
    const results = validateCatalogue(INDEX_PATH);
    const failed = results.filter((r) => !r.pass);
    expect(failed).toEqual([]);
  });

  it("NaN/Infinity gate catches a non-finite budget", () => {
    const p = withMutations((idx) => {
      const d = idx.find((x) => x.budgetMin !== undefined)!;
      d.budgetMin = NaN;
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "NaN/Infinity")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("min>max gate catches an inverted budget range", () => {
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) => x.budgetMin !== undefined && x.budgetMax !== undefined,
      )!;
      d.budgetMin = d.budgetMax + 1000;
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "min>max")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("tickets-never-modelled catches a fabricated ticket on a model-touched budget", () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "scripts/models/derive-report.json"),
        "utf8",
      ),
    );
    const touched = (report.touchedRecords["budget-model-v1"] ??
      []) as string[];
    const p = withMutations((idx) => {
      // A hub-convention record (tickets must be 0 without evidence);
      // fabricate a non-zero ticket on it.
      const d = idx.find(
        (x) =>
          touched.includes(x.id) &&
          ["city", "ward", "town", "village"].includes(x.kind) &&
          x.budgetBreakdown !== undefined,
      )!;
      expect(d, "fixture: a touched hub with a breakdown").toBeTruthy();
      d.budgetBreakdown = { ...d.budgetBreakdown, tickets: 4800 };
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "tickets-never-modelled")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("midpoint-invariant catches an off-midpoint recommended budget", () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "scripts/models/derive-report.json"),
        "utf8",
      ),
    );
    const touched = (report.touchedRecords["budget-model-v1"] ??
      []) as string[];
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) =>
          touched.includes(x.id) &&
          x.budgetMin !== undefined &&
          x.budgetMax !== undefined &&
          x.budgetRecommended !== undefined,
      )!;
      expect(d, "fixture: a touched budget with a full range").toBeTruthy();
      d.budgetRecommended = d.budgetMax + 500;
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "midpoint-invariant")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("out-of-range catches a fractional comfort value on a model-touched comfort record", () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "scripts/models/derive-report.json"),
        "utf8",
      ),
    );
    const touched = (report.touchedRecords["comfort-model-v1"] ??
      []) as string[];
    const p = withMutations((idx) => {
      const d = idx.find(
        (x) => touched.includes(x.id) && x.comfort !== undefined,
      )!;
      expect(d, "fixture: a touched comfort record").toBeTruthy();
      d.comfort = { ...d.comfort, rainFriendly: 7.5 };
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "out-of-range")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });

  it("giant-cluster guard catches rating-vector growth beyond the gated baseline", () => {
    // The 114-record template vector is the known gated baseline; growing
    // it must fail the contamination guard.
    const templateVector = [9.5, 9.3, 9, 9.1, 9.2, 9.6, 9.5, 9.2, 9.4, 9.4];
    const keys = [
      "overall",
      "couple",
      "summer",
      "winter",
      "rain",
      "food",
      "photography",
      "relaxation",
      "value",
      "uniqueness",
    ];
    const p = withMutations((idx) => {
      // Re-vector 5 more records to the template profile.
      let mutated = 0;
      for (const d of idx) {
        if (mutated >= 5) break;
        if (
          d.ratings &&
          JSON.stringify(keys.map((k) => d.ratings[k])) !==
            JSON.stringify(templateVector)
        ) {
          d.ratings = Object.fromEntries(
            keys.map((k, i) => [k, templateVector[i]]),
          );
          mutated += 1;
        }
      }
      expect(mutated).toBe(5);
    });
    const results = validateCatalogue(p);
    expect(gateOf(results, "contamination-guard")?.pass).toBe(false);
    fs.rmSync(p, { force: true });
  });
});
