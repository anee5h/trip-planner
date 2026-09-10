// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ODPT_RADIUS_MAX_METERS,
  buildOdptUrl,
  normalizeRailway,
  normalizeRailwayFare,
  normalizeStation,
  odptLookup,
  resolveOdptBaseUrl,
  sanitizeOdptUrl,
  validateOdptRequest,
} from "./odpt-core.js";

// Fixtures are shaped from the API v4.16 examples (§1.4, §3.2.3–§3.2.5,
// §3.3.3–§3.3.5). No real credential is ever stored here.
const KEY = "fixture-odpt-key";
const ENV = { ODPT_API_KEY: KEY };
const NOW = () => "2026-09-10T00:00:00.000Z";

const STATION_TOKYO = {
  "@context": "http://vocab.odpt.org/context_odpt.jsonld",
  "@id": "urn:ucode:_00001C000000000000010000030FD7E5",
  "@type": "odpt:Station",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs": "odpt.Station:JR-East.Yamanote.Tokyo",
  "dc:title": "東京",
  "odpt:stationTitle": { ja: "東京", en: "Tokyo" },
  "odpt:operator": "odpt.Operator:JR-East",
  "odpt:railway": "odpt.Railway:JR-East.Yamanote",
  "odpt:stationCode": "JY01",
  "geo:lat": 35.6812,
  "geo:long": 139.7671,
  "odpt:connectingRailway": [
    "odpt.Railway:JR-East.ChuoRapid",
    "odpt.Railway:TokyoMetro.Marunouchi",
  ],
  "odpt:connectingStation": [
    "odpt.Station:JR-East.ChuoRapid.Tokyo",
    "odpt.Station:TokyoMetro.Marunouchi.Otemachi",
  ],
};

const STATION_OTEMACHI = {
  "@id": "urn:ucode:_00001C000000000000010000030FD7E6",
  "@type": "odpt:Station",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs": "odpt.Station:TokyoMetro.Marunouchi.Otemachi",
  "odpt:stationTitle": { ja: "大手町", en: "Otemachi" },
  "odpt:operator": "odpt.Operator:TokyoMetro",
  "odpt:railway": "odpt.Railway:TokyoMetro.Marunouchi",
  "geo:lat": 35.6844,
  "geo:long": 139.766,
};

const RAILWAY_YAMANOTE = {
  "@context": "http://vocab.odpt.org/context_odpt.jsonld",
  "@id": "urn:ucode:_00001C000000000000010000030FD7E7",
  "@type": "odpt:Railway",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs": "odpt.Railway:JR-East.Yamanote",
  "dc:title": "山手線",
  "odpt:railwayTitle": { ja: "山手線", en: "Yamanote Line" },
  "odpt:operator": "odpt.Operator:JR-East",
  "odpt:lineCode": "JY",
  "dct:issued": "2017-01-13",
  "dct:valid": "2017-12-07T01:30:03+09:00",
  "odpt:ascendingRailDirection": "odpt.RailDirection:Outbound",
  "odpt:descendingRailDirection": "odpt.RailDirection:Inbound",
  "odpt:stationOrder": [
    {
      "odpt:index": 1,
      "odpt:station": "odpt.Station:JR-East.Yamanote.Tokyo",
      "odpt:stationTitle": { ja: "東京", en: "Tokyo" },
    },
    {
      "odpt:index": 2,
      "odpt:station": "odpt.Station:JR-East.Yamanote.Kanda",
      "odpt:stationTitle": { ja: "神田", en: "Kanda" },
    },
    {
      "odpt:index": 3,
      "odpt:station": "odpt.Station:JR-East.Yamanote.Akihabara",
      "odpt:stationTitle": { ja: "秋葉原", en: "Akihabara" },
    },
  ],
};

