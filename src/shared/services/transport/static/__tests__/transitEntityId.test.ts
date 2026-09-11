/**
 * KAI-291B1 — generic internal-id builder tests.
 *
 * The builder is provider-agnostic: the ODPT adapter uses it today, the
 * future GTFS adapter must use the SAME builder. Provider ids are escaped,
 * never hashed away, so debugging and provenance stay inspectable.
 */
import { describe, expect, it } from "vitest";

import { makeTransitEntityId, parseTransitEntityId } from "../transitEntityId";

describe("makeTransitEntityId", () => {
  it("A. same provider/id + different namespaces -> different ids", () => {
    const a = makeTransitEntityId("odpt", "stop", "feed-a", "100");
    const b = makeTransitEntityId("odpt", "stop", "feed-b", "100");
    expect(a).not.toBe(b);
  });

  it("B. delimiter-containing namespace/id pairs cannot collide", () => {
    // Plain concatenation would map both pairs to the same string.
    const first = makeTransitEntityId("odpt", "stop", "a", "b:c");
    const second = makeTransitEntityId("odpt", "stop", "a:b", "c");
    expect(first).not.toBe(second);
    // And each round-trips to its own components.
    expect(parseTransitEntityId(first)).toEqual({
      provider: "odpt",
      entityKind: "stop",
      identityNamespace: "a",
      providerId: "b:c",
    });
    expect(parseTransitEntityId(second)).toEqual({
      provider: "odpt",
      entityKind: "stop",
      identityNamespace: "a:b",
      providerId: "c",
    });
  });

  it("C. ODPT ids remain deterministic", () => {
    const first = makeTransitEntityId(
      "odpt",
      "stop",
      "odpt",
      "odpt.Station:TokyoMetro.Ginza.Ueno",
    );
    const second = makeTransitEntityId(
      "odpt",
      "stop",
      "odpt",
      "odpt.Station:TokyoMetro.Ginza.Ueno",
    );
    expect(first).toBe(second);
    expect(first).toBe("odpt:stop:odpt:odpt.Station%3ATokyoMetro.Ginza.Ueno");
  });

  it("D. provider differs: gtfs/feed-a/100 vs gtfs-jp/feed-a/100", () => {
    const gtfs = makeTransitEntityId("gtfs", "stop", "feed-a", "100");
    const gtfsJp = makeTransitEntityId("gtfs-jp", "stop", "feed-a", "100");
    expect(gtfs).not.toBe(gtfsJp);
    expect(gtfs).toBe("gtfs:stop:feed-a:100");
    expect(gtfsJp).toBe("gtfs-jp:stop:feed-a:100");
  });

  it("keeps provider ids inspectable: no hashing", () => {
    const id = makeTransitEntityId(
      "odpt",
      "route",
      "odpt",
      "odpt.Railway:Toei.Mita",
    );
    expect(id).toContain("odpt.Railway");
    expect(id).toContain("Toei.Mita");
  });

  it("parse rejects malformed identities", () => {
    expect(parseTransitEntityId("odpt:stop:odpt")).toBeNull();
    expect(parseTransitEntityId("not-an-id")).toBeNull();
  });
});
