/**
 * Tests for the shared destinations-meta.json builder (scripts/catalog/meta.mjs).
 *
 * META-001: mapping matches pipeline Stage 5 field-for-field.
 * META-002: defaults apply only to optional fields; id/name/prefecture pass
 *           through unchanged.
 * META-003: output sorted by id regardless of input order.
 * META-004: one index change produces exactly one meta change.
 * META-005: a second generation run produces zero diff (idempotent).
 * META-006: no runtime-required meta fields are lost vs the committed file.
 */

import { describe, expect, it } from "vitest";
import { buildDestinationsMeta } from "../catalog/meta.mjs";
import type { MetaSourceRecord } from "../catalog/meta.mjs";

describe("buildDestinationsMeta (shared meta generator)", () => {
  it("maps fields field-for-field with pipeline Stage 5 and applies defaults", () => {
    const record: MetaSourceRecord = {
      id: "kurashiki-city",
      name: "Kurashiki City",
      prefecture: "Okayama",
      // region/role/kind/status intentionally absent → defaults.
      relationships: { featuredDestinationIds: ["korakuen-okayama"] },
    };
    expect(buildDestinationsMeta([record])).toEqual([
      {
        id: "kurashiki-city",
        name: "Kurashiki City",
        prefecture: "Okayama",
        region: "Other",
        role: "poi",
        kind: "attraction",
        status: "verified",
        relationships: { featuredDestinationIds: ["korakuen-okayama"] },
      },
    ]);
  });

  it("passes through explicit role/kind/status/region values", () => {
    const record: MetaSourceRecord = {
      id: "bitchu-matsuyama-castle",
      name: "Bitchu Matsuyama Castle",
      prefecture: "Okayama",
      region: "Chugoku",
      role: "standalone",
      kind: "castle",
      status: "published",
      relationships: { parentDestinationId: "takahashi-city" },
    };
    expect(buildDestinationsMeta([record])).toEqual([
      {
        id: "bitchu-matsuyama-castle",
        name: "Bitchu Matsuyama Castle",
        prefecture: "Okayama",
        region: "Chugoku",
        role: "standalone",
        kind: "castle",
        status: "published",
        relationships: { parentDestinationId: "takahashi-city" },
      },
    ]);
  });

  it("sorts output by id regardless of input order", () => {
    const meta = buildDestinationsMeta([
      { id: "z-city", name: "Z", prefecture: "X" },
      { id: "a-city", name: "A", prefecture: "X" },
    ]);
    expect(meta.map((m) => m.id)).toEqual(["a-city", "z-city"]);
  });

  it("one index change produces exactly one meta change", () => {
    const catalog: MetaSourceRecord[] = [
      { id: "a-city", name: "A", prefecture: "X", role: "hub", kind: "city" },
      { id: "b-poi", name: "B", prefecture: "X", role: "poi" },
    ];
    const before = buildDestinationsMeta(catalog);
    const changed = buildDestinationsMeta([
      { ...catalog[0] },
      { ...catalog[1], kind: "castle" },
    ]);
    const diffs = changed.filter(
      (entry, i) => JSON.stringify(entry) !== JSON.stringify(before[i]),
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].id).toBe("b-poi");
    expect(diffs[0].kind).toBe("castle");
  });

  it("a second generation run produces zero diff", () => {
    const catalog: MetaSourceRecord[] = [
      { id: "a-city", name: "A", prefecture: "X", role: "hub", kind: "city" },
      { id: "b-poi", name: "B", prefecture: "X" },
    ];
    const first = JSON.stringify(buildDestinationsMeta(catalog));
    const second = JSON.stringify(buildDestinationsMeta(catalog));
    expect(second).toBe(first);
  });

  it("no runtime-required meta fields are lost vs the committed meta file", () => {
    const index = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("fs").readFileSync(
        require("path").join(
          process.cwd(),
          "src/shared/data/destinations-index.json",
        ),
        "utf-8",
      ),
    ) as MetaSourceRecord[];
    const committed = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("fs").readFileSync(
        require("path").join(
          process.cwd(),
          "src/shared/data/destinations-meta.json",
        ),
        "utf-8",
      ),
    ) as Array<{ id: string; [k: string]: unknown }>;
    const rebuilt = buildDestinationsMeta(index);
    const rebuiltById = new Map(rebuilt.map((m) => [m.id, m]));
    expect(rebuilt).toHaveLength(index.length);
    const requiredKeys = [
      "id",
      "name",
      "prefecture",
      "region",
      "role",
      "kind",
      "status",
      "relationships",
    ];
    for (const entry of committed) {
      const current = rebuiltById.get(entry.id);
      expect(current, `missing rebuilt entry for '${entry.id}'`).toBeDefined();
      for (const key of requiredKeys) {
        expect(current, `'${entry.id}' lost key '${key}'`).toHaveProperty(key);
      }
    }
    // Every rebuilt entry carries every required key (no partial records).
    for (const entry of rebuilt) {
      for (const key of requiredKeys) {
        expect(entry).toHaveProperty(key);
      }
    }
  });
});