const FARE_TOKYO_NAKANO = {
  "@context": "http://vocab.odpt.org/context_odpt.jsonld",
  "@id": "urn:ucode:_00001C000000000000010000030FD7E8",
  "@type": "odpt:RailwayFare",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs":
    "odpt.RailwayFare:TokyoMetro.Marunouchi.Tokyo.TokyoMetro.Tozai.Nakano",
  "odpt:operator": "odpt.Operator:TokyoMetro",
  "odpt:fromStation": "odpt.Station:TokyoMetro.Marunouchi.Tokyo",
  "odpt:toStation": "odpt.Station:TokyoMetro.Tozai.Nakano",
  "odpt:ticketFare": 240,
  "odpt:icCardFare": 237,
  "odpt:childTicketFare": 120,
  "odpt:childIcCardFare": 118,
  "odpt:viaStation": ["odpt.Station:TokyoMetro.Tozai.NishiFunabashi"],
  "odpt:viaRailway": ["odpt.Railway:TokyoMetro.Tozai"],
  "odpt:ticketType": "普通",
  "odpt:paymentMethod": ["ticket", "ic"],
  "dct:issued": "2017-01-13",
  "dct:valid": "2017-12-07T01:30:03+09:00",
};

function jsonResponse(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function captureFetch(payload, status = 200) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(payload, status);
  };
  impl.calls = calls;
  return impl;
}

const NEARBY = {
  operation: "nearby_stations",
  lat: 35.6812,
  lon: 139.7671,
  radius: 500,
};
const STATION_QUERY = {
  operation: "station",
  railway: "odpt.Railway:JR-East.Yamanote",
};
const RAILWAY_QUERY = {
  operation: "railway",
  sameAs: "odpt.Railway:JR-East.Yamanote",
};
const FARE_QUERY = {
  operation: "railway_fare",
  fromStation: "odpt.Station:TokyoMetro.Marunouchi.Tokyo",
  toStation: "odpt.Station:TokyoMetro.Tozai.Nakano",
};

describe("validateOdptRequest", () => {
  it("accepts each allow-listed operation", () => {
    expect(validateOdptRequest(NEARBY).ok).toBe(true);
    expect(validateOdptRequest(STATION_QUERY).ok).toBe(true);
    expect(validateOdptRequest(RAILWAY_QUERY).ok).toBe(true);
    expect(validateOdptRequest(FARE_QUERY).ok).toBe(true);
    expect(
      validateOdptRequest({
        operation: "datapoint",
        dataUri: "urn:ucode:_00001C000000000000010000030FD7E5",
      }).ok,
    ).toBe(true);
  });

  it.each([
    ["non-object body", null, "invalid_json"],
    ["missing operation", { lat: 35 }, "invalid_operation"],
    ["unknown operation", { operation: "operator" }, "unsupported_operation"],
    [
      "raw rdf:type pass-through",
      { operation: "station", "rdf:type": "odpt:Operator" },
      "unsupported_field",
    ],
    [
      "arbitrary provider url",
      { operation: "station", url: "https://evil.example/api" },
      "unsupported_field",
    ],
    [
      "arbitrary endpoint override",
      { operation: "station", endpoint: "https://evil.example/api" },
      "unsupported_field",
    ],
    [
      "arbitrary query parameter object",
      { operation: "station", queryParameters: { "dc:title": "東京" } },
      "unsupported_field",
    ],
    [
      "client-supplied consumer key",
      { operation: "station", title: "東京", "acl:consumerKey": "attacker" },
      "unsupported_field",
    ],
    [
      "unfiltered station search",
      { operation: "station" },
      "unfiltered_search_not_allowed",
    ],
    [
      "unfiltered railway search",
      { operation: "railway" },
      "unfiltered_search_not_allowed",
    ],
    [
      "fare by station name instead of identity",
      {
        operation: "railway_fare",
        fromStation: "東京",
        toStation: "中野",
      },
      "invalid_fromStation",
    ],
    [
      "arbitrary datapoint uri",
      { operation: "datapoint", dataUri: "https://evil.example/x" },
      "invalid_dataUri",
    ],
  ])("rejects %s", (_label, body, error) => {
    expect(validateOdptRequest(body)).toEqual({ ok: false, error });
  });

  it.each([
    ["zero radius", 0, true],
    ["normal radius", 500, true],
    ["maximum radius", ODPT_RADIUS_MAX_METERS, true],
    ["negative radius", -1, false],
    ["radius above the documented maximum", ODPT_RADIUS_MAX_METERS + 1, false],
    ["non-numeric radius", "500", false],
  ])("enforces nearby_stations radius: %s", (_label, radius, ok) => {
    const body = { ...NEARBY, radius };
    expect(validateOdptRequest(body).ok).toBe(ok);
    if (!ok) {
      expect(validateOdptRequest(body).error).toBe("invalid_radius");
    }
  });

  it.each([
    ["latitude out of range", { lat: 95 }],
    ["longitude out of range", { lon: 200 }],
  ])("enforces WGS84 bounds: %s", (_label, override) => {
    expect(validateOdptRequest({ ...NEARBY, ...override }).ok).toBe(false);
  });
});

