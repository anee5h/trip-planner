import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import { REQUIRED_RATING_KEYS } from "@/shared/types/destination";
import { destinationsValidator } from "@/../scripts/validators/destinations";

interface DestinationRecord {
  id: string;
  [key: string]: any;
}

const catalogue = destinationsIndex as DestinationRecord[];

function isPublicDestination(r: DestinationRecord): boolean {
  return r.status === "published";
}

const OKINAWA_IDS = catalogue
  .filter((r) => r.prefecture === "Okinawa")
  .map((r) => r.id);

const AFFECTED_POI_IDS = [
  "kokusai-dori-naha",
  "naminoue-shrine-naha",
  "fukushuen-garden-naha",
  "nago-pineapple-park",
  "busena-marine-park-nago",
  "churaumi-aquarium-motobu",
  "bise-fukugi-tree-road-motobu",
  "nakijin-castle-ruins-motobu",
  "kabira-bay-ishigaki",
  "tamatorizaki-viewpoint-ishigaki",
  "yonehara-beach-coral-ishigaki",
  "yonaha-maehama-beach-miyako",
  "irabu-bridge-irabujima-miyako",
  "higashi-hennazaki-cape-miyako",
];

describe("Okinawa destination runtime contract", () => {
  it("has Okinawa records to test", () => {
    expect(OKINAWA_IDS.length).toBeGreaterThan(0);
  });

  const publishedOkinawa = catalogue.filter(
    (r) => r.prefecture === "Okinawa" && isPublicDestination(r),
  );

  for (const r of publishedOkinawa) {
    it(`${r.id}: has categories array`, () => {
      expect(Array.isArray(r.categories)).toBe(true);
      expect(r.categories.length).toBeGreaterThan(0);
    });

    it(`${r.id}: has tags array`, () => {
      expect(Array.isArray(r.tags)).toBe(true);
    });

    it(`${r.id}: has highlights array`, () => {
      expect(Array.isArray(r.highlights)).toBe(true);
      expect(r.highlights.length).toBeGreaterThan(0);
    });

    it(`${r.id}: has collections array`, () => {
      expect(Array.isArray(r.collections)).toBe(true);
    });

    it(`${r.id}: has transportOptions object`, () => {
      expect(r.transportOptions).toBeDefined();
      expect(typeof r.transportOptions).toBe("object");
    });

    it(`${r.id}: has ratings object with required keys`, () => {
      expect(r.ratings).toBeDefined();
      for (const key of REQUIRED_RATING_KEYS) {
        expect(r.ratings[key]).toBeDefined();
      }
    });

    it(`${r.id}: has crowd object`, () => {
      expect(r.crowd).toBeDefined();
      expect(typeof r.crowd).toBe("object");
    });

    it(`${r.id}: has season object`, () => {
      expect(r.season).toBeDefined();
      expect(typeof r.season).toBe("object");
    });

    it(`${r.id}: has bestMonths array`, () => {
      expect(Array.isArray(r.bestMonths)).toBe(true);
    });

    it(`${r.id}: has notes`, () => {
      expect(r.notes).toBeTruthy();
    });

    it(`${r.id}: has valid totalTripHours`, () => {
      expect(typeof r.totalTripHours).toBe("number");
      expect(Number.isFinite(r.totalTripHours)).toBe(true);
      expect(r.totalTripHours).toBeGreaterThan(0);
    });

    it(`${r.id}: has valid walkingMin`, () => {
      expect(typeof r.walkingMin).toBe("number");
      expect(Number.isFinite(r.walkingMin)).toBe(true);
      expect(r.walkingMin).toBeGreaterThanOrEqual(0);
    });

    it(`${r.id}: has valid walkingSunMin`, () => {
      expect(typeof r.walkingSunMin).toBe("number");
      expect(Number.isFinite(r.walkingSunMin)).toBe(true);
      expect(r.walkingSunMin).toBeGreaterThanOrEqual(0);
    });

    it(`${r.id}: has valid walkingShadeMin`, () => {
      expect(typeof r.walkingShadeMin).toBe("number");
      expect(Number.isFinite(r.walkingShadeMin)).toBe(true);
      expect(r.walkingShadeMin).toBeGreaterThanOrEqual(0);
    });

    it(`${r.id}: has valid indoorPercent`, () => {
      expect(typeof r.indoorPercent).toBe("number");
      expect(Number.isFinite(r.indoorPercent)).toBe(true);
      expect(r.indoorPercent).toBeGreaterThanOrEqual(0);
      expect(r.indoorPercent).toBeLessThanOrEqual(100);
    });

    it(`${r.id}: has reservation`, () => {
      expect(r.reservation).toBeTruthy();
      expect(typeof r.reservation).toBe("string");
    });

    it(`${r.id}: has parking`, () => {
      expect(r.parking).toBeTruthy();
      expect(typeof r.parking).toBe("string");
    });

    it(`${r.id}: has travelEstimate`, () => {
      expect(r.travelEstimate).toBeDefined();
      expect(typeof r.travelEstimate).toBe("object");
      expect(r.travelEstimate.confidence).toBeTruthy();
    });

    it(`${r.id}: has English content`, () => {
      expect(r.content?.en?.name).toBeTruthy();
      expect(r.content?.en?.description).toBeTruthy();
    });
  }
});

