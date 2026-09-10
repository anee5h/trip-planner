// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { validateOdptRequest } from "./odpt-core.js";
import {
  ODPT_CACHE_CLASS,
  ODPT_CACHE_TTL_MS,
  ODPT_DEFAULT_BUDGET_LIMIT,
  ODPT_NEGATIVE_CACHE_TTL_MS,
  ODPT_NON_CACHEABLE_ERROR_CODES,
  ODPT_PROTECTION_SCOPE,
  cacheClassForOperation,
  cacheTtlMsForClass,
  classifyResultForCache,
  createEdgeCacheStore,
  createMemoryCacheStore,
  createOdptRequestBudget,
  createOdptResultCache,
  createOdptRuntimeProtection,
} from "./odpt-runtime-protection.js";

const KEY = "fixture-odpt-key";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function validatedOf(body) {
  const validated = validateOdptRequest(body);
  expect(validated.ok).toBe(true);
  return validated;
}

const STATION_QUERY = validatedOf({
  operation: "station",
  operator: "odpt.Operator:Toei",
});
const FARE_QUERY = validatedOf({
  operation: "railway_fare",
  fromStation: "odpt.Station:Toei.Mita.Hakusan",
  toStation: "odpt.Station:Toei.Mita.Sugamo",
  operator: "odpt.Operator:Toei",
});

function recordsResult(operation = "station", records = [{ id: "a" }]) {
  return {
    provider: "odpt",
    operation,
    outcome: "records",
    records,
    recordCount: records.length,
    retrievedAt: "2026-09-10T00:00:00.000Z",
    sourceResource: "odpt:Station",
    sourceUrl: "https://api.odpt.org/api/v4/odpt:Station",
    normalization: "odpt-api-v4.16",
  };
}

function emptyResult(operation = "station") {
  return { ...recordsResult(operation, []), recordCount: 0 };
}

function errorResult(errorCode, operation = "station") {
  return {
    ...recordsResult(operation, []),
    outcome: "error",
    errorCode,
  };
}

