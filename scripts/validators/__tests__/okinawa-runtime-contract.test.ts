import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import { REQUIRED_RATING_KEYS } from "@/shared/types/destination";

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
  }
});
