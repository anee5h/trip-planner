import { describe, expect, it } from "vitest";
import groundRoutesData from "@/shared/data/ground-routes.json";
import flightRoutesData from "@/shared/data/flight-estimates.json";
import busRoutesData from "@/shared/data/bus-routes.json";
import destinationsData from "@/shared/data/destinations-index.json";
import airportsData from "@/shared/data/airports.json";
import { MUNICIPALITY_BUS_SLUG } from "../BusRouteEstimator";
import {
  MUNICIPALITY_SHINKANSEN_HUB_IDS,
  SHINKANSEN_ACCESS_HUBS,
} from "../GroundRouteEstimator";
import { getAuditReferenceToday } from "../../../../../scripts/config/audit-reference";
import { findContradictoryGroundDuplicates } from "../../../../../scripts/validators/ground-duplicates";

/**
 * KAI-12 regression gate: deterministic invariants on the live transport
 * registries. These mirror the validator checks in
 * scripts/validators/transport-topology.ts and must hold for the committed
 * data at all times — a future edit cannot silently reintroduce duplicate
 * corridors, invalid time ranges, missing provenance, or future dates.
 */
const REFERENCE_TODAY = getAuditReferenceToday();

const groundRoutes = (
  groundRoutesData as unknown as {
    routes: Array<{
      from: string;
      to: string;
      bidirectional?: boolean;
      mode?: string;
      timeRange?: [number, number];
      sourceUrl?: string;
      checkedAt?: string;
      fare?: [number, number] | null;
      fareBasis?: string;
      fareSourceUrl?: string;
    }>;
    municipalityRoutes?: Array<{
      from: string;
      to: string;
      bidirectional?: boolean;
      mode?: string;
      timeRange?: [number, number];
      sourceUrl?: string;
      checkedAt?: string;
      fare?: [number, number] | null;
      fareBasis?: string;
      fareSourceUrl?: string;
    }>;
  }
).routes;

const groundMunicipalityRoutes =
  (
    groundRoutesData as unknown as {
      municipalityRoutes?: typeof groundRoutes;
    }
  ).municipalityRoutes ?? [];

const flightRoutes = (
  flightRoutesData as unknown as {
    routes: Array<{
      from: string;
      to: string;
      flightTime?: [number, number];
      checkedAt?: string;
    }>;
  }
).routes;

const busRoutes = (
  busRoutesData as unknown as {
    routes: Array<{
      from: string;
      to: string;
      mode?: string;
      durationMinutes?: [number, number];
      sourceUrl?: string;
      checkedAt?: string;
      fare?: [number, number | null] | null;
      fareVariability?: string;
      operator?: string;
      serviceName?: string;
      servicePeriod?: string;
    }>;
  }
).routes;

const airports = (
  airportsData as unknown as { airports: Array<{ code: string }> }
).airports;