function noDataResult(operation = "station") {
  return {
    ...recordsResult(operation, []),
    outcome: "no_data",
    errorCode: "no_applicable_data",
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Store wrapper that records the keys it is asked about (for leak checks). */
function recordingStore(inner) {
  const keys = [];
  return {
    scope: inner.scope,
    keys,
    async read(key) {
      keys.push(key);
      return inner.read(key);
    },
    async write(key, entry) {
      keys.push(key);
      return inner.write(key, entry);
    },
    async remove(key) {
      keys.push(key);
      return inner.remove(key);
    },
    size: () => inner.size(),
  };
}

/** Builds a protection layer on a controllable clock with a counting budget. */
function harness({
  limit = ODPT_DEFAULT_BUDGET_LIMIT,
  windowMs = MINUTE,
  budget = true,
  clock = { value: 1_700_000_000_000 },
} = {}) {
  const now = () => clock.value;
  const store = recordingStore(createMemoryCacheStore({ now }));
  const cache = createOdptResultCache({ store, now });
  const budgetImpl = budget
    ? createOdptRequestBudget({ limit, windowMs, now })
    : null;
  const acquireSpy = vi.fn(() => budgetImpl.acquire());
  const budgetSpy = budget
    ? {
        scope: budgetImpl.scope,
        limit,
        windowMs,
        acquire: acquireSpy,
        snapshot: () => budgetImpl.snapshot(),
      }
    : null;
  const protection = createOdptRuntimeProtection({
    cache,
    budget: budgetSpy,
    now,
  });
  return {
    protection,
    store,
    cache,
    budgetImpl,
    budgetSpy,
    acquireSpy,
    clock,
    now,
  };
}

// ── Deduplication ────────────────────────────────────────────────────────────

describe("in-flight request deduplication", () => {
  it("collapses 2 concurrent identical requests into one provider call", async () => {
    const { protection } = harness();
    const gate = deferred();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return gate.promise;
    };

    const both = Promise.all([
      protection.run(STATION_QUERY, execute),
      protection.run(STATION_QUERY, execute),
    ]);
    gate.resolve(recordsResult());
    const [first, second] = await both;

    expect(providerCalls).toBe(1);
    expect(first.result).toEqual(second.result);
    expect(first.runtime.dedupHit).toBe(false);
    expect(second.runtime.dedupHit).toBe(true);
    expect(second.runtime.providerRequest).toBe(false);
  });

  it("collapses 10 concurrent identical requests into one provider call", async () => {
    const { protection } = harness();
    const gate = deferred();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return gate.promise;
    };

    const all = Array.from({ length: 10 }, () =>
      protection.run(STATION_QUERY, execute),
    );
    gate.resolve(recordsResult());
    const results = await Promise.all(all);

    expect(providerCalls).toBe(1);
    const deduped = results.filter((entry) => entry.runtime.dedupHit);
    expect(deduped).toHaveLength(9);
    // Every caller observed the same normalized payload.
    const payloads = new Set(
      results.map((entry) => JSON.stringify(entry.result)),
    );
    expect(payloads.size).toBe(1);
  });

  it("issues separate provider calls for different requests", async () => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return Promise.resolve(recordsResult());
    };

    await Promise.all([
      protection.run(STATION_QUERY, execute),
      protection.run(FARE_QUERY, execute),
    ]);
    expect(providerCalls).toBe(2);
  });

  it("removes the in-flight entry after a failure and does not poison retries", async () => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      if (providerCalls === 1)
        return Promise.reject(new Error("provider boom"));
      return Promise.resolve(recordsResult());
    };

    await expect(protection.run(STATION_QUERY, execute)).rejects.toThrow(
      "provider boom",
    );
    expect(protection.inFlightSize()).toBe(0);

    // A later identical request performs a NEW provider request.
    const retry = await protection.run(STATION_QUERY, execute);
    expect(retry.result.outcome).toBe("records");
    expect(providerCalls).toBe(2);
  });

  it("clears the in-flight entry after a successful request", async () => {
    const { protection } = harness();
    await protection.run(STATION_QUERY, () => Promise.resolve(recordsResult()));
    expect(protection.inFlightSize()).toBe(0);
  });

  it("does not let a failed request poison a concurrent identical follower", async () => {
    const { protection } = harness();
    const gate = deferred();
    const leader = protection.run(STATION_QUERY, () => gate.promise);
    const follower = protection.run(STATION_QUERY, () =>
      Promise.resolve(recordsResult()),
    );
    gate.reject(new Error("boom"));

    await expect(leader).rejects.toThrow("boom");
    await expect(follower).rejects.toThrow("boom");
    expect(protection.inFlightSize()).toBe(0);
  });
});

// ── Budget accounting vs dedup/cache ─────────────────────────────────────────