describe("resolveOdptBaseUrl", () => {
  it("defaults to the documented ODPT endpoint", () => {
    expect(resolveOdptBaseUrl({})).toEqual({
      ok: true,
      baseUrl: "https://api.odpt.org/api/v4",
    });
  });

  it("allows an https endpoint on an allow-listed host for per-dataset use", () => {
    expect(
      resolveOdptBaseUrl({ ODPT_API_BASE_URL: "https://api.odpt.org/api/v4/" }),
    ).toEqual({
      ok: true,
      baseUrl: "https://api.odpt.org/api/v4",
    });
  });

  it.each([
    ["a non-allow-listed host", "https://evil.example/api/v4"],
    ["plain http", "http://api.odpt.org/api/v4"],
    ["a malformed url", "not-a-url"],
  ])("rejects %s", (_label, value) => {
    expect(resolveOdptBaseUrl({ ODPT_API_BASE_URL: value })).toEqual({
      ok: false,
      error: "provider_endpoint_not_allowed",
    });
  });
});

describe("buildOdptUrl / sanitizeOdptUrl", () => {
  it("URI-encodes values and appends the consumer key server-side", () => {
    const url = buildOdptUrl(
      "https://api.odpt.org/api/v4",
      "odpt:Station",
      [["dc:title", "東京"]],
      KEY,
    );
    expect(url).toBe(
      `https://api.odpt.org/api/v4/odpt:Station?dc:title=${encodeURIComponent("東京")}&acl:consumerKey=${KEY}`,
    );
  });

  it("omits the consumer key when building a display url", () => {
    const url = buildOdptUrl(
      "https://api.odpt.org/api/v4",
      "odpt:Station",
      [["dc:title", "東京"]],
      undefined,
    );
    expect(url).not.toContain("acl:consumerKey");
  });

  it("strips the credential query parameter", () => {
    expect(
      sanitizeOdptUrl(
        "https://api.odpt.org/api/v4/odpt:Station?dc:title=%E6%9D%B1%E4%BA%AC&acl:consumerKey=secret",
      ),
    ).toBe(
      "https://api.odpt.org/api/v4/odpt:Station?dc:title=%E6%9D%B1%E4%BA%AC",
    );
  });

  it("scrubs a credential value wherever it appears", () => {
    expect(sanitizeOdptUrl("https://x/?token=abc123", "abc123")).not.toContain(
      "abc123",
    );
  });
});

