import { describe, expect, it } from "vitest";
import { OdptApiProvider, ODPT_API_ENDPOINT } from "../OdptApiProvider";

const stationRecord = {
  id: "odpt.Station:JR-East.Yamanote.Tokyo",
  sameAs: "odpt.Station:JR-East.Yamanote.Tokyo",
  ucode: "urn:ucode:_00001C000000000000010000030FD7E5",
  title: "東京",
  stationTitle: { ja: "東京", en: "Tokyo" },
  operator: "odpt.Operator:JR-East",
  operatorTitle: null,
  railway: "odpt.Railway:JR-East.Yamanote",
  railwayTitle: null,
  stationCode: "JY01",
  coordinates: { lat: 35.6812, lng: 139.7671 },
  connectingRailway: [],
  connectingStation: [],
  date: "2017-01-13T15:10:00+09:00",
  validUntil: null,
  provenance: {
    provider: "odpt",
    providerId: "odpt.Station:JR-East.Yamanote.Tokyo",
    ucode: "urn:ucode:_00001C000000000000010000030FD7E5",
    generatedAt: "2017-01-13T15:10:00+09:00",
    issuedAt: null,
    validUntil: null,
    fetchedAt: "2026-09-10T00:00:00.000Z",
    sourceResource: "odpt:Station",
    sourceUrl: "https://api.odpt.org/api/v4/odpt:Station",
    coverage: "unknown",
  },
};

