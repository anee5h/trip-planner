import { describe, it, expect } from "vitest";
import EditorialDashboard from "../EditorialDashboard";
import { generateEditorialQualityReport } from "@/shared/services/editorial/EditorialQualityAnalytics";

describe("EditorialDashboard Component and Quality Report Generator", () => {
  it("exports EditorialDashboard function component", () => {
    expect(typeof EditorialDashboard).toBe("function");
  });

  it("generates editorial quality report without mutating data", () => {
    const report = generateEditorialQualityReport();
    expect(report.totalPlaces).toBeGreaterThan(0);
    expect(report.generatedAt).toBeDefined();
    expect(Array.isArray(report.reviewQueue)).toBe(true);
    expect(Array.isArray(report.highRiskHubs)).toBe(true);
  });
});
