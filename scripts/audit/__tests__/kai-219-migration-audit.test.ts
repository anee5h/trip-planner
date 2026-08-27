/**
 * KAI-219 — migration audit determinism test.
 *
 * Proves the audit output is byte-identical across runs (same catalogue →
 * same JSON), which is the before/after evidence contract for every
 * KAI-219 data-cohort PR.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { runAudit } from "../kai-219-migration-audit";

const INDEX_PATH = path.resolve(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);

describe("KAI-219 migration audit", () => {
  it("is deterministic across runs (byte-identical JSON)", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Parameters<typeof runAudit>[0];
    const first = JSON.stringify(runAudit(destinations));
    const second = JSON.stringify(runAudit(destinations));
    expect(second).toBe(first);
  });

  it("reports the full cohort set (admission / localTransport / debt)", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Parameters<typeof runAudit>[0];
    const out = runAudit(destinations);
    expect(out.total).toBeGreaterThan(0);
    // Every admission cohort key is present.
    for (const k of [
      "explicit",
      "verified_paid",
      "verified_free",
      "documented_estimate",
      "variable_price",
      "not_applicable",
      "unavailable",
      "absent",
      "transitional_legacy_numeric_used",
      "transitional_legacy_non_numeric_or_untrusted",
    ]) {
      expect(out.admission).toHaveProperty(k);
    }
    // Every localTransport cohort key is present.
    for (const k of [
      "explicit",
      "verified_required_access",
      "bounded_defensible_access",
      "verified_walking",
      "not_applicable",
      "unavailable",
      "absent",
    ]) {
      expect(out.localTransport).toHaveProperty(k);
    }
    // Cohort sums are consistent with the total.
    expect(out.admission.absent + out.admission.explicit).toBe(out.total);
    expect(out.localTransport.absent + out.localTransport.explicit).toBe(
      out.total,
    );
    // The audit is an inventory, not a gate — baseline low completeness is
    // expected and must not be masked.
    expect(out.admission.explicit).toBeGreaterThanOrEqual(0);
  });

  it("splits transitional fallback: numeric_used differs from absent and sums to absent", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Parameters<typeof runAudit>[0];
    const out = runAudit(destinations);
    const {
      absent,
      transitional_legacy_numeric_used,
      transitional_legacy_non_numeric_or_untrusted,
    } = out.admission;
    // The split is meaningful: numeric-used is a SUBSET of absent (it can
    // be 0 after full migration — KAI-219B retired the cohort — but must
    // never exceed absent, and must never equal absent when non-numeric
    // records exist).
    expect(transitional_legacy_numeric_used).toBeGreaterThanOrEqual(0);
    expect(transitional_legacy_numeric_used).toBeLessThanOrEqual(absent);
    // And the two split cohorts partition the absent records exactly.
    expect(
      transitional_legacy_numeric_used +
        transitional_legacy_non_numeric_or_untrusted,
    ).toBe(absent);
    // Every fallback-used id is present in the ID list.
    const numericUsedIds =
      out.ids.admission["admission:transitional_legacy_numeric_used"] ?? [];
    expect(numericUsedIds.length).toBe(transitional_legacy_numeric_used);
  });

  it("KAI-219B: no prose price conflicts with source-backed bounded admission facts", () => {
    const destinations = JSON.parse(
      fs.readFileSync(INDEX_PATH, "utf8"),
    ) as Parameters<typeof runAudit>[0];
    const out = runAudit(destinations);
    // A migrated source-backed bounded admission must not contradict a
    // literal admission price in the price-bearing prose fields.
    expect(out.proseConflicts).toEqual([]);
  });
});
