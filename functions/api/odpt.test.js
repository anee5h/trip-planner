// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BODY_BYTES,
  ODPT_RATE_LIMIT,
  __getOdptProtectionState,
  __resetOdptProtection,
  __setOdptProtectionForTest,
  onRequest,
} from "./odpt.js";
import { __resetRequestGuardState } from "../_request-guards.js";
import { odptProviderScope } from "./odpt-request-identity.js";
import {
  createMemoryCacheStore,
  createOdptResultCache,
  createOdptRuntimeProtection,
} from "./odpt-runtime-protection.js";

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
  __resetOdptProtection();
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

describe("/api/odpt runtime request protection (KAI-290 PR 2B)", () => {
  it("serves a repeated identical request from cache with one provider call", async () => {
    const calls = stubProviderFetch([STATION]);

    const first = await onRequest(makeContext());
    const second = await onRequest(makeContext());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(calls).toHaveLength(1);

    const firstBody = await first.json();
    const secondBody = await second.json();
    // The transport payload is identical: caching must not change semantics.
    expect(secondBody).toEqual(firstBody);
    // A CACHED public response exposes no runtime metadata either — caching is
    // not a reason to leak how the request was served.
    expect(secondBody).not.toHaveProperty("runtime");
    expect(JSON.stringify(secondBody)).not.toContain("cacheHit");
    expect(JSON.stringify(secondBody)).not.toContain("dedupHit");
    expect(JSON.stringify(secondBody)).not.toContain("budget");
    // Cache-hit observability is internal, not part of the response.
    const state = __getOdptProtectionState();
    expect(state.counters.providerRequests).toBe(1);
    expect(state.counters.cacheMisses).toBe(1);
    expect(state.counters.cacheHits).toBe(1);
    // The credential is absent from the fresh AND the cached public payload.
    for (const payload of [firstBody, secondBody]) {
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(KEY);
      expect(serialized).not.toContain("consumerKey");
      expect(serialized).not.toContain("acl:");
      expect(serialized).not.toContain("ODPT_API_KEY");
    }
  });

  it("keeps budget exhaustion visible through the canonical errorCode", async () => {
    // Real production wiring, configured to one attempt: the first request
    // spends it, so a second DISTINCT request is refused by the budget.
    const calls = stubProviderFetch([STATION]);
    const tight = {
      ...ENV,
      ODPT_PROVIDER_BUDGET_LIMIT: "1",
      ODPT_PROVIDER_BUDGET_WINDOW_MS: "60000",
    };

    const first = await onRequest(makeContext({ env: tight }));
    expect((await first.json()).outcome).toBe("records");

    const refused = await onRequest(
      makeContext({
        env: tight,
        body: { operation: "station", operator: "odpt.Operator:TokyoMetro" },
      }),
    );
    const body = await refused.json();

    // Client-relevant canonical semantics are PRESERVED: the state is reported
    // through errorCode, which is part of the public contract.
    expect(refused.status).toBe(200);
    expect(body.outcome).toBe("error");
    expect(body.errorCode).toBe("budget_exhausted");
    expect(body.records).toEqual([]);
    expect(body.recordCount).toBe(0);
    // First-attempt refusal: nothing was fetched, so provenance is empty.
    expect(body.sourceUrl).toBe("");

    // Still no runtime metadata, and still no credential.
    expect(body).not.toHaveProperty("runtime");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("budgetTokensUsed");
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain("consumerKey");

    // The refusal never reached the provider.
    expect(calls).toHaveLength(1);
    const state = __getOdptProtectionState();
    expect(state.counters.providerRequests).toBe(1);
    expect(state.counters.budgetRejected).toBe(1);
    expect(state.counters.budgetAllowed).toBe(1);
  });

  it("does NOT expose internal runtime metadata on the public response", async () => {
    stubProviderFetch([STATION]);
    const response = await onRequest(makeContext());
    const body = await response.json();

    // The public contract is the canonical normalized result, nothing more.
    // Cache/dedup/budget counters are internal; exposing them would silently
    // widen the endpoint contract for every caller.
    expect(body).not.toHaveProperty("runtime");
    expect(Object.keys(body).sort()).toEqual([
      "normalization",
      "operation",
      "outcome",
      "provider",
      "recordCount",
      "records",
      "retrievedAt",
      "sourceResource",
      "sourceUrl",
    ]);
    expect(JSON.stringify(body)).not.toContain("cacheHit");
    expect(JSON.stringify(body)).not.toContain("dedupHit");
    expect(JSON.stringify(body)).not.toContain("providerAttempts");
    expect(JSON.stringify(body)).not.toContain("budget");

    // The same metadata stays available to harnesses and unit tests.
    const state = __getOdptProtectionState();
    expect(state.counters.providerRequests).toBe(1);
    expect(state.counters.budgetAllowed).toBe(1);
    expect(state.budget).not.toBeNull();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain("consumerKey");
    expect(serialized).not.toContain("acl:");
  });

  it("does not let a cached success mask a missing credential", async () => {
    stubProviderFetch([STATION]);
    // Warm the cache with a healthy configuration.
    const warm = await onRequest(makeContext());
    expect((await warm.json()).outcome).toBe("records");

    // Now the credential disappears. Readiness is request-independent and is
    // evaluated BEFORE the cache, so the misconfiguration must surface rather
    // than being hidden behind a stale success.
    const broken = await onRequest(makeContext({ env: {} }));
    expect(broken.status).toBe(200);
    await expect(broken.json()).resolves.toMatchObject({
      outcome: "error",
      errorCode: "provider_not_configured",
    });
  });

  it("contacts the provider once per distinct request, not once per call", async () => {
    const calls = stubProviderFetch([STATION]);

    await onRequest(makeContext({ body: STATION_QUERY }));
    await onRequest(
      makeContext({
        body: { operation: "station", operator: "odpt.Operator:Toei" },
      }),
    );
    // A repeat of the first request is a cache hit, not a new provider call.
    await onRequest(makeContext({ body: STATION_QUERY }));

    expect(calls).toHaveLength(2);
  });

  it("exposes isolate-local coordination scope rather than global", async () => {
    stubProviderFetch([STATION]);
    await onRequest(makeContext());
    const state = __getOdptProtectionState();
    expect(state.cacheScope).toBe("isolate-local");
    expect(state.budgetScope).toBe("isolate-local");
    expect(JSON.stringify(state).toLowerCase()).not.toContain("global");
    expect(JSON.stringify(state)).not.toContain(KEY);
  });

  it("does not cache a provider failure", async () => {
    const calls = stubProviderFetch([], 500);

    const first = await onRequest(makeContext());
    const second = await onRequest(makeContext());

    await expect(first.json()).resolves.toMatchObject({
      outcome: "error",
      errorCode: "provider_internal_error",
    });
    await expect(second.json()).resolves.toMatchObject({
      outcome: "error",
      errorCode: "provider_internal_error",
    });
    expect(calls).toHaveLength(2);
    const state = __getOdptProtectionState();
    expect(state.counters.cacheWrites).toBe(0);
  });

  it("budgets EVERY outbound attempt, including the bounded 503 retry", async () => {
    // Two 503s: the initial attempt and its retry are two real fetches.
    const calls = stubProviderFetch([], 503);
    const response = await onRequest(makeContext());
    const body = await response.json();

    expect(calls).toHaveLength(2);
    expect(body).not.toHaveProperty("runtime");
    expect(body.errorCode).toBe("provider_unavailable");

    const state = __getOdptProtectionState();
    expect(state.counters.providerRequests).toBe(2);
    // The counter means ACTUAL outbound attempts, not logical lookups.
    expect(state.counters.budgetAllowed).toBe(2);
  });

  it("503 then success costs two tokens and reports one logical result", async () => {
    // First fetch 503, retry succeeds.
    let call = 0;
    vi.stubGlobal("fetch", async () => {
      call += 1;
      return call === 1
        ? new Response("{}", { status: 503 })
        : new Response(JSON.stringify([STATION]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
    });

    const response = await onRequest(makeContext());
    const body = await response.json();

    expect(call).toBe(2);
    expect(body.outcome).toBe("records");
    expect(body).not.toHaveProperty("runtime");
    const state = __getOdptProtectionState();
    expect(state.counters.providerRequests).toBe(2);
    expect(state.counters.budgetAllowed).toBe(2);
    expect(state.counters.budgetRejected).toBe(0);
  });

  it("reports a provider scope and never serves another scope's cache entry", async () => {
    stubProviderFetch([STATION]);
    await onRequest(makeContext());
    expect(__getOdptProtectionState().counters.cacheMisses).toBe(1);

    // A second identical request still hits the same scope's entry.
    await onRequest(makeContext());
    expect(__getOdptProtectionState().counters.cacheHits).toBe(1);

    // The cache key is derived from the resolved base URL, so it must differ
    // when the deployment points at a different allow-listed endpoint.
    const official = odptProviderScope("https://api.odpt.org/api/v4");
    const mirror = odptProviderScope("https://odpt-mirror.example/api/v4");
    expect(official).not.toBe(mirror);
  });

  it("returns budget_unavailable (not provider failure) when the budget backend fails", async () => {
    const calls = stubProviderFetch([STATION]);
    // Inject a budget backend that cannot return a trustworthy decision. This
    // is a seam for tests, not environment configuration.
    __setOdptProtectionForTest(
      createOdptRuntimeProtection({
        cache: createOdptResultCache({ store: createMemoryCacheStore() }),
        budget: {
          acquire: async () => {
            throw new Error("budget backend unavailable");
          },
        },
      }),
    );
    const response = await onRequest(makeContext());
    const body = await response.json();

    // No provider request was issued for the blocked attempt.
    expect(calls).toHaveLength(0);
    expect(response.status).toBe(200);
    expect(body.outcome).toBe("error");
    expect(body.errorCode).toBe("budget_unavailable");
    expect(body).not.toHaveProperty("runtime");
    // Never presented as provider unavailability or as provider "no data".
    expect(body.errorCode).not.toBe("budget_exhausted");
    expect(body.errorCode).not.toBe("no_data");
    expect(body.records).toEqual([]);
  });
});