describe("odptLookup configuration and request construction", () => {
  it("returns provider_not_configured when ODPT_API_KEY is absent", async () => {
    const fetchImpl = captureFetch([]);
    const result = await odptLookup(STATION_QUERY, {}, fetchImpl, NOW);
    expect(result).toMatchObject({
      provider: "odpt",
      operation: "station",
      outcome: "error",
      errorCode: "provider_not_configured",
      records: [],
      recordCount: 0,
    });
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it("returns provider_endpoint_not_allowed for a non-allow-listed base url", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      { ...ENV, ODPT_API_BASE_URL: "https://evil.example/api/v4" },
      captureFetch([]),
      NOW,
    );
    expect(result.errorCode).toBe("provider_endpoint_not_allowed");
  });

  it("injects the consumer key server-side into the outbound request only", async () => {
    const fetchImpl = captureFetch([STATION_TOKYO]);
    const result = await odptLookup(STATION_QUERY, ENV, fetchImpl, NOW);

    expect(fetchImpl.calls).toHaveLength(1);
    const { url, init } = fetchImpl.calls[0];
    expect(init.method).toBe("GET");
    expect(url).toContain(`acl:consumerKey=${KEY}`);
    expect(url).toContain("odpt:railway=odpt.Railway%3AJR-East.Yamanote");
    expect(result.outcome).toBe("records");
    // The credential never appears in the normalized result.
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(result.sourceUrl).not.toContain("acl:consumerKey");
  });

  it("builds the geographic places search with lat/lon/radius", async () => {
    const fetchImpl = captureFetch([STATION_TOKYO]);
    await odptLookup(NEARBY, ENV, fetchImpl, NOW);
    const { url } = fetchImpl.calls[0];
    expect(url).toContain("/places/odpt:Station?");
    expect(url).toContain("lat=35.6812");
    expect(url).toContain("lon=139.7671");
    expect(url).toContain("radius=500");
    expect(url).toContain(`acl:consumerKey=${KEY}`);
  });

  it("acquires an exact datapoint by ucode without accepting a url", async () => {
    const fetchImpl = captureFetch([
      {
        "@id": "urn:ucode:_00001C000000000000010000030FD7E5",
        "@type": "odpt:Station",
        "dc:date": "2017-01-13T15:10:00+09:00",
        "owl:sameAs": "odpt.Station:JR-East.Yamanote.Tokyo",
        "dct:valid": "2017-12-07T01:30:03+09:00",
      },
    ]);
    const result = await odptLookup(
      {
        operation: "datapoint",
        dataUri: "urn:ucode:_00001C000000000000010000030FD7E5",
      },
      ENV,
      fetchImpl,
      NOW,
    );
    expect(fetchImpl.calls[0].url).toContain(
      "/datapoints/urn:ucode:_00001C000000000000010000030FD7E5?",
    );
    expect(result.sourceResource).toBe("datapoints");
    expect(result.outcome).toBe("records");
  });

  it("normalizes an exact datapoint using its declared @type", async () => {
    const result = await odptLookup(
      {
        operation: "datapoint",
        dataUri: "urn:ucode:_00001C000000000000010000030FD7E5",
      },
      ENV,
      captureFetch([STATION_TOKYO]),
      NOW,
    );
    expect(result.outcome).toBe("records");
    expect(result.records[0]).toMatchObject({
      sameAs: "odpt.Station:JR-East.Yamanote.Tokyo",
      stationCode: "JY01",
      coordinates: { lat: 35.6812, lng: 139.7671 },
    });
  });

  it("retains a generic identity envelope for an unmodelled datapoint type", async () => {
    const result = await odptLookup(
      {
        operation: "datapoint",
        dataUri: "odpt.Calendar:Weekday",
      },
      ENV,
      captureFetch([
        {
          "@id": "urn:ucode:_00001C000000000000010000030FD7EA",
          "@type": "odpt:Calendar",
          "dc:date": "2017-01-13T15:10:00+09:00",
          "dct:valid": "2017-11-22T14:57:04+09:00",
          "owl:sameAs": "odpt.Calendar:Weekday",
        },
      ]),
      NOW,
    );
    expect(result.records[0]).toMatchObject({
      id: "odpt.Calendar:Weekday",
      sameAs: "odpt.Calendar:Weekday",
      ucode: "urn:ucode:_00001C000000000000010000030FD7EA",
      type: "odpt:Calendar",
      validUntil: "2017-11-22T14:57:04+09:00",
    });
    expect(result.records[0].provenance.coverage).toBe("unknown");
  });

  it("accepts an owl:sameAs datapoint identifier with a one-to-one ucode mapping", async () => {
    const fetchImpl = captureFetch([STATION_TOKYO]);
    await odptLookup(
      {
        operation: "datapoint",
        dataUri: "odpt.Station:JR-East.Yamanote.Tokyo",
      },
      ENV,
      fetchImpl,
      NOW,
    );
    expect(fetchImpl.calls[0].url).toContain(
      "/datapoints/odpt.Station:JR-East.Yamanote.Tokyo?",
    );
  });
});

