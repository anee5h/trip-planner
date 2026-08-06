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

describe("resolveOriginMunicipalityId — confidence guard", () => {
  it("nearly equidistant hubs of different municipalities → undefined", () => {
    const a = dest({
      id: "hub-a",
      role: "hub",
      municipalityId: "Tokyo:a",
      coordinates: { lat: HOME.lat + 0.005, lng: HOME.lng }, // ~0.56 km
    });
    const b = dest({
      id: "hub-b",
      role: "hub",
      municipalityId: "Tokyo:b",
      coordinates: { lat: HOME.lat + 0.01, lng: HOME.lng }, // ~1.11 km
    });
    // gap 0.55 km < max(1.0, 0.28) → not confident → no guess
    expect(resolveOriginMunicipalityId(HOME, [a, b])).toBeUndefined();
  });

  it("multiple hubs of one municipality collapse to the nearest one", () => {
    const t1 = dest({
      id: "taito-1",
      role: "hub",
      municipalityId: "Tokyo:taito",
      coordinates: { lat: HOME.lat + 0.011, lng: HOME.lng }, // ~1.22 km
    });
    const t2 = dest({
      id: "taito-2",
      role: "hub",
      municipalityId: "Tokyo:taito",
      coordinates: { lat: HOME.lat + 0.01, lng: HOME.lng }, // ~1.11 km
    });
    const bunkyo = dest({
      id: "bunkyo-city",
      role: "hub",
      municipalityId: "Tokyo:bunkyo",
      coordinates: { lat: HOME.lat + 0.03, lng: HOME.lng }, // ~3.33 km
    });
    // nearest per municipality: taito 1.11 km, bunkyo 3.33 km → confident
    expect(resolveOriginMunicipalityId(HOME, [t1, t2, bunkyo])).toBe(
      "Tokyo:taito",
    );
  });

  it("distant nearest hub with a close runner-up → undefined (boundary town)", () => {
    const suginami = dest({
      id: "suginami-city",
      role: "hub",
      municipalityId: "Tokyo:suginami",
      coordinates: { lat: HOME.lat + 0.046, lng: HOME.lng }, // ~5.11 km
    });
    const chofu = dest({
      id: "chofu-tokyo",
      role: "hub",
      municipalityId: "Tokyo:chofu",
      coordinates: { lat: HOME.lat + 0.06, lng: HOME.lng }, // ~6.67 km
    });
    // gap 1.56 km < max(1.0, 2.56) → not confident → no guess
    expect(
      resolveOriginMunicipalityId(HOME, [suginami, chofu]),
    ).toBeUndefined();
  });

  it("clearly dominant nearest hub resolves to its municipality", () => {
    const shinjuku = dest({
      id: "shinjuku-city",
      role: "hub",
      municipalityId: "Tokyo:shinjuku",
      coordinates: { lat: HOME.lat + 0.005, lng: HOME.lng }, // ~0.56 km
    });
    const chiyoda = dest({
      id: "chiyoda-city",
      role: "hub",
      municipalityId: "Tokyo:chiyoda",
      coordinates: { lat: HOME.lat + 0.05, lng: HOME.lng }, // ~5.56 km
    });
    expect(resolveOriginMunicipalityId(HOME, [shinjuku, chiyoda])).toBe(
      "Tokyo:shinjuku",
    );
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
