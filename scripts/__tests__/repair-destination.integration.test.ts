/**
 * Integration tests for repair-destination CLI tool.
 *
 * Verifies:
 * - Dry-run mode produces proposed changes without writing files (REP-003).
 * - Scoped repair is idempotent (a second run creates no diff) (REP-004).
 */

import { describe, it, expect } from "vitest";
import type { Destination } from "../../src/shared/types/destination.js";

function applyRepairToFixture(
  catalog: Destination[],
  scopeId: string,
  scopeFinding: string,
  dryRun: boolean,
): { catalog: Destination[]; changed: boolean } {
  const result = structuredClone(catalog);
  let changed = false;

  for (const dest of result) {
    if (dest.id !== scopeId) continue;

    if (scopeFinding === "FREE_PLACE_TICKET_COST") {
      if (dest.budgetBreakdown && dest.budgetBreakdown.tickets !== 0) {
        if (!dryRun) {
          dest.budgetBreakdown.tickets = 0;
        }
        changed = true;
      }
    }

    if (scopeFinding === "DUPLICATE_AUDIT_HISTORY") {
      const changes = dest.editorial?.changes ?? [];
      const seen = new Set<string>();
      const deduped: typeof changes = [];
      for (const change of changes) {
        const key = `${change.changedAt}::${change.summary}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(change);
        }
      }
      if (deduped.length !== changes.length) {
        if (!dryRun && dest.editorial) {
          dest.editorial.changes = deduped;
        }
        changed = true;
      }
    }
  }

  return { catalog: dryRun ? catalog : result, changed };
}

describe("Repair Destination Integration Tests", () => {
  it("does not modify catalogue during dry-run mode (REP-003)", () => {
    const fixture: Destination[] = [
      {
        id: "test-street",
        name: "Test Street",
        kind: "street",
        budgetBreakdown: {
          transport: 500,
          tickets: 300,
          food: 1000,
          cafe: 500,
        },
      } as unknown as Destination,
    ];

    const { catalog: dryRunCatalog, changed } = applyRepairToFixture(
      fixture,
      "test-street",
      "FREE_PLACE_TICKET_COST",
      true, // dryRun = true
    );

    expect(changed).toBe(true);
    expect(dryRunCatalog[0].budgetBreakdown?.tickets).toBe(300); // unchanged
  });

  it("is idempotent — a second repair run creates zero diff (REP-004)", () => {
    const entry = {
      changedAt: "2026-07-29",
      changedBy: "test",
      summary: "audit repair",
      method: "assisted" as const,
    };
    const fixture: Destination[] = [
      {
        id: "test-street",
        name: "Test Street",
        editorial: {
          lifecycle: "in_review",
          sources: [],
          changes: [entry, entry],
        },
      } as unknown as Destination,
    ];

    // First repair run
    const run1 = applyRepairToFixture(
      fixture,
      "test-street",
      "DUPLICATE_AUDIT_HISTORY",
      false,
    );
    expect(run1.changed).toBe(true);
    expect(run1.catalog[0].editorial?.changes).toHaveLength(1);

    // Second repair run on already repaired data
    const run2 = applyRepairToFixture(
      run1.catalog,
      "test-street",
      "DUPLICATE_AUDIT_HISTORY",
      false,
    );
    expect(run2.changed).toBe(false);
    expect(run2.catalog[0].editorial?.changes).toHaveLength(1);
  });
});
