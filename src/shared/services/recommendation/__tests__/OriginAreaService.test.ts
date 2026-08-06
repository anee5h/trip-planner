import { describe, it, expect } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  resolveOriginMunicipalityId,
  isOriginLocalDestination,
  ORIGIN_AREA_RADIUS_KM,
} from "../OriginAreaService";

// ── Helpers ──────────────────────────────────────────────────────────────────

type DestOverrides = Omit<Partial<Destination>, "ratings"> & {
  id: string;
  ratings?: Partial<Destination["ratings"]>;
};

function dest(overrides: DestOverrides): Destination {
  return {
    name: overrides.name ?? overrides.id,
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    heroImage: "",
    description: "",
    highlights: [],
    budgetRecommended: 5000,
    budgetMin: 3000,
    budgetMax: 10000,
    transportOptions: {},
    totalTripHours: 1,
    walkingMin: 10,
    walkingSunMin: 5,
    walkingShadeMin: 5,
    indoorPercent: 0,
    ratings: { overall: 5, food: 5, summer: 5, winter: 5 },
    ...overrides,
    id: overrides.id,
  } as unknown as Destination;
}

const HOME = { lat: 35.0, lng: 139.0 };

// ── resolveOriginMunicipalityId ──────────────────────────────────────────────

describe("resolveOriginMunicipalityId", () => {
  it("null coords → undefined", () => {
    expect(resolveOriginMunicipalityId(null, [])).toBeUndefined();
  });

  it("undefined coords → undefined", () => {
    expect(resolveOriginMunicipalityId(undefined, [])).toBeUndefined();
  });

  it("no hub within radius → undefined", () => {
    const farHub = dest({
      id: "far-hub",
      role: "hub",
      municipalityId: "Tokyo:chiyoda",
      // ~0.3° lat ≈ 33 km away — beyond the 20 km radius
      coordinates: { lat: HOME.lat + 0.3, lng: HOME.lng },
    });
    expect(resolveOriginMunicipalityId(HOME, [farHub])).toBeUndefined();
  });

  it("nearest hub wins over a farther hub", () => {
    const nearHub = dest({
      id: "near-hub",
      role: "hub",
      municipalityId: "Tokyo:shinjuku",
      coordinates: { lat: HOME.lat + 0.005, lng: HOME.lng }, // ~0.56 km
    });
    const farHub = dest({
      id: "far-hub",
      role: "hub",
      municipalityId: "Tokyo:chiyoda",
      coordinates: { lat: HOME.lat + 0.05, lng: HOME.lng }, // ~5.6 km
    });
    expect(resolveOriginMunicipalityId(HOME, [farHub, nearHub])).toBe(
      "Tokyo:shinjuku",
    );
  });

  it("non-hub POI with municipalityId is ignored", () => {
    const poi = dest({
      id: "poi",
      role: "poi",
      municipalityId: "Tokyo:shinjuku",
      coordinates: { lat: HOME.lat, lng: HOME.lng },
    });
    expect(resolveOriginMunicipalityId(HOME, [poi])).toBeUndefined();
  });

  it("hub without coordinates is skipped", () => {
    const noCoords = dest({
      id: "no-coords",
      role: "hub",
      municipalityId: "Tokyo:shinjuku",
    });
    expect(resolveOriginMunicipalityId(HOME, [noCoords])).toBeUndefined();
  });

  it("hub without municipalityId is skipped", () => {
    const noMuni = dest({
      id: "no-muni",
      role: "hub",
      coordinates: { lat: HOME.lat, lng: HOME.lng },
    });
    expect(resolveOriginMunicipalityId(HOME, [noMuni])).toBeUndefined();
  });

  it("radius constant is 20 km", () => {
    expect(ORIGIN_AREA_RADIUS_KM).toBe(20);
  });
});

// ── isOriginLocalDestination ─────────────────────────────────────────────────

describe("isOriginLocalDestination", () => {
  const osakaDest = dest({ id: "osaka", municipalityId: "Osaka:osaka" });

  it("same municipalityId → true", () => {
    expect(isOriginLocalDestination(osakaDest, "Osaka:osaka")).toBe(true);
  });

  it("different municipalityId → false", () => {
    expect(isOriginLocalDestination(osakaDest, "Kyoto:kyoto")).toBe(false);
  });

  it("undefined origin municipality → false (safe fallback)", () => {
    expect(isOriginLocalDestination(osakaDest, undefined)).toBe(false);
  });

  it("destination without municipalityId → false", () => {
    const noMuni = dest({ id: "no-muni" });
    expect(isOriginLocalDestination(noMuni, "Osaka:osaka")).toBe(false);
  });
});
