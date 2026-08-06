/**
 * Unit tests for the catalogue integrity audit (§ audit-catalog-integrity).
 *
 * Covers the 12 required fixture cases:
 *   1. valid city child                  — no relationship findings
 *   2. child assigned to wrong city      — REL_CROSS_MUNICIPALITY_PARENT
 *   3. legitimate regional hub           — no cross-municipality error for
 *                                         non-municipality-scale parents
 *   4. missing parent                   — REL_DANGLING_PARENT
 *   5. relationship cycle               — REL_CYCLE
 *   6. invalid coordinate               — GEO_INVALID_COORDINATES
 *   7. duplicate coordinate warning     — GEO_DUPLICATE_COORDINATES
 *   8. missing visit duration           — TIME_POI_MISSING_VISIT_HOURS
 *   9. invalid visit-duration range     — TIME_INVALID_VISIT_HOURS
 *  10. source/detail mismatch           — SYNC_DETAIL_MISMATCH
 *  11. orphan detail file               — SYNC_ORPHAN_DETAIL
 *  12. generated index mismatch         — SYNC_META_STALE
 *
 * Also asserts determinism: two runs over the same input produce identical
 * output, and the audit never mutates its inputs.
 */

import { describe, expect, it } from "vitest";
import type { Destination } from "../../src/shared/types/destination.js";
import {
  runAudit,
  type DetailFileEntry,
  type AuditFinding,
} from "../audit/catalog-integrity.js";

function makeDestination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "test-dest",
    name: "Test Place",
    prefecture: "Okayama",
    region: "Chugoku",
    description: "A test destination.",
    categories: ["history"],
    tags: [],
    heroImage: "",
    highlights: ["Highlight"],
    budgetMin: 1000,
    budgetRecommended: 2000,
    budgetMax: 5000,
    transportOptions: { train: 60 },
    totalTripHours: 4,
    walkingMin: 2000,
    walkingSunMin: 1000,
    walkingShadeMin: 1000,
    indoorPercent: 50,
    ratings: {
      overall: 8,
      couple: 8,
      summer: 8,
      winter: 8,
      rain: 8,
      food: 8,
      photography: 8,
      relaxation: 8,
      value: 8,
      uniqueness: 8,
    },
    crowd: { weekday: 3, weekend: 4, holiday: 5 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    bestMonths: [1, 2, 3],
    status: "published",
    travelEstimate: { confidence: "high" },
    collections: [],
    ...overrides,
  };
}

function cityHub(
  id: string,
  overrides: Partial<Destination> = {},
): Destination {
  return makeDestination({
    id,
    name: `${id} City`,
    kind: "city",
    role: "hub",
    municipalityId: `Okayama:${id.replace("-city", "")}`,
    recommendedVisitHours: { min: 6, max: 12 },
    ...overrides,
  });
}

function codes(findings: AuditFinding[], targetId?: string): string[] {
  return findings
    .filter((f) => !targetId || f.targetId === targetId)
    .map((f) => f.code)
    .sort();
}

function runWith(
  destinations: Destination[],
  details: DetailFileEntry[] = [],
  meta: { id: string; [k: string]: unknown }[] = [],
) {
  return runAudit(destinations, details, meta);
}

