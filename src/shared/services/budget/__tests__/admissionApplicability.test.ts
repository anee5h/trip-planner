import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { resolveAdmissionApplicability } from "../admissionApplicability";

function destination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "kai-285-applicability",
    name: "KAI-285 applicability fixture",
    prefecture: "Tokyo",
    region: "Kanto",
    role: "poi",
    kind: "museum",
    categories: ["Museum"],
    ...overrides,
  } as Destination;
}

const notApplicable = {
  state: "not_applicable",
  provenance: "verified_source",
  reasonCode: "no_single_admission_product",
  cost: { kind: "not_applicable" },
  scope: "whole_area",
  basis: "Open-area fixture has no destination-level admission product.",
  sourceUrls: ["https://example.test/open-area"],
  checkedAt: "2026-09-09",
} as const;

describe("KAI-285 admission applicability boundary", () => {
  it("recognizes an explicit city hub N/A declaration", () => {
    expect(
      resolveAdmissionApplicability(
        destination({
          role: "hub",
          kind: "city",
          admissionApplicability: "not_applicable",
        }),
      ),
    ).toBe("not_applicable");
  });

  it("recognizes an explicit municipality N/A declaration", () => {
    expect(
      resolveAdmissionApplicability(
        destination({ kind: "town", admissionApplicability: "not_applicable" }),
      ),
    ).toBe("not_applicable");
  });

  it("recognizes an explicit open scenic/nature N/A declaration", () => {
    expect(
      resolveAdmissionApplicability(
        destination({
          kind: "lake",
          role: "standalone",
          admissionApplicability: "not_applicable",
        }),
      ),
    ).toBe("not_applicable");
  });

  it("keeps a genuinely paid POI applicable", () => {
    expect(
      resolveAdmissionApplicability(
        destination({
          kind: "museum",
          admission: {
            ...notApplicable,
            state: "verified_paid",
            provenance: "verified_source",
            cost: { kind: "bounded", min: 1000, max: 1000 },
            scope: "general_entry",
          },
        }),
      ),
    ).toBe("applicable");
  });

  it("keeps verified-free attractions applicable because ticketing is meaningful", () => {
    expect(
      resolveAdmissionApplicability(
        destination({
          kind: "garden",
          admission: {
            ...notApplicable,
            state: "verified_free",
            provenance: "verified_source",
            cost: { kind: "bounded", min: 0, max: 0 },
            scope: "general_entry",
          },
        }),
      ),
    ).toBe("applicable");
  });

  it("does not infer N/A from a missing admission fact", () => {
    expect(
      resolveAdmissionApplicability(
        destination({
          kind: "lake",
          role: "standalone",
          categories: ["Nature"],
        }),
      ),
    ).toBe("unknown");
  });

  it("does not let conflicting N/A metadata hide a persisted paid fact", () => {
    expect(
      resolveAdmissionApplicability(
        destination({
          admission: {
            ...notApplicable,
            state: "verified_paid",
            provenance: "verified_source",
            cost: { kind: "bounded", min: 1200, max: 1200 },
          },
          admissionApplicability: "not_applicable",
        }),
      ),
    ).toBe("applicable");
  });
});
