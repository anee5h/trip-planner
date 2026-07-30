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

  it("marks destination verified only with hours, sourceUrl, and verifiedAt date", () => {
    const verifiedDest = {
      id: "skytree",
      kind: "attraction",
      businessHours: "09:00 - 21:00",
      officialWebsite: "https://tokyoskytree.jp",
    } as unknown as Destination;

    const assessment = getOpeningHoursAssessment(verifiedDest);
    expect(assessment.status).toBe("verified");
    expect(hasVerifiedOpeningHours(verifiedDest)).toBe(true);

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