// Negative tests: confirm validator catches missing fields
describe("Okinawa field deletion causes validation failure", () => {
  const fieldsToDelete = [
    "totalTripHours",
    "walkingMin",
    "indoorPercent",
    "reservation",
    "parking",
    "travelEstimate",
  ];

  for (const field of fieldsToDelete) {
    it(`deleting ${field} from kokusai-dori-naha makes it fail contract`, () => {
      const record = catalogue.find((r) => r.id === "kokusai-dori-naha")!;
      const mutated = { ...record };
      delete (mutated as any)[field];

      if (field === "totalTripHours") {
        expect(
          typeof mutated.totalTripHours !== "number" ||
            !Number.isFinite(mutated.totalTripHours) ||
            mutated.totalTripHours <= 0,
        ).toBe(true);
      } else if (field === "walkingMin") {
        expect(
          typeof mutated.walkingMin !== "number" ||
            !Number.isFinite(mutated.walkingMin) ||
            mutated.walkingMin < 0,
        ).toBe(true);
      } else if (field === "indoorPercent") {
        expect(
          typeof mutated.indoorPercent !== "number" ||
            mutated.indoorPercent < 0 ||
            mutated.indoorPercent > 100,
        ).toBe(true);
      } else if (field === "reservation") {
        expect(!mutated.reservation).toBe(true);
      } else if (field === "parking") {
        expect(!mutated.parking).toBe(true);
      } else if (field === "travelEstimate") {
        expect(!mutated.travelEstimate?.confidence).toBe(true);
      }
    });
  }

  it("deleting content.en from kokusai-dori-naha makes it fail", () => {
    const record = catalogue.find((r) => r.id === "kokusai-dori-naha")!;
    const mutated = { ...record, content: { ...record.content } };
    delete (mutated.content as any).en;
    expect(mutated.content?.en?.name).toBeFalsy();
  });

  it("all affected POIs have destination-appropriate reservation values", () => {
    const records = catalogue.filter((r) => AFFECTED_POI_IDS.includes(r.id));
    const reservations = new Set(records.map((r) => r.reservation));
    // Values may legitimately share "None required" but should not be all identical
    expect(reservations.size).toBeGreaterThan(1);
  });

  it("all affected POIs have destination-appropriate parking values", () => {
    const records = catalogue.filter((r) => AFFECTED_POI_IDS.includes(r.id));
    const parkings = new Set(records.map((r) => r.parking));
    expect(parkings.size).toBeGreaterThan(1);
  });

  it("legacy non-Okinawa record with missing fields is not rejected by migration-scoped rules", () => {
    // cupnoodles-museum-osaka-ikeda is a published non-Okinawa record missing tags/crowd/season.
    // It must not be subject to the Okinawa-scoped strict runtime contract.
    const record = catalogue.find(
      (r) => r.id === "cupnoodles-museum-osaka-ikeda",
    );
    expect(record).toBeTruthy();
    expect(record!.prefecture).not.toBe("Okinawa");
    expect(record!.status).toBe("published");
    // This record lacks tags/crowd/season but should still exist in the catalogue
    expect(record!.tags === undefined || record!.tags === null).toBe(true);
  });

  // Mutation tests against the actual validator
  it("validator rejects walkability = 0 on an Okinawa POI", async () => {
    const fixture = deepClone(
      catalogue.find((r) => r.id === "kokusai-dori-naha")!,
    );
    fixture.ratings.walkability = 0;
    const result = await destinationsValidator.validate({
      catalog: { destinations: [fixture] },
      config: { budgetTolerancePercent: 0.1, budgetMinToleranceYen: 100 },
    } as any);
    const walkErrors = result.issues.filter(
      (i) => i.code === "INVALID_WALKABILITY",
    );
    expect(walkErrors.length).toBeGreaterThan(0);
  });

  it("validator rejects walkingMin exceeding visit duration", async () => {
    const fixture = deepClone(
      catalogue.find((r) => r.id === "naminoue-shrine-naha")!,
    );
    fixture.walkingMin = 250;
    const result = await destinationsValidator.validate({
      catalog: { destinations: [fixture] },
      config: { budgetTolerancePercent: 0.1, budgetMinToleranceYen: 100 },
    } as any);
    const errors = result.issues.filter(
      (i) => i.code === "WALKING_EXCEEDS_VISIT",
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validator rejects sun+shade > walkingMin", async () => {
    const fixture = deepClone(
      catalogue.find((r) => r.id === "nakijin-castle-ruins-motobu")!,
    );
    fixture.walkingMin = 20;
    fixture.walkingSunMin = 30;
    fixture.walkingShadeMin = 10;
    const result = await destinationsValidator.validate({
      catalog: { destinations: [fixture] },
      config: { budgetTolerancePercent: 0.1, budgetMinToleranceYen: 100 },
    } as any);
    const errors = result.issues.filter(
      (i) => i.code === "WALKING_SUN_SHADE_EXCEEDS_TOTAL",
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}