describe("odptLookup response semantics", () => {
  it("treats a successful empty array as success with no matching records", async () => {
    const result = await odptLookup(STATION_QUERY, ENV, captureFetch([]), NOW);
    expect(result).toMatchObject({
      outcome: "records",
      records: [],
      recordCount: 0,
    });
    expect(result.errorCode).toBeUndefined();
  });

  it("treats a one-element array as one result", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      ENV,
      captureFetch([STATION_TOKYO]),
      NOW,
    );
    expect(result.outcome).toBe("records");
    expect(result.recordCount).toBe(1);
    expect(result.records[0].sameAs).toBe(
      "odpt.Station:JR-East.Yamanote.Tokyo",
    );
  });

  it("treats a multi-element array as multiple results", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      ENV,
      captureFetch([STATION_TOKYO, STATION_OTEMACHI]),
      NOW,
    );
    expect(result.recordCount).toBe(2);
    expect(result.records.map((record) => record.sameAs)).toEqual([
      "odpt.Station:JR-East.Yamanote.Tokyo",
      "odpt.Station:TokyoMetro.Marunouchi.Otemachi",
    ]);
  });

  it("classifies the observed live invalid-key response (403 + plain-text body)", async () => {
    // Live ODPT (2026-09-10) answers an invalid or missing acl:consumerKey with
    // HTTP 403 and a plain-text body, not the documented 401. The classification
    // must stay a terminal provider failure and must never become "no transport
    // exists" or an empty successful result. See the comment on
    // ODPT_STATUS_ERROR_CODES for the full divergence note.
    const fetchImpl = async () =>
      new Response("Invalid acl:consumerKey.", {
        status: 403,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    const result = await odptLookup(STATION_QUERY, ENV, fetchImpl, NOW);
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "provider_authorization_error",
      records: [],
      recordCount: 0,
    });
    expect(result.outcome).not.toBe("no_data");
    // The provider's own message is never surfaced to the caller.
    expect(JSON.stringify(result)).not.toContain("Invalid acl:consumerKey");
  });

  it.each([
    ["an object", {}, "unexpected_provider_payload_object"],
    ["null", "null", "unexpected_provider_payload_null"],
    ["a string", '"odpt:Station"', "unexpected_provider_payload_string"],
    ["a number", "42", "unexpected_provider_payload_number"],
  ])(
    "rejects a successful non-array payload: %s",
    async (_label, payload, errorCode) => {
      const result = await odptLookup(
        STATION_QUERY,
        ENV,
        captureFetch(payload),
        NOW,
      );
      expect(result).toMatchObject({
        outcome: "error",
        errorCode,
        records: [],
      });
    },
  );

  it("reports malformed JSON distinctly", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      ENV,
      async () => new Response("<!doctype html>", { status: 200 }),
      NOW,
    );
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "malformed_provider_json",
    });
  });

  it("fails closed on a record without an ODPT identity", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      ENV,
      captureFetch([{ "@type": "odpt:Station", "dc:title": "東京" }]),
      NOW,
    );
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "malformed_provider_record",
      records: [],
    });
  });

  it("marks coverage unknown so a broad response is never a completeness claim", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      ENV,
      captureFetch([STATION_TOKYO]),
      NOW,
    );
    expect(result.records[0].provenance.coverage).toBe("unknown");
  });
});

