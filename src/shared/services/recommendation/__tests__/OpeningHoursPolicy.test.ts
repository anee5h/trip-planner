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

  it("marks destination verified only with hours, officialWebsite, and fresh verifiedAt date", () => {
    const freshDate = new Date().toISOString().split("T")[0];
    const verifiedDest = {
      id: "skytree",
      kind: "attraction",
      businessHours: "09:00 - 21:00",
      officialWebsite: "https://tokyoskytree.jp",
      verifiedAt: freshDate,
    } as unknown as Destination;

    const assessment = getOpeningHoursAssessment(verifiedDest);
    expect(assessment.status).toBe("verified");
    expect(hasVerifiedOpeningHours(verifiedDest)).toBe(true);

    const staleDest = {
      id: "skytree-old",
      kind: "attraction",
      businessHours: "09:00 - 21:00",
      officialWebsite: "https://tokyoskytree.jp",
      verifiedAt: "2020-01-01",
    } as unknown as Destination;

    const staleAssessment = getOpeningHoursAssessment(staleDest);
    expect(staleAssessment.status).toBe("stale");
    expect(staleAssessment.requiresWarning).toBe(true);

    const legacyUnverifiedDest = {
      id: "shrine",
      kind: "attraction",
      businessHours: "09:00 - 17:00",
    } as unknown as Destination;

    const legacyAssessment = getOpeningHoursAssessment(legacyUnverifiedDest);
    expect(legacyAssessment.status).toBe("unverified");
    expect(hasVerifiedOpeningHours(legacyUnverifiedDest)).toBe(false);
  });
});
