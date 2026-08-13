import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import { destinationsValidator } from "@/../scripts/validators/destinations";
import { DEFAULT_VALIDATION_CONFIG } from "@/../scripts/config/validation-rules";
import type { CatalogData } from "@/../scripts/validators/types";

interface DestinationRecord {
  id: string;
  transportZoneId?: string;
  localAccessModes?: string[];
  transportOptions?: Record<string, number>;
  [key: string]: any;
}

const catalogue = destinationsIndex as DestinationRecord[];

/** Island zones with no conventional rail (KAI-63). */
const RAIL_LESS_ISLAND_ZONES = new Set([
  "ogasawara",
  "sado",
  "ishigaki",
  "miyako",
  "amami",
  "yakushima",
  "tsushima",
  "naoshima",
  "teshima",
  "tomogashima",
]);

const BUS_ONLY_ZONES = new Set(["ogasawara", "tomogashima"]);

const GROUND_MODES = ["train", "shinkansen", "car", "my_car", "bus"] as const;

const CANONICAL_KEYS = new Set([
  "train",
  "shinkansen",
  "car",
  "my_car",
  "bus",
  "flight",
  "ferry",
]);

function catalogueWith(...records: DestinationRecord[]): CatalogData {
  return {
    destinations: records as any,
    collections: [],
  };
}

function runValidator(catalog: CatalogData) {
  return destinationsValidator.validate({
    catalog,
    config: DEFAULT_VALIDATION_CONFIG,
  });
}

describe("transport truthfulness (KAI-63) — catalogue data", () => {
  it("has records to test", () => {
    expect(catalogue.length).toBeGreaterThan(0);
  });

  it("no rail-less island record claims train/shinkansen", () => {
    const offenders = catalogue.filter(
      (r) =>
        r.transportZoneId &&
        RAIL_LESS_ISLAND_ZONES.has(r.transportZoneId) &&
        (r.transportOptions?.["train"] !== undefined ||
          r.transportOptions?.["shinkansen"] !== undefined),
    );
    expect(offenders.map((r) => r.id)).toEqual([]);
  });

  it("no bus-only zone record claims car/my_car", () => {
    const offenders = catalogue.filter(
      (r) =>
        r.transportZoneId &&
        BUS_ONLY_ZONES.has(r.transportZoneId) &&
        (r.transportOptions?.["car"] !== undefined ||
          r.transportOptions?.["my_car"] !== undefined),
    );
    expect(offenders.map((r) => r.id)).toEqual([]);
  });

  it("no record claims a ground mode outside its localAccessModes", () => {
    const offenders = catalogue.filter((r) => {
      if (!r.localAccessModes || !r.transportOptions) return false;
      const allowed = new Set(r.localAccessModes);
      return GROUND_MODES.some(
        (m) => r.transportOptions![m] !== undefined && !allowed.has(m),
      );
    });
    expect(offenders.map((r) => r.id)).toEqual([]);
  });

  it("every transportOptions key is a canonical transport mode", () => {
    const offenders = catalogue.flatMap((r) =>
      Object.keys(r.transportOptions ?? {}).filter(
        (k) => !CANONICAL_KEYS.has(k),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("okinawa-main keeps its Yui Rail train keys", () => {
    const naha = catalogue.find((r) => r.id === "naha-city")!;
    expect(naha.transportZoneId).toBe("okinawa-main");
    expect(naha.transportOptions?.["train"]).toBe(200);
  });
});

describe("transport truthfulness (KAI-63) — validator rules fire", () => {
  it("unmutated catalogue has no V-* transport truthfulness errors", async () => {
    const res = await runValidator(catalogueWith(...catalogue));
    const transportIssues = res.issues.filter((i) => i.code.startsWith("V-"));
    expect(transportIssues).toEqual([]);
    expect(res.passed).toBe(true);
  });

  it("V-ISLAND-RAIL: train on a rail-less island zone fails validation", async () => {
    const base = catalogue.find((r) => r.id === "ishigaki-city")!;
    const mutated: DestinationRecord = {
      ...base,
      transportOptions: { ...base.transportOptions, train: 200 },
    };
    const res = await runValidator(catalogueWith(mutated));
    const hit = res.issues.find(
      (i) => i.code === "V-ISLAND-RAIL" && i.severity === "error",
    );
    expect(hit).toBeDefined();
    expect(hit!.targetId).toBe("ishigaki-city");
  });

  it("V-CAR-ZONE: car on a bus-only island zone fails validation", async () => {
    const base = catalogue.find((r) => r.id === "ogasawara-islands-tokyo")!;
    const mutated: DestinationRecord = {
      ...base,
      transportOptions: { ...base.transportOptions, car: 60 },
    };
    const res = await runValidator(catalogueWith(mutated));
    const hit = res.issues.find(
      (i) => i.code === "V-CAR-ZONE" && i.severity === "error",
    );
    expect(hit).toBeDefined();
    expect(hit!.targetId).toBe("ogasawara-islands-tokyo");
  });

  it("V-LOCAL-ACCESS: ground mode outside localAccessModes fails validation", async () => {
    const base = catalogue.find((r) => r.id === "kouri-island-okinawa")!;
    expect(base.localAccessModes).not.toContain("train");
    const mutated: DestinationRecord = {
      ...base,
      transportOptions: { ...base.transportOptions, train: 180 },
    };
    const res = await runValidator(catalogueWith(mutated));
    const hit = res.issues.find(
      (i) => i.code === "V-LOCAL-ACCESS" && i.severity === "error",
    );
    expect(hit).toBeDefined();
    expect(hit!.targetId).toBe("kouri-island-okinawa");
  });

  it("V-MODE-KEY: non-canonical transportOptions key fails validation", async () => {
    const base = catalogue.find((r) => r.id === "hita-onsen")!;
    const mutated: DestinationRecord = {
      ...base,
      transportOptions: { ...base.transportOptions, walk: 15 },
    };
    const res = await runValidator(catalogueWith(mutated));
    const hit = res.issues.find(
      (i) => i.code === "V-MODE-KEY" && i.severity === "error",
    );
    expect(hit).toBeDefined();
    expect(hit!.targetId).toBe("hita-onsen");
  });
});
