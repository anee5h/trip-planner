// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES, ODPT_RATE_LIMIT, onRequest } from "./odpt.js";
import { __resetRequestGuardState } from "../_request-guards.js";

const KEY = "fixture-odpt-key";
const ENV = { ODPT_API_KEY: KEY };

const STATION = {
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
};

const STATION_QUERY = {
  operation: "station",
  railway: "odpt.Railway:JR-East.Yamanote",
};

function makeContext({
  method = "POST",
  body = STATION_QUERY,
  ip = "203.0.113.9",
  env = ENV,
  rawBody,
} = {}) {
  const payload =
    rawBody !== undefined
      ? rawBody
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
  return {
    request: new Request("https://meguruto.app/api/odpt", {
      method,
      headers: {
        "CF-Connecting-IP": ip,
        "content-type": "application/json",
      },
      body: method === "POST" ? payload : undefined,
    }),
    env,
  };
}

function stubProviderFetch(payload, status = 200) {
  const calls = [];
  vi.stubGlobal("fetch", async (url, init) => {
    calls.push({ url, init });
    return new Response(
      typeof payload === "string" ? payload : JSON.stringify(payload),
      { status, headers: { "content-type": "application/json" } },
    );
  });
  return calls;
}

afterEach(() => {
  __resetRequestGuardState();
  vi.unstubAllGlobals();
});

describe("/api/odpt boundary", () => {
  it("rejects non-POST methods with 405", async () => {
    const response = await onRequest(makeContext({ method: "GET" }));
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "method_not_allowed",
    });
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await onRequest(makeContext({ rawBody: "{not json" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "invalid_json",
    });
  });

  it("rejects an oversized body with 413", async () => {
    const response = await onRequest(
      makeContext({
        rawBody: `{"operation":"station","title":"${"a".repeat(MAX_BODY_BYTES)}"}`,
      }),
    );
    expect(response.status).toBe(413);
  });

  it.each([
    [
      "an arbitrary provider url",
      { operation: "station", url: "https://evil.example/api/v4" },
      "unsupported_field",
    ],
    [
      "an arbitrary rdf:type",
      { operation: "station", "rdf:type": "odpt:Operator" },
      "unsupported_field",
    ],
    [
      "an arbitrary queryParameters object",
      { operation: "station", queryParameters: { "dc:title": "東京" } },
      "unsupported_field",
    ],
    [
      "a client-supplied consumer key",
      { ...STATION_QUERY, "acl:consumerKey": "attacker-key" },
      "unsupported_field",
    ],
    [
      "an unknown operation",
      { operation: "police_box" },
      "unsupported_operation",
    ],
    [
      "an unfiltered search",
      { operation: "station" },
      "unfiltered_search_not_allowed",
    ],
  ])("rejects %s with 400", async (_label, body, error) => {
    const response = await onRequest(makeContext({ body }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error });
  });

  it("never calls the provider for a rejected request", async () => {
    const calls = stubProviderFetch([]);
    const response = await onRequest(
      makeContext({
        body: { ...STATION_QUERY, "acl:consumerKey": "attacker-key" },
      }),
    );
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("returns canonical normalized evidence and never the credential", async () => {
    const calls = stubProviderFetch([STATION]);
    const response = await onRequest(makeContext());
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("acl:consumerKey");

    const result = JSON.parse(text);
    expect(result).toMatchObject({
      provider: "odpt",
      operation: "station",
      outcome: "records",
      recordCount: 1,
    });
    expect(result.records[0]).toMatchObject({
      sameAs: "odpt.Station:JR-East.Yamanote.Tokyo",
      stationCode: "JY01",
    });
    expect(result.sourceUrl).toBe(
      "https://api.odpt.org/api/v4/odpt:Station?odpt:railway=odpt.Railway%3AJR-East.Yamanote",
    );

    // The credential is injected into the outbound provider call only.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`acl:consumerKey=${KEY}`);
  });

  it("returns a canonical error result rather than a 4xx when the key is absent", async () => {
    stubProviderFetch([STATION]);
    const response = await onRequest(makeContext({ env: {} }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      outcome: "error",
      errorCode: "provider_not_configured",
    });
  });

  it("returns 402 billing_required as data under the hard-\u00a50 rule", async () => {
    const calls = stubProviderFetch({ message: "billing" }, 402);
    const response = await onRequest(
      makeContext({
        body: {
          operation: "datapoint",
          dataUri: "urn:ucode:_00001C000000000000010000030FD7E5",
        },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "error",
      errorCode: "billing_required",
    });
    expect(calls).toHaveLength(1);
  });

  it("rate limits repeated requests from one client with 429", async () => {
    stubProviderFetch([STATION]);
    for (let index = 0; index < ODPT_RATE_LIMIT.limit; index += 1) {
      const response = await onRequest(makeContext());
      expect(response.status).toBe(200);
    }
    const limited = await onRequest(makeContext());
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(limited.headers.get("Retry-After")).toBe("600");
  });

  it("does not rate limit a different client", async () => {
    stubProviderFetch([STATION]);
    for (let index = 0; index < ODPT_RATE_LIMIT.limit + 1; index += 1) {
      await onRequest(makeContext());
    }
    const other = await onRequest(makeContext({ ip: "198.51.100.7" }));
    expect(other.status).toBe(200);
  });
});