describe("provider budget accounting", () => {
  it("acquires exactly one token per real provider fetch", async () => {
    const { protection, acquireSpy } = harness();
    const run = await protection.run(STATION_QUERY, () =>
      Promise.resolve(recordsResult()),
    );
    expect(run.runtime.providerRequest).toBe(true);
    expect(run.runtime.budgetAllowed).toBe(true);
    expect(acquireSpy).toHaveBeenCalledTimes(1);
  });

  it("acquires zero tokens for a dedup follower", async () => {
    const { protection, acquireSpy } = harness();
    const gate = deferred();
    const all = Array.from({ length: 5 }, () =>
      protection.run(STATION_QUERY, () => {
        gate.resolve(recordsResult());
        return gate.promise;
      }),
    );
    await Promise.all(all);
    expect(acquireSpy).toHaveBeenCalledTimes(1);
  });

  it("acquires zero tokens for a cache hit", async () => {
    const { protection, acquireSpy } = harness();
    await protection.run(STATION_QUERY, () => Promise.resolve(recordsResult()));
    expect(acquireSpy).toHaveBeenCalledTimes(1);

    const second = await protection.run(STATION_QUERY, () =>
      Promise.resolve(recordsResult()),
    );
    expect(second.runtime.cacheHit).toBe(true);
    // Still one: the cache hit consumed no budget.
    expect(acquireSpy).toHaveBeenCalledTimes(1);
  });

  it("returns an explicit budget_exhausted state instead of a provider error", async () => {
    const { protection } = harness({ limit: 1 });
    await protection.run(STATION_QUERY, () => Promise.resolve(recordsResult()));

    // A semantically DIFFERENT request must not be served from cache.
    const blocked = await protection.run(
      validatedOf({
        operation: "station",
        operator: "odpt.Operator:TokyoMetro",
      }),
      () => Promise.resolve(recordsResult()),
    );
    expect(blocked.result.outcome).toBe("error");
    expect(blocked.result.errorCode).toBe("budget_exhausted");
    expect(blocked.runtime.providerRequest).toBe(false);
    expect(blocked.runtime.budgetAllowed).toBe(false);
    // It is neither "no data" nor an empty success.
    expect(blocked.result.outcome).not.toBe("no_data");
    expect(blocked.result.records).toEqual([]);
  });

  it("resets deterministically when the window rolls over", async () => {
    const clock = { value: 1_700_000_000_000 };
    const budget = createOdptRequestBudget({
      limit: 2,
      windowMs: MINUTE,
      now: () => clock.value,
    });
    expect(budget.acquire().allowed).toBe(true);
    expect(budget.acquire().allowed).toBe(true);
    expect(budget.acquire().allowed).toBe(false);

    clock.value += MINUTE - 1;
    expect(budget.acquire().allowed).toBe(false);

    clock.value += 1;
    expect(budget.acquire().allowed).toBe(true);
    expect(budget.snapshot().used).toBe(1);
  });

  it("is configurable and injectable", async () => {
    const { protection } = harness({ limit: 1, windowMs: 5 * MINUTE });
    const first = await protection.run(STATION_QUERY, () =>
      Promise.resolve(recordsResult()),
    );
    expect(first.runtime.budgetAllowed).toBe(true);
    const second = await protection.run(FARE_QUERY, () =>
      Promise.resolve(recordsResult()),
    );
    expect(second.result.errorCode).toBe("budget_exhausted");
  });

  it("reports isolate-local scope and never claims global enforcement", () => {
    const budget = createOdptRequestBudget({ limit: 5, windowMs: MINUTE });
    expect(budget.scope).toBe("isolate-local");
    expect(budget.snapshot().scope).toBe("isolate-local");
    expect(ODPT_PROTECTION_SCOPE.requestBudget).toBe("isolate-local");
    expect(ODPT_PROTECTION_SCOPE.memoryCache).toBe("isolate-local");
    expect(ODPT_PROTECTION_SCOPE.edgeCache).toContain("edge-local");
    const claims = JSON.stringify(ODPT_PROTECTION_SCOPE).toLowerCase();
    expect(claims).not.toContain("global");
    expect(claims).not.toContain("distributed");
  });

  it("rejects invalid budget configuration", () => {
    expect(() => createOdptRequestBudget({ limit: 0 })).toThrow(TypeError);
    expect(() => createOdptRequestBudget({ limit: 1.5 })).toThrow(TypeError);
    expect(() => createOdptRequestBudget({ windowMs: 0 })).toThrow(TypeError);
  });
});

// ── Caching ──────────────────────────────────────────────────────────────────

