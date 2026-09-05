import { describe, it, expect } from "vitest";
import {
  getOpeningHoursAssessment,
  requiresOpeningHours,
  hasVerifiedOpeningHours,
} from "../OpeningHoursPolicy";
import type { Destination } from "@/shared/types/destination";

describe("OpeningHoursPolicy", () => {
  it("classifies hubs and city destinations as open area not_required", () => {
    const hub = { id: "tokyo-hub", role: "hub", kind: "city" } as Destination;
    const assessment = getOpeningHoursAssessment(hub);
    expect(assessment.accessType).toBe("open_area");
    expect(assessment.status).toBe("not_required");
    expect(requiresOpeningHours(hub)).toBe(false);
  });

  it("marks destination verified ONLY with field-specific openingHoursMetadata and usable hours", () => {
    const freshDate = new Date().toISOString().split("T")[0];
    const verifiedDest = {
      id: "skytree",
      kind: "attraction",
      businessHours: "09:00 - 21:00",
      officialWebsite: "https://tokyoskytree.jp",
      openingHoursMetadata: {
        verifiedAt: freshDate,
        sourceUrl: "https://tokyoskytree.jp",
      },
    } as unknown as Destination;

    const assessment = getOpeningHoursAssessment(verifiedDest);
    expect(assessment.status).toBe("verified");
    expect(hasVerifiedOpeningHours(verifiedDest)).toBe(true);

    const generalEditorialDest = {
      id: "shrine",
      kind: "attraction",
      businessHours: "09:00 - 17:00",
      editorial: {
        checkedAt: freshDate,
        reviewedAt: freshDate,
      },
    } as unknown as Destination;

    const generalAssessment = getOpeningHoursAssessment(generalEditorialDest);
    expect(generalAssessment.status).toBe("unverified");
    expect(hasVerifiedOpeningHours(generalEditorialDest)).toBe(false);
  });

  it("classifies future or invalid dates as unverified", () => {
    const futureDest = {
      id: "future-park",
      kind: "attraction",
      businessHours: "09:00 - 17:00",
      openingHoursMetadata: {
        verifiedAt: "2099-01-01",
        sourceUrl: "https://park.example",
      },
    } as unknown as Destination;

    const futureAssessment = getOpeningHoursAssessment(futureDest);
    expect(futureAssessment.status).toBe("unverified");
  });

  it("does not treat a date without a field source as stale or verified", () => {
    const assessment = getOpeningHoursAssessment({
      id: "date-only",
      businessHours: "09:00 - 17:00",
      openingHoursMetadata: { verifiedAt: new Date().toISOString() },
    } as Destination);
    expect(assessment.status).toBe("unverified");
  });

  it("does not certify hours from a general website link alone (KAI-335)", () => {
    const assessment = getOpeningHoursAssessment({
      id: "official-hours",
      businessHours: "09:00 - 17:00",
      officialWebsite: "https://example.com",
    } as Destination);
    expect(assessment.status).toBe("unverified");
    expect(assessment.requiresWarning).toBe(true);
  });

  it("treats hours with field-specific sourceUrl but no verification date as sourced", () => {
    const assessment = getOpeningHoursAssessment({
      id: "meta-sourced",
      businessHours: "09:00 - 17:00",
      openingHoursMetadata: { sourceUrl: "https://example.com/hours" },
    } as Destination);
    expect(assessment.status).toBe("sourced");
    expect(assessment.requiresWarning).toBe(false);
  });
});
