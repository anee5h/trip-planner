/**
 * Walking provenance + >300-minute idempotence (owner final-pass review #1).
 *
 * Contract: "provenance is the unit". A model-generated walkingMin
 * (300/360/480/576 min) must NEVER be re-detected as metre-typed on a
 * second run, even when the record has NO editorial block (structured
 * walkingMetadata is the canonical marker).
 */
import { describe, expect, it } from "vitest";
import type { Destination } from "../../../src/shared/types/destination";
import { isModelOwnedWalkingMinutes, walkingModel } from "../walking-model-v1";

function baseDest(overrides: Partial<Destination>): Destination {
  return {
    id: "test-dest",
    name: "Test Dest",
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    heroImage: "",
    description: "",
    highlights: [],
    tags: [],
    reservation: "",
    parking: "",
    notes: "",
    ratings: {} as Destination["ratings"],
    ...overrides,
  } as Destination;
}

describe("isModelOwnedWalkingMinutes", () => {
  it("accepts structured walkingMetadata without any editorial block", () => {
    const d = baseDest({
      walkingMin: 360,
      walkingMetadata: {
        method: "model",
        unit: "minutes",
        modelVersion: "walking-model-v1",
      },
    });
    // No editorial block at all:
    expect(d.editorial).toBeUndefined();
    expect(isModelOwnedWalkingMinutes(d)).toBe(true);
  });

  it("accepts the legacy editorial fieldSource (backwards compatibility)", () => {
    const d = baseDest({
      walkingMin: 360,
      editorial: {
        fieldSources: {
          walkingMin: [
            {
              type: "calculated",
              url: "catalogue-model://kai-89",
              title: "walking-model-v1; walk-share estimate: 50% of 12h visit",
              accessedAt: "2026-08-14",
            },
          ],
        },
      } as Destination["editorial"],
    });
    expect(isModelOwnedWalkingMinutes(d)).toBe(true);
  });

  it("rejects a genuine legacy metre-like value without model provenance", () => {
    const d = baseDest({
      walkingMin: 4000,
      walkingMetadata: undefined,
      editorial: undefined,
    });
    expect(isModelOwnedWalkingMinutes(d)).toBe(false);
  });
});

describe("walking-model-v1 >300-minute idempotence", () => {
  const eligible = new Set(["test-dest"]);
  const trusted = new Set<string>();

  it("model-owned 360 minutes stays 360 across runs (no editorial block)", () => {
    // Run 1 state: model-generated value, structured provenance only.
    const d1 = baseDest({
      walkingMin: 360,
      walkingMetadata: {
        method: "model",
        unit: "minutes",
        modelVersion: "walking-model-v1",
        confidence: "low",
        basis: "walk-share estimate: 50% of 12h visit",
      },
    });
    const out1 = walkingModel(d1, eligible, trusted);
    // First run: no re-conversion, no re-fill — the value is already the
    // model's own minute-scale output.
    expect(out1.action).toBe("keep");

    // Run 2 (same input, as a fresh record read back from the index):
    const d2 = baseDest({
      walkingMin: 360,
      walkingMetadata: {
        method: "model",
        unit: "minutes",
        modelVersion: "walking-model-v1",
        confidence: "low",
        basis: "walk-share estimate: 50% of 12h visit",
      },
    });
    const out2 = walkingModel(d2, eligible, trusted);
    expect(out2.action).toBe("keep");
    expect(out2.walkingMin).toBeUndefined(); // never emits a replacement
  });

  it("360 minutes with legacy fieldSource provenance is also stable", () => {
    const d = baseDest({
      walkingMin: 360,
      editorial: {
        fieldSources: {
          walkingMin: [
            {
              type: "calculated",
              url: "catalogue-model://kai-89",
              title: "walking-model-v1; walk-share estimate: 50% of 12h visit",
              accessedAt: "2026-08-14",
            },
          ],
        },
      } as Destination["editorial"],
    });
    expect(walkingModel(d, eligible, trusted).action).toBe("keep");
  });

  it("genuine legacy metre value without provenance still enters the conversion path", () => {
    const d = baseDest({
      walkingMin: 4000,
      recommendedVisitHours: { min: 2, max: 4 },
      editorial: undefined,
    });
    const out = walkingModel(d, eligible, new Set(["test-dest"]));
    expect(out.action).toBe("convert");
    // 4000 m / 80 m/min = 50 min; clamped to the 4h visit window (240 min).
    expect(out.walkingMin).toBe(50);
  });

  it("legacy template metres without provenance are replaced by walk-share, never kept", () => {
    const d = baseDest({
      walkingMin: 8000,
      recommendedVisitHours: { min: 2, max: 4 },
      kind: "park",
      indoorPercent: 20,
      editorial: undefined,
    });
    const out = walkingModel(d, eligible, trusted);
    expect(out.action).toBe("fill");
    expect(out.walkingMin).toBeGreaterThan(0);
    expect(out.walkingMin).toBeLessThan(300);
  });
});

describe("walking provenance edge cases (reviewer C)", () => {
  const eligible = new Set(["test-dest"]);
  const trusted = new Set<string>();

  it("walkingMetadata.method 'model' WITHOUT unit is NOT owned (fail-fast design, validator-gated)", () => {
    const d = baseDest({
      walkingMin: 360,
      walkingMetadata: { method: "model" },
    });
    expect(isModelOwnedWalkingMinutes(d)).toBe(false);
    // Without the validate-models gate this would be re-detected as metres;
    // the gate (validate-models 'walking-provenance') rejects such records.
  });

  it("exactly METRE_LIKE boundary: model-owned 300 minutes stays keep", () => {
    const d = baseDest({
      walkingMin: 300,
      walkingMetadata: {
        method: "model",
        unit: "minutes",
        modelVersion: "walking-model-v1",
      },
    });
    expect(isModelOwnedWalkingMinutes(d)).toBe(true);
    expect(walkingModel(d, eligible, trusted).action).toBe("keep");
  });

  it("malformed fieldSources (missing/undefined title) never crash ownership", () => {
    const d = baseDest({
      walkingMin: 4000,
      editorial: {
        fieldSources: {
          walkingMin: [
            { type: "calculated", url: "x", accessedAt: "2026-08-14" } as never,
          ],
        },
      } as Destination["editorial"],
    });
    expect(isModelOwnedWalkingMinutes(d)).toBe(false);
    // A title of a FUTURE model (walking-model-v10) must not collide:
    const d2 = baseDest({
      walkingMin: 4000,
      editorial: {
        fieldSources: {
          walkingMin: [
            {
              type: "calculated",
              url: "catalogue-model://kai-89",
              title: "walking-model-v10; future model",
              accessedAt: "2026-08-14",
            },
          ],
        },
      } as Destination["editorial"],
    });
    expect(isModelOwnedWalkingMinutes(d2)).toBe(false);
  });
});