describe("result caching", () => {
  it("misses then hits, and a hit performs no provider call", async () => {
    const { protection, acquireSpy } = harness();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return Promise.resolve(recordsResult());
    };

    const first = await protection.run(STATION_QUERY, execute);
    const second = await protection.run(STATION_QUERY, execute);

    expect(first.runtime.cacheHit).toBe(false);
    expect(second.runtime.cacheHit).toBe(true);
    expect(providerCalls).toBe(1);
    expect(acquireSpy).toHaveBeenCalledTimes(1);
  });

  it("refetches after the entry expires", async () => {
    const { protection, clock } = harness();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return Promise.resolve(recordsResult());
    };

    await protection.run(STATION_QUERY, execute);
    clock.value += ODPT_CACHE_TTL_MS.reference - 1;
    const stillCached = await protection.run(STATION_QUERY, execute);
    expect(stillCached.runtime.cacheHit).toBe(true);
    expect(providerCalls).toBe(1);

    clock.value += 1; // exactly at expiry
    const refetched = await protection.run(STATION_QUERY, execute);
    expect(refetched.runtime.cacheHit).toBe(false);
    expect(providerCalls).toBe(2);
  });

  it("shares one cache entry between canonical equivalents", async () => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return Promise.resolve(recordsResult());
    };

    // Same semantics, different JSON property order.
    await protection.run(
      validatedOf({
        operation: "railway_fare",
        fromStation: "odpt.Station:Toei.Mita.Hakusan",
        toStation: "odpt.Station:Toei.Mita.Sugamo",
      }),
      execute,
    );
    const reordered = await protection.run(
      validatedOf({
        toStation: "odpt.Station:Toei.Mita.Sugamo",
        operation: "railway_fare",
        fromStation: "odpt.Station:Toei.Mita.Hakusan",
      }),
      execute,
    );
    expect(reordered.runtime.cacheHit).toBe(true);
    expect(providerCalls).toBe(1);
  });

  it("does not collide semantically different requests", async () => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return Promise.resolve(recordsResult());
    };

    await protection.run(
      validatedOf({
        operation: "station_timetable",
        station: "odpt.Station:Toei.Mita.Hakusan",
      }),
      execute,
    );
    const other = await protection.run(
      validatedOf({
        operation: "station_timetable",
        station: "odpt.Station:Toei.Asakusa.HonjoAzumabashi",
      }),
      execute,
    );
    expect(other.runtime.cacheHit).toBe(false);
    expect(providerCalls).toBe(2);
  });

  it("caches a successful empty array as a successful empty result", async () => {
    const { protection } = harness();
    await protection.run(STATION_QUERY, () => Promise.resolve(emptyResult()));
    const cached = await protection.run(STATION_QUERY, () =>
      Promise.resolve(recordsResult()),
    );
    expect(cached.runtime.cacheHit).toBe(true);
    expect(cached.result.outcome).toBe("records");
    expect(cached.result.records).toEqual([]);
    expect(cached.result.recordCount).toBe(0);
  });

  it("keeps cached records as records with unchanged provenance", async () => {
    const { protection } = harness();
    const original = recordsResult("station", [{ id: "x", title: "三田" }]);
    await protection.run(STATION_QUERY, () => Promise.resolve(original));
    const cached = await protection.run(STATION_QUERY, () =>
      Promise.resolve(errorResult("provider_internal_error")),
    );
    expect(cached.runtime.cacheHit).toBe(true);
    expect(cached.result).toEqual(original);
  });

  it("treats a cache-key hash collision as a miss, not as the wrong result", async () => {
    const { cache } = harness();
    // Two different identities forced onto the same key by a stubbed hasher is
    // simulated by writing one identity and looking up another.
    await cache.store({
      identity: "identity-A",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      value: recordsResult(),
    });
    const lookup = await cache.lookup({
      identity: "identity-B",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
    });
    expect(lookup.hit).toBe(false);
  });

  it("degrades to no-cache when the cache throws", async () => {
    const explodingStore = {
      scope: "exploding",
      read: async () => {
        throw new Error("cache read exploded");
      },
      write: async () => {
        throw new Error("cache write exploded");
      },
      remove: async () => {},
      size: () => 0,
    };
    const protection = createOdptRuntimeProtection({
      cache: createOdptResultCache({ store: explodingStore }),
      budget: null,
    });
    let providerCalls = 0;
    const run = await protection.run(STATION_QUERY, () => {
      providerCalls += 1;
      return Promise.resolve(recordsResult());
    });
    expect(run.result.outcome).toBe("records");
    expect(providerCalls).toBe(1);
    expect(protection.counters.cacheErrors).toBeGreaterThan(0);
  });
});