describe("catalogue integrity audit", () => {
  it("1. valid city child produces no relationship findings", () => {
    const city = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    const child = makeDestination({
      id: "korakuen",
      name: "Korakuen",
      municipalityId: "Okayama:okayama",
      relationships: { parentDestinationId: "okayama-city" },
      recommendedVisitHours: { min: 3, max: 5 },
    });
    const report = runWith([city, child]);
    const relFindings = report.findings.filter((f) => f.category === "A");
    expect(relFindings).toEqual([]);
  });

  it("2. child assigned to a wrong city is flagged (REL_CROSS_MUNICIPALITY_PARENT)", () => {
    const city = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    const child = makeDestination({
      id: "bitchu-matsuyama-castle",
      municipalityId: "Okayama:takahashi",
      relationships: { parentDestinationId: "okayama-city" },
    });
    const report = runWith([city, child]);
    expect(codes(report.findings, "bitchu-matsuyama-castle")).toContain(
      "REL_CROSS_MUNICIPALITY_PARENT",
    );
  });

  it("3. legitimate cross-municipality regional hub is not flagged as an error", () => {
    // Parent is a regional area (not city/ward/town/village): municipality
    // differences are allowed and must not produce REL_CROSS_MUNICIPALITY_PARENT.
    const region = makeDestination({
      id: "izu",
      name: "Izu Peninsula",
      kind: "district",
      role: "hub",
      municipalityId: "Shizuoka:ito",
      recommendedVisitHours: { min: 8, max: 14 },
    });
    const child = makeDestination({
      id: "izu-shuzenji",
      name: "Shuzenji",
      prefecture: "Shizuoka",
      municipalityId: "Shizuoka:izu",
      relationships: { parentDestinationId: "izu" },
    });
    const report = runWith([region, child]);
    expect(codes(report.findings, "izu-shuzenji")).not.toContain(
      "REL_CROSS_MUNICIPALITY_PARENT",
    );
  });

  it("4. missing parent is flagged (REL_DANGLING_PARENT)", () => {
    const child = makeDestination({
      id: "orphan-poi",
      relationships: { parentDestinationId: "nowhere-city" },
    });
    const report = runWith([child]);
    expect(codes(report.findings, "orphan-poi")).toContain(
      "REL_DANGLING_PARENT",
    );
  });

  it("5. relationship cycle is flagged (REL_CYCLE)", () => {
    const a = cityHub("a-city");
    const b = cityHub("b-city");
    a.relationships = { parentDestinationId: "b-city" };
    b.relationships = { parentDestinationId: "a-city" };
    const report = runWith([a, b]);
    expect(codes(report.findings)).toContain("REL_CYCLE");
  });

  it("6. invalid coordinate is flagged (GEO_INVALID_COORDINATES)", () => {
    const dest = makeDestination({
      id: "bad-coords",
      coordinates: { lat: Number.NaN, lng: 139.7 },
    });
    const report = runWith([dest]);
    expect(codes(report.findings, "bad-coords")).toContain(
      "GEO_INVALID_COORDINATES",
    );
  });

  it("7. duplicate coordinate warning (GEO_DUPLICATE_COORDINATES)", () => {
    const a = makeDestination({
      id: "copy-a",
      coordinates: { lat: 34.8089, lng: 133.6222 },
    });
    const b = makeDestination({
      id: "copy-b",
      coordinates: { lat: 34.80891, lng: 133.62221 },
    });
    const report = runWith([a, b]);
    expect(codes(report.findings)).toContain("GEO_DUPLICATE_COORDINATES");
  });

  it("8. published POI missing visit duration (TIME_POI_MISSING_VISIT_HOURS)", () => {
    const poi = makeDestination({
      id: "no-hours-poi",
      role: "poi",
      recommendedVisitHours: undefined,
    });
    const report = runWith([poi]);
    expect(codes(report.findings, "no-hours-poi")).toContain(
      "TIME_POI_MISSING_VISIT_HOURS",
    );
  });

  it("9. invalid visit-duration range (TIME_INVALID_VISIT_HOURS)", () => {
    const poi = makeDestination({
      id: "bad-range",
      recommendedVisitHours: { min: 5, max: 2 },
    });
    const report = runWith([poi]);
    expect(codes(report.findings, "bad-range")).toContain(
      "TIME_INVALID_VISIT_HOURS",
    );
  });

  it("10. source/detail mismatch (SYNC_DETAIL_MISMATCH)", () => {
    const dest = makeDestination({ id: "mismatch" });
    const detail = makeDestination({
      id: "mismatch",
      totalTripHours: 99,
    });
    const report = runWith([dest], [{ id: "mismatch", record: detail }]);
    expect(codes(report.findings, "mismatch")).toContain(
      "SYNC_DETAIL_MISMATCH",
    );
  });

  it("11. orphan detail file (SYNC_ORPHAN_DETAIL)", () => {
    const dest = makeDestination({ id: "only-index" });
    const orphan = makeDestination({ id: "ghost-detail" });
    const report = runWith([dest], [{ id: "ghost-detail", record: orphan }]);
    expect(codes(report.findings, "ghost-detail")).toContain(
      "SYNC_ORPHAN_DETAIL",
    );
  });

  it("12. stale generated meta entry (SYNC_META_STALE)", () => {
    const dest = makeDestination({
      id: "castle",
      role: "standalone",
      kind: "castle",
      status: "published",
    });
    const report = runWith(
      [dest],
      [],
      [{ id: "castle", role: "poi", kind: "attraction", status: "beta" }],
    );
    expect(codes(report.findings, "castle")).toContain("SYNC_META_STALE");
  });

  it("audit output is deterministic across runs, even with a delay between them", async () => {
    const city = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    const child = makeDestination({
      id: "korakuen",
      municipalityId: "Okayama:okayama",
      relationships: { parentDestinationId: "okayama-city" },
      coordinates: { lat: 34.7, lng: 133.9 },
    });
    const wrong = makeDestination({
      id: "wrong-city-child",
      municipalityId: "Okayama:takahashi",
      relationships: { parentDestinationId: "okayama-city" },
    });
    const input = [city, child, wrong];
    // The pure audit must not embed a clock: a fixed timestamp keeps two
    // runs byte-identical even when wall-clock time moves between them.
    const fixed = "2026-08-06T00:00:00.000Z";
    const first = runAudit(input, [], [], { generatedAt: fixed });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const second = runAudit(input, [], [], { generatedAt: fixed });
    expect(second).toEqual(first);
    expect(second.generatedAt).toBe(fixed);
  });

  it("pure audit omits generatedAt when the caller provides none", () => {
    const report = runWith([cityHub("okayama-city")]);
    expect(report.generatedAt).toBeUndefined();
  });

  it("audit never mutates catalogue input", () => {
    const city = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    const child = makeDestination({
      id: "korakuen",
      municipalityId: "Okayama:okayama",
      relationships: { parentDestinationId: "okayama-city" },
    });
    const snapshot = JSON.parse(JSON.stringify([city, child]));
    runWith([city, child]);
    expect(JSON.parse(JSON.stringify([city, child]))).toEqual(snapshot);
  });

  // ---------------------------------------------------------------------
  // Recommendation-impact membership (parent's featured list, not the
  // child's own): structural child only / featured-only / both / neither.
  // ---------------------------------------------------------------------

  /** Candidate via its own cross-prefecture ref (REL_CROSS_PREFECTURE_REF). */
  function crossPrefRef(id: string, refId: string): Destination {
    return makeDestination({
      id,
      relationships: { nearbyDestinationIds: [refId] },
    });
  }

  /** A hub record in another prefecture so the cross-prefecture ref fires. */
  function refHub(id: string, prefecture: string): Destination {
    return makeDestination({
      id,
      prefecture,
      role: "hub",
      kind: "city",
      municipalityId: `${prefecture}:${id.replace("-city", "")}`,
      relationships: {},
    });
  }

  it("impact: structural child only (contained, not featured)", () => {
    const hub = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    hub.relationships = { featuredDestinationIds: [] };
    const child = crossPrefRef("korakuen", "fukuoka-city");
    child.municipalityId = "Okayama:okayama";
    child.relationships = {
      parentDestinationId: "okayama-city",
      nearbyDestinationIds: ["fukuoka-city"],
    };
    const report = runWith([hub, child, refHub("fukuoka-city", "Fukuoka")]);
    const impact = report.impact["korakuen"];
    expect(impact.childContainedByParent).toBe(true);
    expect(impact.childFeaturedByParent).toBe(false);
    expect(impact.childItineraryCandidate).toBe(true);
  });

  it("impact: featured-only destination (hub features a non-child)", () => {
    const hub = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    const castle = crossPrefRef("bitchu-matsuyama-castle", "nagasaki-city");
    castle.municipalityId = "Okayama:takahashi";
    castle.relationships = {
      nearbyDestinationIds: ["nagasaki-city"],
    };
    // Hub features the castle (different municipality) → featured-only link.
    hub.relationships = { featuredDestinationIds: ["bitchu-matsuyama-castle"] };
    const report = runWith([hub, castle, refHub("nagasaki-city", "Nagasaki")]);
    const hubImpact = report.impact["okayama-city"];
    expect(hubImpact.featuredOnlyRefs).toEqual(["bitchu-matsuyama-castle"]);
    // The castle itself has no parent: it is neither contained nor featured
    // by a parent — its itinerary relevance exists only via the hub's
    // featured-only link.
    const castleImpact = report.impact["bitchu-matsuyama-castle"];
    expect(castleImpact.childContainedByParent).toBe(false);
    expect(castleImpact.childFeaturedByParent).toBe(false);
    expect(castleImpact.childItineraryCandidate).toBe(false);
  });

  it("impact: both (child that is also featured by its parent)", () => {
    const hub = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    hub.relationships = { featuredDestinationIds: ["korakuen"] };
    const child = crossPrefRef("korakuen", "fukuoka-city");
    child.municipalityId = "Okayama:okayama";
    child.relationships = {
      parentDestinationId: "okayama-city",
      nearbyDestinationIds: ["fukuoka-city"],
    };
    const report = runWith([hub, child, refHub("fukuoka-city", "Fukuoka")]);
    const impact = report.impact["korakuen"];
    expect(impact.childContainedByParent).toBe(true);
    expect(impact.childFeaturedByParent).toBe(true);
    expect(impact.childItineraryCandidate).toBe(true);
    expect(impact.featuredOnlyRefs).toEqual([]);
  });

  it("impact: neither (no parent, not featured anywhere)", () => {
    const hub = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    hub.relationships = { featuredDestinationIds: [] };
    const dest = crossPrefRef("standalone-dest", "nagasaki-city");
    const report = runWith([hub, dest, refHub("nagasaki-city", "Nagasaki")]);
    const impact = report.impact["standalone-dest"];
    expect(impact.childContainedByParent).toBe(false);
    expect(impact.childFeaturedByParent).toBe(false);
    expect(impact.childItineraryCandidate).toBe(false);
    expect(impact.featuredOnlyRefs).toEqual([]);
  });

  it("impact: parent place count and capacity are still reported", () => {
    const city = cityHub("okayama-city", { municipalityId: "Okayama:okayama" });
    const child = makeDestination({
      id: "wrong-city-child",
      municipalityId: "Okayama:takahashi",
      relationships: { parentDestinationId: "okayama-city" },
      recommendedVisitHours: { min: 3, max: 5 },
    });
    const report = runWith([city, child]);
    const impact = report.impact["wrong-city-child"];
    expect(impact).toBeDefined();
    expect(impact.parentPlaceCount).toBe(1);
    expect(impact.parentWeekendCapacityMinutes).toBe(720);
    expect(impact.parentWeekendEligible).toBe(true);
    expect(impact.childCityFilterMunicipalityId).toBe("Okayama:takahashi");
  });

  // ---------------------------------------------------------------------
  // Duplicate-coordinate severity: related pairs downgraded, unrelated kept.
  // ---------------------------------------------------------------------

  it("geo: direct parent/child pair sharing coordinates is info, not a warning", () => {
    const hub = cityHub("kawagoe-city", {
      municipalityId: "Saitama:kawagoe",
      prefecture: "Saitama",
      coordinates: { lat: 35.925, lng: 139.486 },
    });
    const poi = makeDestination({
      id: "kurazukuri-warehouse-district",
      prefecture: "Saitama",
      municipalityId: "Saitama:kawagoe",
      role: "poi",
      relationships: { parentDestinationId: "kawagoe-city" },
      coordinates: { lat: 35.9251, lng: 139.4861 },
    });
    const report = runWith([hub, poi]);
    const findings = report.findings.filter(
      (f) => f.code === "GEO_DUPLICATE_COORDINATES",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].details?.reason).toBe(
      "direct parent/child pair sharing the site",
    );
  });

  it("geo: same-site hub/POI anchor (not parent/child) is info", () => {
    const hub = cityHub("shinjuku-city", {
      municipalityId: "Tokyo:shinjuku",
      prefecture: "Tokyo",
      coordinates: { lat: 35.694, lng: 139.703 },
    });
    const garden = makeDestination({
      id: "shinjuku-gyo-en",
      prefecture: "Tokyo",
      role: "poi",
      coordinates: { lat: 35.6941, lng: 139.7031 },
    });
    const report = runWith([hub, garden]);
    const findings = report.findings.filter(
      (f) => f.code === "GEO_DUPLICATE_COORDINATES",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].details?.reason).toBe("same-site hub/POI anchor");
  });

  it("geo: unrelated destinations sharing coordinates stay a warning", () => {
    const a = makeDestination({
      id: "copy-a",
      role: "poi",
      coordinates: { lat: 34.8089, lng: 133.6222 },
    });
    const b = makeDestination({
      id: "copy-b",
      role: "poi",
      coordinates: { lat: 34.80891, lng: 133.62221 },
    });
    const report = runWith([a, b]);
    const findings = report.findings.filter(
      (f) => f.code === "GEO_DUPLICATE_COORDINATES",
    );
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("warning");
  });
});
