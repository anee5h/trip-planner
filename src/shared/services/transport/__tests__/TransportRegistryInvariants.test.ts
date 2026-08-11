import { describe, expect, it } from "vitest";
import groundRoutesData from "@/shared/data/ground-routes.json";
import flightRoutesData from "@/shared/data/flight-estimates.json";
import airportsData from "@/shared/data/airports.json";
import { getAuditReferenceToday } from "../../../../../scripts/config/audit-reference";

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
    }>;
    municipalityRoutes?: Array<{
      from: string;
      to: string;
      bidirectional?: boolean;
      mode?: string;
      timeRange?: [number, number];
      sourceUrl?: string;
      checkedAt?: string;
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

const airports = (
  airportsData as unknown as { airports: Array<{ code: string }> }
).airports;

describe("KAI-12 transport registry invariants", () => {
  it("ground corridors have no contradictory duplicates per registry", () => {
    for (const registry of [groundRoutes, groundMunicipalityRoutes]) {
      const keys = new Map<string, string>();
      for (const route of registry) {
        const key = `${route.mode}:${route.from}→${route.to}`;
        const reverse = `${route.mode}:${route.to}→${route.from}`;
        const existing = keys.get(key) ?? keys.get(reverse);
        expect(existing).toBeUndefined();
        keys.set(key, `${route.from}→${route.to}`);
      }
    }
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
});
