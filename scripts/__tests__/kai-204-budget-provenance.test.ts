import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Destination } from "../../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as Destination[];

const RETIRED_FIELDS = [
  "budgetMin",
  "budgetRecommended",
  "budgetMax",
  "budgetBreakdown",
  "budgetMetadata",
] as const;

describe("KAI-220 Budget v2 catalogue contract", () => {
  it("removes every retired destination-level budget field", () => {
    const violations = destinations.flatMap((destination) =>
      RETIRED_FIELDS.filter((field) => field in destination).map(
        (field) => `${destination.id}: ${field}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it("classifies every destination with explicit admission and local transport facts", () => {
    const missing = destinations
      .filter(
        (destination) =>
          destination.admission === undefined ||
          destination.localTransport === undefined,
      )
      .map((destination) => destination.id);
    expect(missing).toEqual([]);
  });

  it("keeps verified-free as an explicit zero claim, not a missing value", () => {
    const freeFacts = destinations.filter(
      (destination) => destination.admission?.state === "verified_free",
    );
    expect(freeFacts.length).toBeGreaterThan(0);
    for (const destination of freeFacts) {
      expect(destination.admission?.provenance).toBe("verified_source");
      expect(destination.admission?.cost).toEqual({
        kind: "bounded",
        min: 0,
        max: 0,
      });
      expect(destination.admission?.basis).toMatch(
        /free|無料|no admission fee/i,
      );
    }
  });

  it("does not turn unavailable admission into a numeric zero", () => {
    for (const destination of destinations) {
      if (destination.admission?.state !== "unavailable") continue;
      expect(destination.admission.cost?.kind).toBe("unavailable");
      expect(destination.admission.cost).not.toHaveProperty("min");
    }
  });

  it("preserves current verified paid ticket facts in the explicit admission axis", () => {
    const cases: Record<string, number> = {
      "fukuoka-tower": 1000,
      "koko-en-garden": 400,
      "genbudo-cave-park": 500,
      "ikuno-silver-mine": 1200,
    };
    for (const [id, jpy] of Object.entries(cases)) {
      const destination = destinations.find((item) => item.id === id);
      expect(destination, id).toBeDefined();
      expect(destination?.admission?.state, id).toBe("verified_paid");
      expect(destination?.admission?.cost, id).toEqual({
        kind: "bounded",
        min: jpy,
        max: jpy,
      });
    }
  });
});
