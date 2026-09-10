// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ODPT_REQUEST_IDENTITY_VERSION,
  canonicalOdptRequestIdentity,
  hashOdptRequestIdentity,
  odptCacheKey,
} from "./odpt-request-identity.js";
import { validateOdptRequest } from "./odpt-core.js";

const KEY = "fixture-odpt-key";

/** Validates then canonicalizes, mirroring the runtime order. */
function identity(body) {
  const validated = validateOdptRequest(body);
  expect(validated.ok).toBe(true);
  return canonicalOdptRequestIdentity(validated);
}

describe("canonical ODPT request identity", () => {
  it("is independent of JSON property order", () => {
    const a = identity({
      operation: "railway_fare",
      fromStation: "odpt.Station:Toei.Mita.Hakusan",
      toStation: "odpt.Station:Toei.Mita.Sugamo",
      operator: "odpt.Operator:Toei",
    });
    const b = identity({
      operator: "odpt.Operator:Toei",
      toStation: "odpt.Station:Toei.Mita.Sugamo",
      fromStation: "odpt.Station:Toei.Mita.Hakusan",
      operation: "railway_fare",
    });
    expect(a).toBe(b);
  });

  it("is stable across repeated calls", () => {
    const body = { operation: "station", operator: "odpt.Operator:Toei" };
    expect(identity(body)).toBe(identity({ ...body }));
  });

  it("differs per operator, station, train, calendar and date", () => {
    const base = identity({
      operation: "train_timetable",
      railway: "odpt.Railway:Toei.Mita",
    });
    const otherRailway = identity({
      operation: "train_timetable",
      railway: "odpt.Railway:Toei.Asakusa",
    });
    expect(base).not.toBe(otherRailway);

    const stationA = identity({
      operation: "station_timetable",
      station: "odpt.Station:Toei.Mita.Hakusan",
    });
    const stationB = identity({
      operation: "station_timetable",
      station: "odpt.Station:Toei.Asakusa.HonjoAzumabashi",
    });
    expect(stationA).not.toBe(stationB);

    // Train identity is the narrow timetable shape: it must be its own key.
    const trainA = identity({
      operation: "train_timetable",
      train: "odpt.Train:Toei.Mita.535T",
    });
    const trainB = identity({
      operation: "train_timetable",
      train: "odpt.Train:Toei.Mita.536T",
    });
    expect(trainA).not.toBe(trainB);
    expect(trainA).not.toBe(base);

    const calendarA = identity({
      operation: "station_timetable",
      station: "odpt.Station:Toei.Mita.Hakusan",
      calendar: "odpt.Calendar:Weekday",
    });
    const calendarB = identity({
      operation: "station_timetable",
      station: "odpt.Station:Toei.Mita.Hakusan",
      calendar: "odpt.Calendar:SaturdayHoliday",
    });
    expect(calendarA).not.toBe(calendarB);

    const dateA = identity({
      operation: "station_timetable",
      station: "odpt.Station:Toei.Mita.Hakusan",
      date: "2026-09-10",
    });
    const dateB = identity({
      operation: "station_timetable",
      station: "odpt.Station:Toei.Mita.Hakusan",
      date: "2026-09-11",
    });
    expect(dateA).not.toBe(dateB);
  });

  it("differs per operation even with identical filters", () => {
    // `title` is declared by both schemas, so the only difference is the
    // operation itself.
    const station = identity({ operation: "station", title: "三田" });
    const railway = identity({ operation: "railway", title: "三田" });
    expect(station).not.toBe(railway);
  });

  it("does not collide when a text filter contains the pair separator", () => {
    // Under a naive `name=value|name=value` join these two REQUESTS would
    // produce the same string, because `title` and `stationCode` are both free
    // text declared by the `station` schema.
    const crafted = identity({
      operation: "station",
      title: "A|stationCode=B",
    });
    const genuine = identity({
      operation: "station",
      title: "A",
      stationCode: "B",
    });
    expect(crafted).not.toBe(genuine);
  });

  it("distinguishes an omitted filter from a present one", () => {
    const withRailway = identity({
      operation: "station",
      operator: "odpt.Operator:Toei",
      railway: "odpt.Railway:Toei.Mita",
    });
    const withoutRailway = identity({
      operation: "station",
      operator: "odpt.Operator:Toei",
    });
    expect(withRailway).not.toBe(withoutRailway);
  });

  it("never contains credential material", () => {
    const all = [
      identity({ operation: "station", operator: "odpt.Operator:Toei" }),
      identity({ operation: "calendar" }),
      identity({
        operation: "train_timetable",
        train: "odpt.Train:Toei.Mita.535T",
      }),
      identity({
        operation: "datapoint",
        dataUri: "odpt.Station:TokyoMetro.Ginza.Nihombashi",
      }),
    ].join("\n");
    expect(all).not.toContain(KEY);
    expect(all).not.toContain("acl:consumerKey");
    expect(all).not.toContain("consumerKey");
    expect(all).not.toContain("api.odpt.org");
    expect(all).not.toContain("api_key");
  });

  it("ignores caller fields that validation does not accept", () => {
    // These fields are rejected by validation, so they can never reach the
    // canonicalizer in production. Even if one were injected, it must not
    // change the identity, because only declared schema inputs are read.
    const clean = canonicalOdptRequestIdentity({
      ok: true,
      operation: "station",
      body: { operator: "odpt.Operator:Toei" },
    });
    const polluted = canonicalOdptRequestIdentity({
      ok: true,
      operation: "station",
      body: {
        operator: "odpt.Operator:Toei",
        "acl:consumerKey": KEY,
        url: "https://evil.example/api/v4",
        endpoint: "https://evil.example",
        queryParameters: { operator: "odpt.Operator:JR-East" },
        rdf: "type",
        callerIp: "203.0.113.9",
      },
    });
    expect(polluted).toBe(clean);
    expect(polluted).not.toContain(KEY);
  });

  it("refuses to canonicalize an unvalidated request", () => {
    for (const bad of [
      undefined,
      null,
      {},
      { ok: false, error: "unsupported_field" },
      { ok: true },
      { ok: true, operation: 42 },
      { ok: true, operation: "police_box" },
    ]) {
      expect(() => canonicalOdptRequestIdentity(bad)).toThrow(TypeError);
    }
  });

  it("carries a versioned, deterministic representation", () => {
    const value = identity({ operation: "calendar" });
    expect(value.startsWith(`${ODPT_REQUEST_IDENTITY_VERSION}:`)).toBe(true);
    // Every declared input appears as a [name, value] pair.
    expect(value).toContain('["operation","calendar"]');
  });
});

describe("cache key derivation", () => {
  it("is deterministic and hex-digest sized", () => {
    const a = hashOdptRequestIdentity("odpt-canonical-v1:[]");
    const b = hashOdptRequestIdentity("odpt-canonical-v1:[]");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("separates distinct identities", () => {
    expect(hashOdptRequestIdentity("a")).not.toBe(hashOdptRequestIdentity("b"));
  });

  it("builds a credential-free synthetic cache key", () => {
    const key = odptCacheKey(
      canonicalOdptRequestIdentity({
        ok: true,
        operation: "station",
        body: { operator: "odpt.Operator:Toei" },
      }),
    );
    expect(key).not.toContain(KEY);
    expect(key).not.toContain("consumerKey");
    expect(key).not.toContain("api.odpt.org");
    expect(key.startsWith("https://odpt-cache.meguruto.internal/")).toBe(true);
  });
});
