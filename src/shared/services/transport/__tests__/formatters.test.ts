import { describe, expect, it } from "vitest";
import { formatTravelEstimateLabel } from "../formatters";

describe("formatTravelEstimateLabel", () => {
  it("labels rough fallback ranges instead of pretending they are routed", () => {
    expect(
      formatTravelEstimateLabel({
        timeRange: [51, 74],
        evidence: "estimated",
        estimateSource: "rough",
        confidence: "medium",
      }),
    ).toBe("Rough estimate: 51 min – 1h 14m");
  });

  it("suppresses false precision for low-confidence regional transit", () => {
    expect(
      formatTravelEstimateLabel({
        timeRange: [180, 420],
        evidence: "estimated",
        estimateSource: "rough",
        confidence: "low",
      }),
    ).toBe("Travel time uncertain — check directions");
  });

  it("keeps routed estimates authoritative without the rough prefix", () => {
    expect(
      formatTravelEstimateLabel({
        timeRange: [82, 82],
        evidence: "verified",
        estimateSource: "routed",
        confidence: "high",
      }),
    ).toBe("1h 22m");
  });
});