function okResponse(result: Record<string, unknown>) {
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function recordsResult(records: unknown[]) {
  return {
    provider: "odpt",
    operation: "station",
    outcome: "records",
    records,
    recordCount: records.length,
    retrievedAt: "2026-09-10T00:00:00.000Z",
    sourceResource: "odpt:Station",
    sourceUrl: "https://api.odpt.org/api/v4/odpt:Station",
    normalization: "odpt-api-v4.16",
  };
}

function providerWith(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
) {
  return new OdptApiProvider({ fetchImpl });
}

describe("OdptApiProvider", () => {
  it("posts to the Meguruto /api/odpt boundary, never to ODPT directly", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const provider = providerWith(async (url, init) => {
      calls.push({ url, init });
      return okResponse(recordsResult([stationRecord]));
    });

    const result = await provider.station({
      railway: "odpt.Railway:JR-East.Yamanote",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ODPT_API_ENDPOINT);
    expect(calls[0].url).not.toContain("odpt.org");
    expect(calls[0].init?.method).toBe("POST");
    expect(result.outcome).toBe("records");
    expect(result.records[0]).toMatchObject({
      sameAs: "odpt.Station:JR-East.Yamanote.Tokyo",
      provenance: { coverage: "unknown" },
    });
  });

  it.each([
    [
      "nearbyStations",
      (provider: OdptApiProvider) =>
        provider.nearbyStations({ lat: 35.6812, lon: 139.7671, radius: 500 }),
      {
        operation: "nearby_stations",
        lat: 35.6812,
        lon: 139.7671,
        radius: 500,
      },
    ],
    [
      "railway",
      (provider: OdptApiProvider) =>
        provider.railway({ sameAs: "odpt.Railway:JR-East.Yamanote" }),
      { operation: "railway", sameAs: "odpt.Railway:JR-East.Yamanote" },
    ],
    [
      "railwayFare",
      (provider: OdptApiProvider) =>
        provider.railwayFare({
          fromStation: "odpt.Station:TokyoMetro.Marunouchi.Tokyo",
          toStation: "odpt.Station:TokyoMetro.Tozai.Nakano",
        }),
      {
        operation: "railway_fare",
        fromStation: "odpt.Station:TokyoMetro.Marunouchi.Tokyo",
        toStation: "odpt.Station:TokyoMetro.Tozai.Nakano",
      },
    ],
    [
      "datapoint",
      (provider: OdptApiProvider) =>
        provider.datapoint({
          dataUri: "urn:ucode:_00001C000000000000010000030FD7E5",
        }),
      {
        operation: "datapoint",
        dataUri: "urn:ucode:_00001C000000000000010000030FD7E5",
      },
    ],
  ])(
    "emits only allow-listed fields for %s",
    async (_label, call, expected) => {
      let sent: Record<string, unknown> | undefined;
      const provider = providerWith(async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return okResponse(recordsResult([]));
      });
      await call(provider);
      expect(sent).toEqual(expected);
    },
  );

  it("sends no credential field of any kind", async () => {
    let raw = "";
    const provider = providerWith(async (_url, init) => {
      raw = String(init?.body);
      return okResponse(recordsResult([]));
    });
    await provider.station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(raw).not.toContain("consumerKey");
    expect(raw).not.toContain("acl:");
    expect(raw).not.toContain("odpt.org");
  });

  it("distinguishes a successful empty result from a provider failure", async () => {
    const empty = await providerWith(async () =>
      okResponse(recordsResult([])),
    ).station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(empty).toMatchObject({ outcome: "records", recordCount: 0 });
    expect(empty.errorCode).toBeUndefined();

    const failed = await providerWith(async () =>
      okResponse({
        provider: "odpt",
        operation: "station",
        outcome: "error",
        records: [],
        recordCount: 0,
        errorCode: "provider_authentication_error",
        retrievedAt: "2026-09-10T00:00:00.000Z",
        sourceResource: "odpt:Station",
        sourceUrl: "",
        normalization: "odpt-api-v4.16",
      }),
    ).station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(failed).toMatchObject({
      outcome: "error",
      errorCode: "provider_authentication_error",
    });
  });

  it("surfaces billing_required rather than availability", async () => {
    const provider = providerWith(async () =>
      okResponse({
        provider: "odpt",
        operation: "datapoint",
        outcome: "error",
        records: [],
        recordCount: 0,
        errorCode: "billing_required",
        retrievedAt: "2026-09-10T00:00:00.000Z",
        sourceResource: "datapoints",
        sourceUrl: "",
        normalization: "odpt-api-v4.16",
      }),
    );
    const result = await provider.datapoint({
      dataUri: "urn:ucode:_00001C000000000000010000030FD7E5",
    });
    expect(result.errorCode).toBe("billing_required");
  });

  it.each([
    ["a non-object success payload", "[]", "invalid_provider_response"],
    [
      "an unknown outcome",
      JSON.stringify({
        outcome: "maybe",
        records: [],
        recordCount: 0,
      }),
      "invalid_provider_response",
    ],
    [
      "a records outcome without an array",
      JSON.stringify({ outcome: "records", records: {}, recordCount: 0 }),
      "invalid_provider_response",
    ],
  ])("fails closed on %s", async (_label, payload, errorCode) => {
    const result = await providerWith(
      async () => new Response(payload, { status: 200 }),
    ).station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(result).toMatchObject({ outcome: "error", errorCode });
    expect(result.records).toEqual([]);
  });

  it("rejects a 200 body that is not a canonical ODPT result", async () => {
    const result = await providerWith(async () =>
      okResponse({ ok: false, error: "rate_limited" }),
    ).station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "invalid_provider_response",
    });
  });

  it("maps 429 to rate_limited and 405 to method_not_allowed", async () => {
    const limited = await providerWith(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
          status: 429,
        }),
    ).station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(limited.errorCode).toBe("rate_limited");

    const method = await providerWith(
      async () => new Response("", { status: 405 }),
    ).station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(method.errorCode).toBe("method_not_allowed");
  });

  it("normalizes a network failure and a timeout", async () => {
    const network = await providerWith(async () => {
      throw new Error("offline");
    }).station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(network.errorCode).toBe("network_error");

    const timeout = await new OdptApiProvider({
      timeoutMs: 10,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    }).station({ railway: "odpt.Railway:JR-East.Yamanote" });
    expect(timeout.errorCode).toBe("provider_timeout");
  });

  it("keeps the credential out of every result field", async () => {
    const provider = providerWith(async () =>
      okResponse(recordsResult([stationRecord])),
    );
    const result = await provider.station({
      railway: "odpt.Railway:JR-East.Yamanote",
    });
    expect(JSON.stringify(result)).not.toContain("consumerKey");
    expect(result.sourceUrl).not.toContain("consumerKey");
  });
});

describe("ODPT client configuration", () => {
  it("never reads a browser-exposed ODPT credential", () => {
    // The adapter has no apiKey option at all: the credential exists only in
    // the Pages Function environment.
    const provider = new OdptApiProvider({
      fetchImpl: async () => okResponse(recordsResult([])),
    });
    expect(provider).not.toHaveProperty("apiKey");
    expect(provider).not.toHaveProperty("consumerKey");
  });

  it("exposes no VITE_ODPT browser variable in the adapter module", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await readFile(
      path.resolve(
        process.cwd(),
        "src/shared/services/transport/OdptApiProvider.ts",
      ),
      "utf8",
    );
    expect(source).not.toContain("VITE_ODPT");
    expect(source).not.toContain("api.odpt.org");
  });
});

describe("deferred KAI-290+ client surface", () => {
  it("exposes no timetable, routing or realtime provider method", () => {
    const provider = new OdptApiProvider({
      fetchImpl: async () => okResponse(recordsResult([])),
    });
    for (const method of [
      "stationTimetable",
      "trainTimetable",
      "train",
      "trainInformation",
      "bus",
      "routeSearch",
      "journey",
    ]) {
      expect(provider).not.toHaveProperty(method);
    }
  });
});