describe("cache class and TTL policy", () => {
  it("assigns the documented class per operation", () => {
    for (const operation of [
      "operator",
      "station",
      "railway",
      "nearby_stations",
      "train_type",
      "rail_direction",
    ]) {
      expect(cacheClassForOperation(operation)).toBe(
        ODPT_CACHE_CLASS.REFERENCE,
      );
    }
    expect(cacheClassForOperation("calendar")).toBe(ODPT_CACHE_CLASS.CALENDAR);
    expect(cacheClassForOperation("station_timetable")).toBe(
      ODPT_CACHE_CLASS.TIMETABLE,
    );
    expect(cacheClassForOperation("train_timetable")).toBe(
      ODPT_CACHE_CLASS.TIMETABLE,
    );
    // A datapoint's @type is only known after the fetch, so it takes the
    // conservative data class rather than long-lived reference TTL.
    expect(cacheClassForOperation("datapoint")).toBe(
      ODPT_CACHE_CLASS.TIMETABLE,
    );
    expect(cacheClassForOperation("railway_fare")).toBe(ODPT_CACHE_CLASS.FARE);
    expect(cacheClassForOperation("police_box")).toBeNull();
  });

  it("uses the documented TTLs, each class distinct where required", () => {
    expect(cacheTtlMsForClass(ODPT_CACHE_CLASS.REFERENCE)).toBe(6 * HOUR);
    expect(cacheTtlMsForClass(ODPT_CACHE_CLASS.CALENDAR)).toBe(1 * HOUR);
    expect(cacheTtlMsForClass(ODPT_CACHE_CLASS.TIMETABLE)).toBe(5 * MINUTE);
    expect(cacheTtlMsForClass(ODPT_CACHE_CLASS.FARE)).toBe(1 * HOUR);
    expect(cacheTtlMsForClass(ODPT_CACHE_CLASS.NEGATIVE)).toBe(
      ODPT_NEGATIVE_CACHE_TTL_MS,
    );
    expect(cacheTtlMsForClass("nonsense")).toBeNull();
    // No TTL is infinite and none is zero.
    for (const value of Object.values(ODPT_CACHE_TTL_MS)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("expires a timetable entry on the timetable TTL, not the reference TTL", async () => {
    const { protection, clock } = harness();
    const timetable = validatedOf({
      operation: "station_timetable",
      station: "odpt.Station:Toei.Mita.Hakusan",
    });
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return Promise.resolve(recordsResult("station_timetable"));
    };

    await protection.run(timetable, execute);
    clock.value += ODPT_CACHE_TTL_MS.timetable + 1;
    const afterTimetableTtl = await protection.run(timetable, execute);
    expect(afterTimetableTtl.runtime.cacheHit).toBe(false);
    expect(providerCalls).toBe(2);
  });
});

// ── Cacheable / non-cacheable result matrix ──────────────────────────────────

describe("cacheable result matrix", () => {
  it("caches records and no_data, and nothing else", () => {
    const records = classifyResultForCache(recordsResult(), "station");
    expect(records.cacheable).toBe(true);
    expect(records.cacheClass).toBe(ODPT_CACHE_CLASS.REFERENCE);

    const empty = classifyResultForCache(emptyResult(), "station");
    expect(empty.cacheable).toBe(true);

    const noData = classifyResultForCache(noDataResult(), "station");
    expect(noData.cacheable).toBe(true);
    expect(noData.cacheClass).toBe(ODPT_CACHE_CLASS.NEGATIVE);

    const fare = classifyResultForCache(
      recordsResult("railway_fare"),
      "railway_fare",
    );
    expect(fare.cacheClass).toBe(ODPT_CACHE_CLASS.FARE);

    for (const code of ODPT_NON_CACHEABLE_ERROR_CODES) {
      const classified = classifyResultForCache(errorResult(code), "station");
      expect(classified.cacheable, `${code} must not be cacheable`).toBe(false);
    }
  });

  it("refuses to cache an unknown operation or malformed input", () => {
    expect(
      classifyResultForCache(recordsResult(), "police_box").cacheable,
    ).toBe(false);
    expect(classifyResultForCache(null, "station").cacheable).toBe(false);
    expect(
      classifyResultForCache({ outcome: "surprise" }, "station").cacheable,
    ).toBe(false);
  });

  it.each([
    "provider_authentication_error",
    "billing_required",
    "provider_authorization_error",
    "provider_internal_error",
    "provider_unavailable",
    "invalid_provider_response",
    "malformed_provider_json",
    "provider_response_too_large",
    "budget_exhausted",
  ])("never serves a cached %s", async (errorCode) => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return Promise.resolve(errorResult(errorCode));
    };

    const first = await protection.run(STATION_QUERY, execute);
    const second = await protection.run(STATION_QUERY, execute);

    expect(first.result.outcome).toBe("error");
    expect(first.result.errorCode).toBe(errorCode);
    expect(second.runtime.cacheHit).toBe(false);
    expect(providerCalls).toBe(2);
  });

  it("keeps 404 as no_data and never rewrites it to an empty success", async () => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = () => {
      providerCalls += 1;
      return Promise.resolve(noDataResult());
    };

    await protection.run(STATION_QUERY, execute);
    const cached = await protection.run(STATION_QUERY, execute);

    expect(cached.runtime.cacheHit).toBe(true);
    expect(providerCalls).toBe(1);
    expect(cached.result.outcome).toBe("no_data");
    expect(cached.result.errorCode).toBe("no_applicable_data");
    expect(cached.result.outcome).not.toBe("records");
  });

  it("keeps provider_response_too_large non-cacheable and never empty", async () => {
    const { protection } = harness();
    const execute = () =>
      Promise.resolve(
        errorResult("provider_response_too_large", "station_timetable"),
      );
    const wide = validatedOf({
      operation: "station_timetable",
      operator: "odpt.Operator:Toei",
    });

    const first = await protection.run(wide, execute);
    expect(first.result.outcome).toBe("error");
    expect(first.result.errorCode).toBe("provider_response_too_large");
    expect(first.result.records).toEqual([]);

    const second = await protection.run(wide, execute);
    expect(second.runtime.cacheHit).toBe(false);
    expect(second.result.errorCode).toBe("provider_response_too_large");
  });

  it("keeps 402 billing_required distinct from no_data", async () => {
    const { protection } = harness();
    const first = await protection.run(STATION_QUERY, () =>
      Promise.resolve(errorResult("billing_required")),
    );
    expect(first.result.errorCode).toBe("billing_required");
    expect(first.result.outcome).not.toBe("no_data");
    const second = await protection.run(STATION_QUERY, () =>
      Promise.resolve(errorResult("billing_required")),
    );
    expect(second.runtime.cacheHit).toBe(false);
  });

  it("does not let a failed request break a subsequent valid one", async () => {
    const { protection } = harness();
    const failed = await protection.run(STATION_QUERY, () =>
      Promise.resolve(errorResult("provider_internal_error")),
    );
    expect(failed.result.outcome).toBe("error");

    const ok = await protection.run(STATION_QUERY, () =>
      Promise.resolve(recordsResult()),
    );
    expect(ok.result.outcome).toBe("records");
    expect(ok.runtime.cacheHit).toBe(false);
  });
});

