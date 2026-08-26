import { describe, expect, it } from "vitest";
import {
  collectDestinationIssues,
  PREVENTIVE_CODES,
} from "../data-quality-rules";
import type { Destination } from "@/shared/types/destination";

const base = {
  id: "kai-218-test",
  name: "KAI 218 Test",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["History"],
  heroImage: "https://example.com/img.jpg",
  description: "desc",
  highlights: ["h"],
  transportOptions: { train: 40 },
  walkingMin: 30,
  walkingSunMin: 30,
  walkingShadeMin: 30,
  indoorPercent: 0,
  ratings: {} as Destination["ratings"],
  crowd: { weekday: 1, weekend: 1, holiday: 1 },
  season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
  status: "published",
  role: "poi",
  recommendedVisitHours: { min: 1, max: 2 },
  imageMetadata: {
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "x",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:a.jpg",
  },
} as Destination;

const ctx = { zoneLocalModes: new Map() };

function codes(dest: Destination): string[] {
  return collectDestinationIssues(dest, ctx).map((i) => i.code);
}

describe("KAI-218A admission cost-fact invariants", () => {
  it("verified_paid without provenance fails (prevents silent mass-promotion)", () => {
    const dest = {
      ...base,
      admission: {
        state: "verified_paid",
        provenance: "legacy",
        cost: { kind: "bounded", min: 1500, max: 1500 },
        scope: "general_entry",
      },
    } as unknown as Destination;
    const c = codes(dest);
    expect(c).toContain("KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_SOURCE");
    expect(c).toContain("KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_PROVENANCE");
  });

  it("verified_paid with full provenance passes", () => {
    const dest = {
      ...base,
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 1500, max: 1500 },
        scope: "general_entry",
        basis: "Adult admission ¥1,500",
        sourceUrls: ["https://example.com/tickets"],
        checkedAt: "2026-08-02",
      },
    } as unknown as Destination;
    expect(codes(dest).filter((c) => c.startsWith("KAI218_"))).toEqual([]);
  });

  it("verified_free without evidence fails", () => {
    const dest = {
      ...base,
      admission: {
        state: "verified_free",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "whole_area",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain(
      "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_EVIDENCE",
    );
  });

  it("verified_free with legacy provenance fails (anti-promotion)", () => {
    const dest = {
      ...base,
      admission: {
        state: "verified_free",
        provenance: "legacy",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "whole_area",
        basis: "Free admission",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain(
      "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_SOURCE",
    );
  });

  it("documented_estimate without model provenance fails", () => {
    const dest = {
      ...base,
      admission: {
        state: "documented_estimate",
        provenance: "legacy",
        cost: { kind: "bounded", min: 500, max: 500 },
        scope: "general_entry",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain(
      "KAI218_ADMISSION_DOCUMENTED_ESTIMATE_REQUIRES_MODEL",
    );
  });

  it("variable_price with invalid open_ended.from fails", () => {
    const dest = {
      ...base,
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_product",
        cost: { kind: "open_ended", from: -100 },
        scope: "general_entry",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain("KAI218_ADMISSION_VARIABLE_INVALID_FROM");
  });

  it("admission fact drifting from legacy tickets fails", () => {
    const dest = {
      ...base,
      budgetBreakdown: { transport: 0, tickets: 500, food: 0, cafe: 0 },
      admission: {
        state: "verified_paid",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 1500, max: 1500 },
        scope: "general_entry",
        sourceUrls: ["https://example.com"],
        checkedAt: "2026-08-02",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain("KAI218_ADMISSION_LEGACY_DRIFT");
  });

  it("variable_price as fabricated bounded range fails", () => {
    const dest = {
      ...base,
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_product",
        cost: { kind: "bounded", min: 700, max: 1400 },
        scope: "general_entry",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain("KAI218_ADMISSION_VARIABLE_NEVER_BOUNDED");
  });

  it("not_applicable without reasonCode fails", () => {
    const dest = {
      ...base,
      admission: {
        state: "not_applicable",
        provenance: "verified_source",
        cost: { kind: "not_applicable" },
        scope: "whole_area",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain(
      "KAI218_ADMISSION_NOT_APPLICABLE_REQUIRES_REASON",
    );
  });

  it("legacy_unverified forward state fails", () => {
    const dest = {
      ...base,
      admission: {
        state: "legacy_unverified",
        provenance: "legacy",
        cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
        scope: "general_entry",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain("KAI218_ADMISSION_LEGACY_UNVERIFIED");
  });
});

describe("KAI-218A local-transport fact invariants", () => {
  it("verified_walking without evidence fails (bare 0 forbidden)", () => {
    const dest = {
      ...base,
      localTransport: {
        kind: "verified_walking",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain(
      "KAI218_LOCAL_TRANSPORT_WALKING_REQUIRES_EVIDENCE",
    );
  });

  it("verified_required_access without source fails", () => {
    const dest = {
      ...base,
      localTransport: {
        kind: "verified_required_access",
        access: "rail",
        fare: [200, 400],
        coverage: "all_day",
        basis: "JR station 5 min walk from the destination gate",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain("KAI218_LOCAL_TRANSPORT_REQUIRES_SOURCE");
  });

  it("verified_required_access without basis fails (generic allowance forbidden)", () => {
    const dest = {
      ...base,
      localTransport: {
        kind: "verified_required_access",
        access: "rail",
        fare: [200, 400],
        coverage: "all_day",
        sourceUrls: ["https://example.com/operator"],
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain("KAI218_LOCAL_TRANSPORT_REQUIRES_BASIS");
  });

  it("bounded_defensible_access without source fails", () => {
    const dest = {
      ...base,
      localTransport: {
        kind: "bounded_defensible_access",
        access: "rail",
        band: "≤15km",
        fare: [200, 800],
        distanceKm: 12,
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain(
      "KAI218_LOCAL_TRANSPORT_BOUNDED_REQUIRES_SOURCE",
    );
  });

  it("valid bounded_defensible_access passes", () => {
    const dest = {
      ...base,
      localTransport: {
        kind: "bounded_defensible_access",
        access: "rail",
        band: "≤15km",
        fare: [200, 800],
        distanceKm: 12,
        sourceUrls: ["https://example.com/operator"],
      },
    } as unknown as Destination;
    expect(codes(dest).filter((c) => c.startsWith("KAI218_"))).toEqual([]);
  });

  it("unavailable without detail fails", () => {
    const dest = {
      ...base,
      localTransport: {
        kind: "unavailable",
        reason: "no_on_site_evidence",
      },
    } as unknown as Destination;
    expect(codes(dest)).toContain(
      "KAI218_LOCAL_TRANSPORT_UNAVAILABLE_REQUIRES_DETAIL",
    );
  });
});

describe("KAI-218A preventive codes", () => {
  it("all KAI-218 codes are registered as preventive (hard errors)", () => {
    const kai218Codes = [
      "KAI218_ADMISSION_LEGACY_UNVERIFIED",
      "KAI218_ADMISSION_UNKNOWN_STATE",
      "KAI218_ADMISSION_MISSING_COST",
      "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_BOUNDED",
      "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_SOURCE",
      "KAI218_ADMISSION_VERIFIED_PAID_REQUIRES_PROVENANCE",
      "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_ZERO",
      "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_SOURCE",
      "KAI218_ADMISSION_VERIFIED_FREE_REQUIRES_EVIDENCE",
      "KAI218_ADMISSION_DOCUMENTED_ESTIMATE_REQUIRES_MODEL",
      "KAI218_ADMISSION_DOCUMENTED_ESTIMATE_COST",
      "KAI218_ADMISSION_VARIABLE_NEVER_BOUNDED",
      "KAI218_ADMISSION_VARIABLE_INVALID_FROM",
      "KAI218_ADMISSION_VARIABLE_REQUIRES_REASON",
      "KAI218_ADMISSION_NOT_APPLICABLE_COST",
      "KAI218_ADMISSION_NOT_APPLICABLE_REQUIRES_REASON",
      "KAI218_ADMISSION_UNAVAILABLE_COST",
      "KAI218_ADMISSION_UNAVAILABLE_REQUIRES_REASON",
      "KAI218_ADMISSION_LEGACY_DRIFT",
      "KAI218_ADMISSION_INVALID_REVIEW_INTERVAL",
      "KAI218_ADMISSION_INVALID_CHECKED_AT",
      "KAI218_LOCAL_TRANSPORT_INVALID_FARE",
      "KAI218_LOCAL_TRANSPORT_REQUIRES_SOURCE",
      "KAI218_LOCAL_TRANSPORT_REQUIRES_BASIS",
      "KAI218_LOCAL_TRANSPORT_BOUNDED_REQUIRES_SOURCE",
      "KAI218_LOCAL_TRANSPORT_INVALID_DISTANCE",
      "KAI218_LOCAL_TRANSPORT_WALKING_REQUIRES_EVIDENCE",
      "KAI218_LOCAL_TRANSPORT_UNAVAILABLE_REQUIRES_DETAIL",
      "KAI218_LOCAL_TRANSPORT_NOT_APPLICABLE_REQUIRES_REASON",
    ];
    for (const code of kai218Codes) {
      expect(PREVENTIVE_CODES.has(code), `${code} must be preventive`).toBe(
        true,
      );
    }
  });
});