describe("odptLookup failure semantics", () => {
  it("handles a timeout without leaking a payload", async () => {
    const hanging = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    const result = await odptLookup(STATION_QUERY, ENV, hanging, NOW, {
      timeoutMs: 20,
    });
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "provider_timeout",
    });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("normalizes a network failure", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      ENV,
      async () => {
        throw new Error("socket down");
      },
      NOW,
    );
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "network_error",
    });
  });

  it("rejects an oversized response body", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      ENV,
      async () => new Response(`["${"x".repeat(1_000_001)}"]`, { status: 200 }),
      NOW,
    );
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "provider_response_too_large",
    });
  });

  it.each([
    [400, "provider_invalid_request"],
    [401, "provider_authentication_error"],
    [402, "billing_required"],
    [403, "provider_authorization_error"],
    [405, "provider_method_not_allowed"],
    [500, "provider_internal_error"],
    [503, "provider_unavailable"],
  ])("maps HTTP %i to %s", async (status, errorCode) => {
    const fetchImpl = captureFetch({ message: "provider detail" }, status);
    const result = await odptLookup(STATION_QUERY, ENV, fetchImpl, NOW, {
      sleepImpl: async () => {},
    });
    expect(result).toMatchObject({ outcome: "error", errorCode });
    // Provider bodies are never surfaced.
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });

  it("maps 404 to no_data, distinct from an empty successful search", async () => {
    const result = await odptLookup(
      STATION_QUERY,
      ENV,
      captureFetch({ message: "none" }, 404),
      NOW,
    );
    expect(result).toMatchObject({
      outcome: "no_data",
      errorCode: "no_applicable_data",
      records: [],
      recordCount: 0,
    });
  });

  it("maps 402 billing_required on datapoint acquisition and never retries it", async () => {
    const fetchImpl = captureFetch({ message: "billing" }, 402);
    const result = await odptLookup(
      {
        operation: "datapoint",
        dataUri: "urn:ucode:_00001C000000000000010000030FD7E5",
      },
      ENV,
      fetchImpl,
      NOW,
      { sleepImpl: async () => {} },
    );
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "billing_required",
    });
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it.each([400, 401, 402, 403, 404])(
    "never retries HTTP %i",
    async (status) => {
      const fetchImpl = captureFetch({ message: "no" }, status);
      await odptLookup(STATION_QUERY, ENV, fetchImpl, NOW, {
        sleepImpl: async () => {},
      });
      expect(fetchImpl.calls).toHaveLength(1);
    },
  );

  it("retries 503 once, within bounds, and recovers", async () => {
    let call = 0;
    const sleeps = [];
    const impl = async () => {
      call += 1;
      if (call === 1) return jsonResponse({ message: "maintenance" }, 503);
      return jsonResponse([STATION_TOKYO], 200);
    };
    const result = await odptLookup(STATION_QUERY, ENV, impl, NOW, {
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result.outcome).toBe("records");
    expect(call).toBe(2);
    expect(sleeps).toEqual([250]);
  });

  it("gives up after the bounded attempts on persistent 503", async () => {
    const fetchImpl = captureFetch({ message: "maintenance" }, 503);
    const result = await odptLookup(STATION_QUERY, ENV, fetchImpl, NOW, {
      sleepImpl: async () => {},
    });
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "provider_unavailable",
    });
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it("rejects an invalid request before any provider call", async () => {
    const fetchImpl = captureFetch([]);
    const result = await odptLookup(
      { ...STATION_QUERY, "acl:consumerKey": "attacker" },
      ENV,
      fetchImpl,
      NOW,
    );
    expect(result.errorCode).toContain("invalid_request_unsupported_field");
    expect(fetchImpl.calls).toHaveLength(0);
  });
});