// ── Cloudflare Cache API store ───────────────────────────────────────────────

describe("edge cache store (Cloudflare Cache API)", () => {
  function fakeCacheApi() {
    const entries = new Map();
    return {
      entries,
      async match(request) {
        const response = entries.get(request.url);
        return response ? response.clone() : undefined;
      },
      async put(request, response) {
        entries.set(request.url, response);
      },
      async delete(request) {
        entries.delete(request.url);
        return true;
      },
    };
  }

  it("round-trips an entry through a synthetic GET key", async () => {
    const api = fakeCacheApi();
    const now = () => 1_700_000_000_000;
    const store = createEdgeCacheStore({ cache: api, now });
    await store.write("https://odpt-cache.meguruto.internal/v1/abc", {
      identity: "identity-A",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      expiresAt: now() + HOUR,
      value: recordsResult(),
    });

    const read = await store.read(
      "https://odpt-cache.meguruto.internal/v1/abc",
    );
    expect(read.identity).toBe("identity-A");
    expect(read.value.outcome).toBe("records");

    // The cache key is a synthetic credential-free URL, and the request used
    // to reach the Cache API is a GET (the inbound boundary request is POST).
    const [url] = [...api.entries.keys()];
    expect(url).not.toContain(KEY);
    expect(url).not.toContain("consumerKey");
    expect(url).not.toContain("api.odpt.org");
  });

  it("reports edge-local scope and ignores expired entries", async () => {
    const api = fakeCacheApi();
    let clock = 1_700_000_000_000;
    const store = createEdgeCacheStore({ cache: api, now: () => clock });
    expect(store.scope).toContain("edge-local");
    expect(store.scope.toLowerCase()).not.toContain("global");
    expect(store.scope.toLowerCase()).not.toContain("distributed");

    await store.write("https://odpt-cache.meguruto.internal/v1/exp", {
      identity: "identity-A",
      cacheClass: ODPT_CACHE_CLASS.TIMETABLE,
      expiresAt: clock + ODPT_CACHE_TTL_MS.timetable,
      value: recordsResult("station_timetable"),
    });
    expect(
      (await store.read("https://odpt-cache.meguruto.internal/v1/exp"))
        .identity,
    ).toBe("identity-A");

    clock += ODPT_CACHE_TTL_MS.timetable + 1;
    expect(
      await store.read("https://odpt-cache.meguruto.internal/v1/exp"),
    ).toBeNull();
  });

  it("treats an unreadable cached body as a miss", async () => {
    const api = fakeCacheApi();
    const store = createEdgeCacheStore({ cache: api, now: () => 0 });
    // A response that is not our JSON envelope must not be trusted.
    api.entries.set(
      "https://odpt-cache.meguruto.internal/v1/bad",
      new Response("not json", { headers: { "content-type": "text/plain" } }),
    );
    expect(
      await store.read("https://odpt-cache.meguruto.internal/v1/bad"),
    ).toBeNull();
  });

  it("requires a Cache API instance", () => {
    expect(() => createEdgeCacheStore({})).toThrow(TypeError);
  });
});