describe("KAI-12 transport registry invariants", () => {
  it("ground corridors have no contradictory duplicates per registry", () => {
    // Same shared logic as the validator (ground-duplicates.ts). A reverse
    // pair is only a duplicate when one of the two records is
    // bidirectional; two opposite directional records are legal.
    for (const registry of [groundRoutes, groundMunicipalityRoutes]) {
      expect(findContradictoryGroundDuplicates(registry)).toEqual([]);
    }
  });

  it("ground duplicate semantics: same ordered pair twice is a duplicate", () => {
    const registry = [
      { from: "a", to: "b", mode: "train", bidirectional: false },
      { from: "a", to: "b", mode: "train", bidirectional: false },
    ];
    const dups = findContradictoryGroundDuplicates(registry);
    expect(dups).toHaveLength(1);
    expect(dups[0]).toMatchObject({
      route: { from: "a", to: "b" },
      existing: { from: "a", to: "b" },
    });
  });

  it("ground duplicate semantics: bidirectional A→B plus B→A is a duplicate", () => {
    const registry = [
      { from: "a", to: "b", mode: "train", bidirectional: true },
      { from: "b", to: "a", mode: "train", bidirectional: false },
    ];
    const dups = findContradictoryGroundDuplicates(registry);
    expect(dups).toHaveLength(1);
    expect(dups[0].route.from).toBe("b");
  });

  it("ground duplicate semantics: A→B plus bidirectional B→A is a duplicate", () => {
    const registry = [
      { from: "a", to: "b", mode: "train", bidirectional: false },
      { from: "b", to: "a", mode: "train", bidirectional: true },
    ];
    const dups = findContradictoryGroundDuplicates(registry);
    expect(dups).toHaveLength(1);
    expect(dups[0].route.from).toBe("b");
  });

  it("ground duplicate semantics: opposite directional records are valid", () => {
    // Regression: GroundRouteEstimator supports directional routes, so
    // A→B and B→A with bidirectional:false are two distinct services.
    const registry = [
      { from: "a", to: "b", mode: "shinkansen", bidirectional: false },
      { from: "b", to: "a", mode: "shinkansen", bidirectional: false },
    ];
    expect(findContradictoryGroundDuplicates(registry)).toEqual([]);
  });

  it("ground duplicate semantics: different modes on the same pair are valid", () => {
    const registry = [
      { from: "a", to: "b", mode: "train", bidirectional: true },
      { from: "a", to: "b", mode: "shinkansen", bidirectional: true },
    ];
    expect(findContradictoryGroundDuplicates(registry)).toEqual([]);
  });

  it("ground corridors carry a valid time range", () => {
    for (const route of [...groundRoutes, ...groundMunicipalityRoutes]) {
      expect(route.timeRange?.length).toBe(2);
      expect(route.timeRange![0]).toBeGreaterThanOrEqual(0);
      expect(route.timeRange![1]).toBeGreaterThanOrEqual(route.timeRange![0]);
    }
  });

  it("ground corridors carry provenance and no future checkedAt", () => {
    for (const route of [...groundRoutes, ...groundMunicipalityRoutes]) {
      expect(route.sourceUrl).toMatch(/^https?:\/\//);
      expect(route.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(route.checkedAt! <= REFERENCE_TODAY).toBe(true);
    }
  });

  it("flight routes have no duplicate airport pairs", () => {
    const pairs = new Set<string>();
    for (const route of flightRoutes) {
      const key = [route.from, route.to].sort().join("↔");
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it("flight routes carry a valid flightTime range", () => {
    for (const route of flightRoutes) {
      expect(route.flightTime?.length).toBe(2);
      expect(route.flightTime![0]).toBeGreaterThanOrEqual(0);
      expect(route.flightTime![1]).toBeGreaterThanOrEqual(route.flightTime![0]);
    }
  });

  it("flight routes have no future checkedAt when present", () => {
    for (const route of flightRoutes) {
      if (route.checkedAt) {
        expect(route.checkedAt <= REFERENCE_TODAY).toBe(true);
      }
    }
  });

  it("flight routes reference airports in the registry", () => {
    const codes = new Set(airports.map((a) => a.code));
    for (const route of flightRoutes) {
      expect(codes.has(route.from)).toBe(true);
      expect(codes.has(route.to)).toBe(true);
    }
  });

  it("bus corridors carry a valid duration range", () => {
    for (const route of busRoutes) {
      expect(route.durationMinutes?.length).toBe(2);
      expect(route.durationMinutes![0]).toBeGreaterThanOrEqual(0);
      expect(route.durationMinutes![1]).toBeGreaterThanOrEqual(
        route.durationMinutes![0],
      );
    }
  });

  it("bus corridors carry a valid servicePeriod class", () => {
    // KAI-66: every registered corridor states its operating window so the
    // runtime can gate night-only coaches out of same-day day-trip
    // feasibility. A future row without a class would silently regain the
    // duration-only day-trip behavior the gate exists to prevent.
    const valid = new Set(["day", "night", "mixed"]);
    for (const route of busRoutes) {
      expect(valid.has(route.servicePeriod!)).toBe(true);
    }
  });

  it("bus corridors carry provenance and no future checkedAt", () => {
    for (const route of busRoutes) {
      expect(route.sourceUrl).toMatch(/^https?:\/\//);
      expect(route.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(route.checkedAt! <= REFERENCE_TODAY).toBe(true);
    }
  });

  it("bus fares are valid ranges or null with variability", () => {
    for (const route of busRoutes) {
      if (route.fare !== null) {
        // Dynamic fares may have a null upper bound ("from ¥X"); a range
        // must never be empty or negative, and never have a null lower bound.
        expect(route.fare!.length).toBe(2);
        expect(route.fare![0]).not.toBeNull();
        expect(route.fare![0]!).toBeGreaterThanOrEqual(0);
        if (route.fare![1] !== null) {
          expect(route.fare![1]).toBeGreaterThanOrEqual(route.fare![0]!);
        }
        expect(route.fareVariability).toBeTruthy();
      }
    }
  });

  it("bus corridors have no duplicate operator rows per pair", () => {
    // Distinct products (e.g. day vs night service on the same pair, or a
    // second operator) are legitimate separate rows with their own verified
    // duration/fare. An exact duplicate (same pair + same service) is a
    // registry error.
    const pairs = new Set<string>();
    for (const route of busRoutes) {
      const key =
        [route.from, route.to].sort().join("↔") +
        "|" +
        (route.operator ?? "") +
        "|" +
        route.serviceName;
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });

  it("specific-dates-only corridors are not registered as verified availability", () => {
    // Regression (KAI-12): Tokyo↔Matsuyama (オレンジライナーえひめ night) is
    // audited specific-dates-only and the bus runtime has no date gating —
    // it must not surface as a verified daily corridor. The validator
    // rejects the pair; this live-registry check mirrors it.
    const nonDaily = new Set(["tokyo→matsuyama"]);
    for (const route of busRoutes) {
      const pair = `${route.from}→${route.to}`;
      expect(nonDaily.has(pair)).toBe(false);
    }
  });

  it("verified ground fares carry basis/source and never mix products", () => {
    // Regression (KAI-12, FARE_POLICY §5): every stored fare must describe
    // the same transport product as the duration. Conventional-train rows
    // (tokyo→nagano, tokyo→shizuoka) previously carried shinkansen fares —
    // a train duration with a shinkansen price is a mixed product and must
    // not exist. Fare rows must carry a basis and a fare-specific source.
    const validBases = new Set([
      "base",
      "base-plus-lex",
      "integrated-total",
      "non-reserved",
      "reserved",
    ]);
    for (const route of [...groundRoutes, ...groundMunicipalityRoutes]) {
      if (route.fare === undefined) continue;
      if (route.fare === null) {
        // A null fare must not carry a basis that implies a price (mirrors
        // the validator's null_ground_fare_with_basis).
        expect(route.fareBasis).toBeUndefined();
        continue;
      }
      expect(route.fareBasis).toBeDefined();
      expect(validBases.has(route.fareBasis!)).toBe(true);
      expect(route.fareSourceUrl).toMatch(/^https?:\/\//);
      if (route.mode === "train") {
        expect(route.fare).toBeUndefined();
      }
    }
  });

  it("municipality bus slugs reference real catalogue municipalities and registered corridor endpoints", () => {
    // Regression (KAI-12): a mapping like "Miyagi:yamagata" (Yamagata is in
    // Yamagata prefecture), a slug with no corridor ("yokohama"), or a key
    // for a municipality that does not exist in the catalogue would be a
    // dead or misleading wiring — never evidence of an intercity corridor.
    const municipalityIds = new Set(
      (destinationsData as unknown as Array<{ municipalityId?: string }>)
        .map((d) => d.municipalityId)
        .filter((m): m is string => Boolean(m)),
    );
    const corridorEndpoints = new Set<string>();
    for (const route of busRoutes) {
      corridorEndpoints.add(route.from);
      corridorEndpoints.add(route.to);
    }
    for (const [municipalityId, slug] of Object.entries(
      MUNICIPALITY_BUS_SLUG,
    )) {
      expect(municipalityIds.has(municipalityId)).toBe(true);
      expect(corridorEndpoints.has(slug)).toBe(true);
    }
  });

  it("Shinkansen access hubs reference real corridor endpoints and municipalities", () => {
    const municipalityIds = new Set(
      (destinationsData as unknown as Array<{ municipalityId?: string }>)
        .map((d) => d.municipalityId)
        .filter((m): m is string => Boolean(m)),
    );
    const shinkansenEndpoints = new Set<string>();
    for (const route of groundRoutes) {
      if (route.mode !== "shinkansen") continue;
      shinkansenEndpoints.add(route.from);
      shinkansenEndpoints.add(route.to);
    }
    const hubIds = new Set(SHINKANSEN_ACCESS_HUBS.map((hub) => hub.id));
    for (const hub of SHINKANSEN_ACCESS_HUBS) {
      expect(shinkansenEndpoints.has(hub.corridorEndpoint)).toBe(true);
    }
    for (const [municipalityId, hubIdsForMunicipality] of Object.entries(
      MUNICIPALITY_SHINKANSEN_HUB_IDS,
    )) {
      expect(municipalityIds.has(municipalityId)).toBe(true);
      for (const hubId of hubIdsForMunicipality) {
        expect(hubIds.has(hubId)).toBe(true);
      }
    }
  });
});