describe("normalizers", () => {
  const SOURCE = "https://api.odpt.org/api/v4/odpt:Station";
  const FETCHED = "2026-09-10T00:00:00.000Z";

  it("retains full station identity, coordinates and transfer evidence", () => {
    const { record } = normalizeStation(STATION_TOKYO, SOURCE, FETCHED);
    expect(record).toMatchObject({
      sameAs: "odpt.Station:JR-East.Yamanote.Tokyo",
      ucode: "urn:ucode:_00001C000000000000010000030FD7E5",
      title: "東京",
      stationTitle: { ja: "東京", en: "Tokyo" },
      operator: "odpt.Operator:JR-East",
      railway: "odpt.Railway:JR-East.Yamanote",
      stationCode: "JY01",
      coordinates: { lat: 35.6812, lng: 139.7671 },
      connectingRailway: [
        "odpt.Railway:JR-East.ChuoRapid",
        "odpt.Railway:TokyoMetro.Marunouchi",
      ],
      connectingStation: [
        "odpt.Station:JR-East.ChuoRapid.Tokyo",
        "odpt.Station:TokyoMetro.Marunouchi.Otemachi",
      ],
    });
    expect(record.provenance).toMatchObject({
      provider: "odpt",
      providerId: "odpt.Station:JR-East.Yamanote.Tokyo",
      ucode: "urn:ucode:_00001C000000000000010000030FD7E5",
      generatedAt: "2017-01-13T15:10:00+09:00",
      fetchedAt: FETCHED,
      sourceResource: "odpt:Station",
      sourceUrl: SOURCE,
      coverage: "unknown",
    });
  });

  it("keeps same-named stations on different operators distinct", () => {
    const tokyoJr = normalizeStation(STATION_TOKYO, SOURCE, FETCHED).record;
    const tokyoMetro = normalizeStation(
      {
        ...STATION_TOKYO,
        "owl:sameAs": "odpt.Station:TokyoMetro.Marunouchi.Tokyo",
        "odpt:operator": "odpt.Operator:TokyoMetro",
        "odpt:railway": "odpt.Railway:TokyoMetro.Marunouchi",
      },
      SOURCE,
      FETCHED,
    ).record;
    expect(tokyoJr.id).not.toBe(tokyoMetro.id);
    expect(tokyoJr.operator).toBe("odpt.Operator:JR-East");
    expect(tokyoMetro.operator).toBe("odpt.Operator:TokyoMetro");
  });

  it("leaves absent optional station coordinates null rather than guessing", () => {
    const { record } = normalizeStation(
      { "owl:sameAs": "odpt.Station:JR-East.Yamanote.Tokyo" },
      SOURCE,
      FETCHED,
    );
    expect(record.coordinates).toBeNull();
    expect(record.connectingRailway).toEqual([]);
  });

  it("normalizes railway station order, direction and codes without re-sorting", () => {
    const { record } = normalizeRailway(RAILWAY_YAMANOTE, SOURCE, FETCHED);
    expect(record).toMatchObject({
      sameAs: "odpt.Railway:JR-East.Yamanote",
      ucode: "urn:ucode:_00001C000000000000010000030FD7E7",
      title: "山手線",
      railwayTitle: { ja: "山手線", en: "Yamanote Line" },
      operator: "odpt.Operator:JR-East",
      lineCode: "JY",
      ascendingRailDirection: "odpt.RailDirection:Outbound",
      descendingRailDirection: "odpt.RailDirection:Inbound",
      issuedAt: "2017-01-13",
      validUntil: "2017-12-07T01:30:03+09:00",
    });
    expect(record.stationOrder.map((entry) => entry.station)).toEqual([
      "odpt.Station:JR-East.Yamanote.Tokyo",
      "odpt.Station:JR-East.Yamanote.Kanda",
      "odpt.Station:JR-East.Yamanote.Akihabara",
    ]);
    expect(record.stationOrder.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(record.stationOrder[0].stationTitle).toEqual({
      ja: "東京",
      en: "Tokyo",
    });
  });

  it("preserves supplied station order even when indexes are out of order", () => {
    const shuffled = {
      ...RAILWAY_YAMANOTE,
      "odpt:stationOrder": [
        {
          "odpt:index": 3,
          "odpt:station": "odpt.Station:JR-East.Yamanote.Akihabara",
        },
        {
          "odpt:index": 1,
          "odpt:station": "odpt.Station:JR-East.Yamanote.Tokyo",
        },
      ],
    };
    const { record } = normalizeRailway(shuffled, SOURCE, FETCHED);
    expect(record.stationOrder.map((entry) => entry.index)).toEqual([3, 1]);
  });

  it("fails closed on a malformed station order", () => {
    const malformed = {
      ...RAILWAY_YAMANOTE,
      "odpt:stationOrder": { "odpt:index": 1 },
    };
    expect(normalizeRailway(malformed, SOURCE, FETCHED).error).toBe(
      "malformed_station_order",
    );
    const missingStation = {
      ...RAILWAY_YAMANOTE,
      "odpt:stationOrder": [{ "odpt:index": 1 }],
    };
    expect(normalizeRailway(missingStation, SOURCE, FETCHED).error).toBe(
      "malformed_station_order",
    );
  });

  it("retains every distinct fare field instead of one collapsed value", () => {
    const { record } = normalizeRailwayFare(FARE_TOKYO_NAKANO, SOURCE, FETCHED);
    expect(record).toMatchObject({
      sameAs:
        "odpt.RailwayFare:TokyoMetro.Marunouchi.Tokyo.TokyoMetro.Tozai.Nakano",
      ucode: "urn:ucode:_00001C000000000000010000030FD7E8",
      operator: "odpt.Operator:TokyoMetro",
      fromStation: "odpt.Station:TokyoMetro.Marunouchi.Tokyo",
      toStation: "odpt.Station:TokyoMetro.Tozai.Nakano",
      ticketFare: 240,
      icCardFare: 237,
      childTicketFare: 120,
      childIcCardFare: 118,
      viaStation: ["odpt.Station:TokyoMetro.Tozai.NishiFunabashi"],
      viaRailway: ["odpt.Railway:TokyoMetro.Tozai"],
      ticketType: "普通",
      paymentMethod: ["ticket", "ic"],
      issuedAt: "2017-01-13",
      validUntil: "2017-12-07T01:30:03+09:00",
    });
  });

  it("keeps a ticket-only fare null rather than zero for IC and child fares", () => {
    const ticketOnly = {
      "@id": "urn:ucode:_00001C000000000000010000030FD7E9",
      "@type": "odpt:RailwayFare",
      "dc:date": "2017-01-13T15:10:00+09:00",
      "owl:sameAs":
        "odpt.RailwayFare:JR-East.ChuoRapid.Tokyo.JR-East.ChuoRapid.Kanda",
      "odpt:operator": "odpt.Operator:JR-East",
      "odpt:fromStation": "odpt.Station:JR-East.ChuoRapid.Tokyo",
      "odpt:toStation": "odpt.Station:JR-East.ChuoRapid.Kanda",
      "odpt:ticketFare": 150,
    };
    const { record } = normalizeRailwayFare(ticketOnly, SOURCE, FETCHED);
    expect(record.ticketFare).toBe(150);
    expect(record.icCardFare).toBeNull();
    expect(record.childTicketFare).toBeNull();
    expect(record.childIcCardFare).toBeNull();
    expect(record.viaStation).toEqual([]);
    expect(record.viaRailway).toEqual([]);
  });

  it("fails closed on a fare record without the required ticket fare", () => {
    const { "odpt:ticketFare": _omitted, ...withoutTicket } = FARE_TOKYO_NAKANO;
    expect(normalizeRailwayFare(withoutTicket, SOURCE, FETCHED).error).toBe(
      "fare_without_ticket_fare",
    );
  });

  it("fails closed on a fare record without a station pair", () => {
    const { "odpt:toStation": _omitted, ...withoutDestination } =
      FARE_TOKYO_NAKANO;
    expect(
      normalizeRailwayFare(withoutDestination, SOURCE, FETCHED).error,
    ).toBe("fare_without_station_pair");
  });

  it.each([
    ["station", normalizeStation],
    ["railway", normalizeRailway],
    ["fare", normalizeRailwayFare],
  ])("rejects a non-object %s record", (_label, normalize) => {
    expect(normalize(null, SOURCE, FETCHED).error).toBe(
      "malformed_provider_record",
    );
  });
});

describe("credential containment", () => {
  it("never returns the credential in any success or failure field", async () => {
    const bodies = [
      jsonResponse([STATION_TOKYO], 200),
      jsonResponse({}, 200),
      jsonResponse({ message: "detail" }, 500),
      jsonResponse({ message: "detail" }, 401),
      new Response("broken", { status: 200 }),
    ];
    for (const body of bodies) {
      const result = await odptLookup(
        STATION_QUERY,
        ENV,
        async () => body.clone(),
        NOW,
        { sleepImpl: async () => {} },
      );
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(result.sourceUrl).not.toContain("acl:consumerKey");
    }
  });

  it("keeps the credential out of the thrown-error path", async () => {
    let captured = null;
    try {
      await odptLookup(
        STATION_QUERY,
        ENV,
        async (url) => {
          captured = url;
          throw new Error(`upstream failure at ${url}`);
        },
        NOW,
      );
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
    }
    // The credential is only ever in the outbound provider URL, server-side.
    expect(captured).toContain(KEY);
  });
});

describe("deferred KAI-290+ surface", () => {
  it("exposes no timetable, route-search or realtime operation", () => {
    for (const operation of [
      "station_timetable",
      "train_timetable",
      "train",
      "train_information",
      "bus",
      "busstop_pole",
      "route_search",
      "journey",
    ]) {
      expect(validateOdptRequest({ operation })).toEqual({
        ok: false,
        error: "unsupported_operation",
      });
    }
  });
});