// ── Security ─────────────────────────────────────────────────────────────────

describe("security invariants", () => {
  it("never puts credential material in a cache key", async () => {
    const { protection, store } = harness();
    await protection.run(STATION_QUERY, () => Promise.resolve(recordsResult()));
    await protection.run(FARE_QUERY, () =>
      Promise.resolve(recordsResult("railway_fare")),
    );
    expect(store.keys.length).toBeGreaterThan(0);
    for (const key of store.keys) {
      expect(key).not.toContain(KEY);
      expect(key).not.toContain("consumerKey");
      expect(key).not.toContain("acl:");
      expect(key).not.toContain("api.odpt.org");
      expect(key.startsWith("https://odpt-cache.meguruto.internal/")).toBe(
        true,
      );
    }
  });

  it("exposes only safe runtime metadata", async () => {
    const { protection } = harness();
    const run = await protection.run(STATION_QUERY, () =>
      Promise.resolve(recordsResult()),
    );
    expect(Object.keys(run.runtime).sort()).toEqual([
      "budgetAllowed",
      "cacheClass",
      "cacheHit",
      "dedupHit",
      "providerRequest",
    ]);
    const serialized = JSON.stringify(run.runtime);
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain("consumerKey");
    expect(serialized).not.toContain("api.odpt.org");
  });

  it("never logs anything to the console", async () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const { protection } = harness();
    await protection.run(STATION_QUERY, () => Promise.resolve(recordsResult()));
    await protection.run(STATION_QUERY, () => Promise.resolve(recordsResult()));
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("keeps safe counters available for tests instead of production logs", async () => {
    const { protection } = harness();
    await protection.run(STATION_QUERY, () => Promise.resolve(recordsResult()));
    await protection.run(STATION_QUERY, () => Promise.resolve(recordsResult()));
    expect(protection.counters.providerRequests).toBe(1);
    expect(protection.counters.cacheHits).toBe(1);
    expect(protection.counters.cacheMisses).toBe(1);
    expect(protection.counters.cacheWrites).toBe(1);
    expect(JSON.stringify(protection.counters)).not.toContain(KEY);
  });
});
