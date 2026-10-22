import { describe, it, expect } from "vitest";
import {
  getOpeningHoursAssessment,
  requiresOpeningHours,
  hasVerifiedOpeningHours,
  getOpeningHoursWindow,
  isOpeningHoursClosedOnDate,
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
    expect(assessment.scheduleStatus).toBe("schedulable");
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

  it("rejects impossible calendar dates as verified (2026-02-30 rolls over otherwise)", () => {
    const assessment = getOpeningHoursAssessment({
      id: "leap-rollover",
      businessHours: "09:00 - 17:00",
      openingHoursMetadata: {
        verifiedAt: "2026-02-30",
        sourceUrl: "https://example.com/hours",
      },
    } as Destination);
    expect(assessment.status).toBe("unverified");
  });

  it("rejects non-ISO verifiedAt formats (09/05/2026, Sep 5 2026)", () => {
    for (const bad of ["09/05/2026", "Sep 5 2026"]) {
      const assessment = getOpeningHoursAssessment({
        id: `bad-format-${bad}`,
        businessHours: "09:00 - 17:00",
        openingHoursMetadata: {
          verifiedAt: bad,
          sourceUrl: "https://example.com/hours",
        },
      } as Destination);
      expect(assessment.status).toBe("unverified");
    }
  });

  it("accepts strict ISO dates as verified when fresh", () => {
    const assessment = getOpeningHoursAssessment({
      id: "strict-iso",
      businessHours: "09:00 - 17:00",
      openingHoursMetadata: {
        verifiedAt: new Date().toISOString().split("T")[0],
        sourceUrl: "https://example.com/hours",
      },
    } as Destination);
    expect(assessment.status).toBe("verified");
  });

  it("treats hours with field-specific sourceUrl but no verification date as sourced", () => {
    const assessment = getOpeningHoursAssessment({
      id: "meta-sourced",
      businessHours: "09:00 - 17:00",
      openingHoursMetadata: { sourceUrl: "https://example.com/hours" },
    } as Destination);
    expect(assessment.status).toBe("sourced");
    expect(assessment.requiresWarning).toBe(true);
  });

  it("resolves Meiji Jingu monthly hours for the selected travel date", () => {
    const meiji = {
      id: "meiji-jingu",
      kind: "shrine",
      businessHours:
        "Opens at sunrise and closes at sunset, with times changing by month.",
      openingHoursMetadata: {
        verifiedAt: "2026-10-16",
        sourceUrl: "https://www.meijijingu.or.jp/en/visit/",
        monthlySchedule: [
          { month: 1, opensAt: "06:40", closesAt: "16:20" },
          { month: 10, opensAt: "05:40", closesAt: "16:40" },
        ],
      },
    } as unknown as Destination;
    const now = new Date("2026-10-22T12:00:00Z");

    expect(getOpeningHoursAssessment(meiji, now)).toMatchObject({
      status: "verified",
      scheduleStatus: "date_required",
      requiresWarning: true,
    });
    expect(getOpeningHoursWindow(meiji)).toBeNull();
    expect(getOpeningHoursAssessment(meiji, now, "2026-10-22")).toMatchObject({
      status: "verified",
      scheduleStatus: "schedulable",
      requiresWarning: false,
    });
    expect(getOpeningHoursWindow(meiji, "2026-10-22")).toMatchObject({
      opensAtMinutes: 5 * 60 + 40,
      closesAtMinutes: 16 * 60 + 40,
    });
    expect(getOpeningHoursWindow(meiji, "2026-01-10")).toMatchObject({
      opensAtMinutes: 6 * 60 + 40,
      closesAtMinutes: 16 * 60 + 20,
    });
    expect(hasVerifiedOpeningHours(meiji)).toBe(true);
  });

  it("keeps date-variable Skytree hours verified but warns until a date-specific window exists", () => {
    const skytree = {
      id: "tokyo-skytree-sumida",
      kind: "attraction",
      businessHours: "Hours vary by date; check the official calendar.",
      openingHoursMetadata: {
        verifiedAt: "2026-10-16",
        sourceUrl: "https://en.tokyo-skytree.jp/open-hours/",
      },
    } as unknown as Destination;
    const now = new Date("2026-10-22T12:00:00Z");

    expect(getOpeningHoursAssessment(skytree, now, "2026-10-22")).toMatchObject(
      {
        status: "verified",
        scheduleStatus: "descriptive",
        requiresWarning: true,
      },
    );
    expect(getOpeningHoursWindow(skytree, "2026-10-22")).toBeNull();
  });

  it("parses a verified interval for planner constraints instead of treating it as all-day", () => {
    const window = getOpeningHoursWindow({
      id: "ueno-zoo-fixture",
      kind: "zoo",
      businessHours: "09:30 - 17:00 (Closed Mondays)",
      openingHoursMetadata: {
        verifiedAt: new Date().toISOString().split("T")[0],
        sourceUrl:
          "https://www.tokyo-zoo.net/en/ueno/visitor-info/tickets/index.html",
      },
    } as unknown as Destination);

    expect(window).toEqual({
      opensAtMinutes: 9 * 60 + 30,
      closesAtMinutes: 17 * 60,
      closedWeekdays: [1],
    });
  });

  it("respects a represented closed weekday when a planning date is supplied", () => {
    const destination = {
      id: "ueno-zoo-fixture",
      kind: "zoo",
      businessHours: "09:30 - 17:00 (Closed Mondays)",
      openingHoursMetadata: {
        verifiedAt: new Date().toISOString().split("T")[0],
        sourceUrl:
          "https://www.tokyo-zoo.net/en/ueno/visitor-info/tickets/index.html",
      },
    } as unknown as Destination;

    expect(isOpeningHoursClosedOnDate(destination, "2026-09-07")).toBe(true);
    expect(isOpeningHoursClosedOnDate(destination, "2026-09-08")).toBe(false);
  });
});
