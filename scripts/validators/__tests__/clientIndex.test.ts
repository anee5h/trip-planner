import { describe, expect, it } from "vitest";
import fullIndex from "../../../src/shared/data/destinations-index.json";
import liteIndex from "../../../src/shared/data/destinations-index.lite.json";
import { CLIENT_INDEX_FIELDS } from "../../catalog/client-index";

/**
 * KAI-82 phase 2: the lite (client) index must stay a true subset of the
 * canonical catalogue — same ids, only whitelisted fields, and every
 * summary field the client needs present on every record.
 */
describe("KAI-82 client index parity", () => {
  const full = fullIndex as Array<Record<string, unknown>>;
  const lite = liteIndex as Array<Record<string, unknown>>;
  const allow = new Set<string>(CLIENT_INDEX_FIELDS as unknown as string[]);

  it("has exactly the same destination ids in the same order", () => {
    expect(lite.map((d) => d.id)).toEqual(full.map((d) => d.id));
  });

  it("contains only whitelisted fields", () => {
    for (const record of lite) {
      for (const key of Object.keys(record)) {
        expect(allow.has(key), `${key} not whitelisted`).toBe(true);
      }
    }
  });

  it("preserves every whitelisted field value from the canonical index", () => {
    for (let i = 0; i < full.length; i += 1) {
      for (const field of CLIENT_INDEX_FIELDS) {
        expect(lite[i][field], `${full[i].id}.${field}`).toEqual(
          full[i][field],
        );
      }
    }
  });

  it("drops the heavy detail/audit fields from the client bundle", () => {
    for (const record of lite) {
      expect(record.content).toBeUndefined();
      expect(record.editorial).toBeUndefined();
      expect(record.budgetBreakdown).toBeUndefined();
      expect(record.imageMetadata).toBeUndefined();
      expect(record.crowdMetadata).toBeUndefined();
    }
  });

  it("keeps every required summary field the client consumes", () => {
    for (const record of lite) {
      expect(record.id).toBeDefined();
      expect(record.name).toBeDefined();
      expect(record.prefecture).toBeDefined();
      expect(record.region).toBeDefined();
      expect(record.categories).toBeDefined();
      expect(record.heroImage).toBeDefined();
      expect(record.description).toBeDefined();
    }
  });

  it("is meaningfully smaller than the full index", () => {
    const fullBytes = JSON.stringify(full).length;
    const liteBytes = JSON.stringify(lite).length;
    expect(liteBytes).toBeLessThan(fullBytes * 0.6);
  });
});
