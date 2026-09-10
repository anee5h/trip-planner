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
  extractProviderValidityEndMs,
  parseCalendarPeriodEnd,
  validateGregorianDate,
} from "./odpt-runtime-protection.js";
import {
  ODPT_CACHE_CONTRACT_VERSION,
  odptCacheKey,
  odptProviderScope,
} from "./odpt-request-identity.js";

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

/** Canonical budget_exhausted envelope, matching odpt-core's hook path. */
function budgetExhaustedNow() {
  return {
    ...recordsResult(),
    outcome: "error",
    errorCode: "budget_exhausted",
    records: [],
    recordCount: 0,
    sourceUrl: "",
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
const SCOPE_A = odptProviderScope("https://api.odpt.org/api/v4");
const SCOPE_B = odptProviderScope("https://odpt-mirror.example/api/v4");

/**
 * Faithful provider stub: mirrors odptLookup's attempt loop by asking for budget
 * permission IMMEDIATELY BEFORE each outbound attempt (the real hook contract),
 * and returns the canonical budget envelope when permission is denied.
 *
 * It deliberately does NOT add `providerAttempts` / `retryBlockedByBudget`: the
 * real `odptLookup` no longer exposes them, so the stub must not either — the
 * refusal PHASE is internal protection-layer diagnostics.
 *
 * `plan(attempt)` decides each attempt's outcome:
 *   "retry503" -> a retryable failure, loop continues (bounded)
 *   anything else -> the returned result
 */
function providerStub(plan, { maxAttempts = 2 } = {}) {
  const stub = {
    attempts: 0,
    fn: async ({ acquireAttempt }) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const permission = await acquireAttempt({ attempt });
        if (!permission || permission.allowed !== true) {
          const attemptsMade = attempt - 1;
          return {
            ...recordsResult(),
            outcome: "error",
            errorCode: permission?.errorCode ?? "budget_exhausted",
            records: [],
            recordCount: 0,
            sourceUrl: attemptsMade > 0 ? "https://api.odpt.org/api/v4/x" : "",
          };
        }
        stub.attempts += 1;
        const outcome = typeof plan === "function" ? plan(attempt) : plan;
        if (outcome === RETRY_503) continue;
        return outcome;
      }
      return {
        ...recordsResult(),
        outcome: "error",
        errorCode: "provider_unavailable",
        records: [],
        recordCount: 0,
      };
    },
  };
  return stub;
}

const RETRY_503 = Symbol("retry503");

/** Convenience: a stub that succeeds on the first attempt. */
function succeeds(result = recordsResult()) {
  return providerStub(result);
}

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
    const execute = async ({ acquireAttempt }) => {
      const permission = await acquireAttempt({ attempt: 1 });
      if (!permission.allowed) return budgetExhaustedNow();
      providerCalls += 1;
      return gate.promise;
    };

    const both = Promise.all([
      protection.run(STATION_QUERY, execute, { providerScope: SCOPE_A }),
      protection.run(STATION_QUERY, execute, { providerScope: SCOPE_A }),
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
    const execute = async ({ acquireAttempt }) => {
      const permission = await acquireAttempt({ attempt: 1 });
      if (!permission.allowed) return budgetExhaustedNow();
      providerCalls += 1;
      return gate.promise;
    };

    const all = Array.from({ length: 10 }, () =>
      protection.run(STATION_QUERY, execute, { providerScope: SCOPE_A }),
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
    const execute = async ({ acquireAttempt }) => {
      const permission = await acquireAttempt({ attempt: 1 });
      if (!permission.allowed) return budgetExhaustedNow();
      providerCalls += 1;
      return recordsResult();
    };

    await Promise.all([
      protection.run(STATION_QUERY, execute, { providerScope: SCOPE_A }),
      protection.run(FARE_QUERY, execute, { providerScope: SCOPE_A }),
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
    const leaderExecute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      return gate.promise;
    };
    const leader = protection.run(STATION_QUERY, leaderExecute, {
      providerScope: SCOPE_A,
    });
    const follower = protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    gate.reject(new Error("boom"));

    await expect(leader).rejects.toThrow("boom");
    await expect(follower).rejects.toThrow("boom");
    expect(protection.inFlightSize()).toBe(0);
  });
});

// ── Budget accounting vs dedup/cache ─────────────────────────────────────────

describe("provider budget accounting", () => {
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
    const first = await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    expect(first.runtime.budgetTokensUsed).toBe(1);
    const second = await protection.run(FARE_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    expect(second.result.errorCode).toBe("budget_exhausted");
  });

  it("first-attempt success -> 1 token, 1 actual attempt", async () => {
    const { protection, acquireSpy } = harness();
    const stub = succeeds();
    const run = await protection.run(STATION_QUERY, stub.fn, {
      providerScope: SCOPE_A,
    });
    expect(stub.attempts).toBe(1);
    expect(run.runtime.providerRequest).toBe(true);
    expect(run.runtime.providerAttempts).toBe(1);
    expect(run.runtime.budgetTokensUsed).toBe(1);
    expect(acquireSpy).toHaveBeenCalledTimes(1);
  });

  it("503 then success -> 2 tokens, 2 actual attempts", async () => {
    const { protection, acquireSpy } = harness();
    // Exactly the real retry shape: first attempt 503, the retry succeeds.
    const stub = providerStub((attempt) =>
      attempt === 1 ? RETRY_503 : recordsResult(),
    );
    const run = await protection.run(STATION_QUERY, stub.fn, {
      providerScope: SCOPE_A,
    });
    expect(stub.attempts).toBe(2);
    expect(run.result.outcome).toBe("records");
    expect(run.runtime.providerAttempts).toBe(2);
    expect(run.runtime.budgetTokensUsed).toBe(2);
    expect(acquireSpy).toHaveBeenCalledTimes(2);
    expect(run.runtime.budgetExhausted).toBe(false);
  });

  it("503 then 503 -> 2 tokens, 2 actual attempts, provider state preserved", async () => {
    const { protection, acquireSpy } = harness();
    const stub = providerStub(() => RETRY_503);
    const run = await protection.run(STATION_QUERY, stub.fn, {
      providerScope: SCOPE_A,
    });
    expect(stub.attempts).toBe(2);
    expect(run.runtime.providerAttempts).toBe(2);
    expect(run.runtime.budgetTokensUsed).toBe(2);
    expect(acquireSpy).toHaveBeenCalledTimes(2);
    // The retry was permitted, so the provider failure is what is reported.
    expect(run.result.errorCode).toBe("provider_unavailable");
    expect(run.runtime.budgetExhausted).toBe(false);
  });

  it("budget blocks the RETRY after a 503 -> 1 attempt, budget_exhausted", async () => {
    // Exactly one token left: the initial attempt spends it, the retry is refused.
    const { protection, acquireSpy } = harness({ limit: 1 });
    const stub = providerStub(() => RETRY_503);
    const run = await protection.run(STATION_QUERY, stub.fn, {
      providerScope: SCOPE_A,
    });
    expect(stub.attempts).toBe(1);
    expect(run.runtime.providerAttempts).toBe(1);
    expect(run.runtime.budgetTokensUsed).toBe(1);
    expect(acquireSpy).toHaveBeenCalledTimes(2); // 1 granted + 1 refused
    // Final state is budget_exhausted, and it reports that one attempt happened
    // rather than pretending a second provider response occurred.
    expect(run.result.outcome).toBe("error");
    expect(run.result.errorCode).toBe("budget_exhausted");
    // Public result: canonical semantics only, no attempt bookkeeping.
    expect(run.result).not.toHaveProperty("providerAttempts");
    expect(run.result).not.toHaveProperty("retryBlockedByBudget");
    // Truthfulness is preserved where it belongs: a retry refusal keeps the safe
    // sourceUrl of the attempt that really happened.
    expect(run.result.sourceUrl).toBe("https://api.odpt.org/api/v4/x");
    // Internally the phase is still distinguishable.
    expect(run.runtime.providerAttempts).toBe(1);
    expect(run.runtime.budgetRefusalPhase).toBe("retry");
    expect(run.runtime.budgetExhausted).toBe(true);
    // A blocked retry is never cached.
    expect(protection.counters.cacheWrites).toBe(0);
  });

  it("budget blocks the FIRST attempt -> 0 attempts, budget_exhausted", async () => {
    const { protection } = harness({ limit: 1 });
    await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    const stub = providerStub(recordsResult());
    // A semantically different request cannot be served from cache.
    const blocked = await protection.run(
      validatedOf({
        operation: "station",
        operator: "odpt.Operator:TokyoMetro",
      }),
      stub.fn,
      { providerScope: SCOPE_A },
    );
    expect(stub.attempts).toBe(0);
    expect(blocked.result.errorCode).toBe("budget_exhausted");
    expect(blocked.runtime.providerAttempts).toBe(0);
    expect(blocked.runtime.budgetRefusalPhase).toBe("first_attempt");
    expect(blocked.result).not.toHaveProperty("providerAttempts");
    expect(blocked.result).not.toHaveProperty("retryBlockedByBudget");
    expect(blocked.runtime.providerRequest).toBe(false);
    // Neither "no data" nor an empty success.
    expect(blocked.result.outcome).not.toBe("no_data");
  });

  it("counts a timeout/network attempt that actually invoked fetch", async () => {
    const { protection } = harness();
    // The attempt was issued (so it costs a token) and then failed.
    const stub = providerStub(errorResult("provider_timeout"));
    const run = await protection.run(STATION_QUERY, stub.fn, {
      providerScope: SCOPE_A,
    });
    expect(stub.attempts).toBe(1);
    expect(run.runtime.providerAttempts).toBe(1);
    expect(run.runtime.budgetTokensUsed).toBe(1);
    expect(run.result.errorCode).toBe("provider_timeout");
  });

  it("counts zero attempts when the request never reaches provider I/O", async () => {
    const { protection, acquireSpy } = harness();
    // A readiness/config failure returns before any attempt is issued.
    const stub = { attempts: 0, fn: async () => budgetExhaustedNow() };
    const run = await protection.run(STATION_QUERY, stub.fn, {
      providerScope: SCOPE_A,
    });
    expect(stub.attempts).toBe(0);
    expect(run.runtime.providerAttempts).toBe(0);
    expect(run.runtime.providerRequest).toBe(false);
    expect(acquireSpy).not.toHaveBeenCalled();
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
    const execute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      providerCalls += 1;
      return recordsResult();
    };

    const first = await protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_A,
    });
    const second = await protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_A,
    });

    expect(first.runtime.cacheHit).toBe(false);
    expect(second.runtime.cacheHit).toBe(true);
    expect(providerCalls).toBe(1);
    expect(acquireSpy).toHaveBeenCalledTimes(1);
  });

  it("refetches after the entry expires", async () => {
    const { protection, clock } = harness();
    let providerCalls = 0;
    const execute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      providerCalls += 1;
      return recordsResult();
    };

    await protection.run(STATION_QUERY, execute, { providerScope: SCOPE_A });
    clock.value += ODPT_CACHE_TTL_MS.reference - 1;
    const stillCached = await protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_A,
    });
    expect(stillCached.runtime.cacheHit).toBe(true);
    expect(providerCalls).toBe(1);

    clock.value += 1; // exactly at expiry
    const refetched = await protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_A,
    });
    expect(refetched.runtime.cacheHit).toBe(false);
    expect(providerCalls).toBe(2);
  });

  it("shares one cache entry between canonical equivalents", async () => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      providerCalls += 1;
      return recordsResult("railway_fare");
    };

    // Same semantics, different JSON property order.
    await protection.run(
      validatedOf({
        operation: "railway_fare",
        fromStation: "odpt.Station:Toei.Mita.Hakusan",
        toStation: "odpt.Station:Toei.Mita.Sugamo",
      }),
      execute,
      { providerScope: SCOPE_A },
    );
    const reordered = await protection.run(
      validatedOf({
        toStation: "odpt.Station:Toei.Mita.Sugamo",
        operation: "railway_fare",
        fromStation: "odpt.Station:Toei.Mita.Hakusan",
      }),
      execute,
      { providerScope: SCOPE_A },
    );
    expect(reordered.runtime.cacheHit).toBe(true);
    expect(providerCalls).toBe(1);
  });

  it("does not collide semantically different requests", async () => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      providerCalls += 1;
      return recordsResult("station_timetable");
    };

    await protection.run(
      validatedOf({
        operation: "station_timetable",
        station: "odpt.Station:Toei.Mita.Hakusan",
      }),
      execute,
      { providerScope: SCOPE_A },
    );
    const other = await protection.run(
      validatedOf({
        operation: "station_timetable",
        station: "odpt.Station:Toei.Asakusa.HonjoAzumabashi",
      }),
      execute,
      { providerScope: SCOPE_A },
    );
    expect(other.runtime.cacheHit).toBe(false);
    expect(providerCalls).toBe(2);
  });

  it("caches a successful empty array as a successful empty result", async () => {
    const { protection } = harness();
    await protection.run(STATION_QUERY, succeeds(emptyResult()).fn, {
      providerScope: SCOPE_A,
    });
    const cached = await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    expect(cached.runtime.cacheHit).toBe(true);
    expect(cached.result.outcome).toBe("records");
    expect(cached.result.records).toEqual([]);
    expect(cached.result.recordCount).toBe(0);
  });

  it("keeps cached records as records with unchanged provenance", async () => {
    const { protection } = harness();
    const original = recordsResult("station", [{ id: "x", title: "三田" }]);
    await protection.run(STATION_QUERY, succeeds(original).fn, {
      providerScope: SCOPE_A,
    });
    const cached = await protection.run(
      STATION_QUERY,
      succeeds(errorResult("provider_internal_error")).fn,
      { providerScope: SCOPE_A },
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
      providerScope: SCOPE_A,
    });
    const lookup = await cache.lookup({
      identity: "identity-B",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      providerScope: SCOPE_A,
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
    const run = await protection.run(
      STATION_QUERY,
      async ({ acquireAttempt }) => {
        await acquireAttempt({ attempt: 1 });
        providerCalls += 1;
        return recordsResult();
      },
      { providerScope: SCOPE_A },
    );
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
    const execute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      providerCalls += 1;
      return recordsResult("station_timetable");
    };

    await protection.run(timetable, execute, { providerScope: SCOPE_A });
    clock.value += ODPT_CACHE_TTL_MS.timetable + 1;
    const afterTimetableTtl = await protection.run(timetable, execute, {
      providerScope: SCOPE_A,
    });
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
    const execute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      providerCalls += 1;
      return errorResult(errorCode);
    };

    const first = await protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_A,
    });
    const second = await protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_A,
    });

    expect(first.result.outcome).toBe("error");
    expect(first.result.errorCode).toBe(errorCode);
    expect(second.runtime.cacheHit).toBe(false);
    expect(providerCalls).toBe(2);
  });

  it("keeps 404 as no_data and never rewrites it to an empty success", async () => {
    const { protection } = harness();
    let providerCalls = 0;
    const execute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      providerCalls += 1;
      return noDataResult();
    };

    await protection.run(STATION_QUERY, execute, { providerScope: SCOPE_A });
    const cached = await protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_A,
    });

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

    const second = await protection.run(wide, execute, {
      providerScope: SCOPE_A,
    });
    expect(second.runtime.cacheHit).toBe(false);
    expect(second.result.errorCode).toBe("provider_response_too_large");
  });

  it("keeps 402 billing_required distinct from no_data", async () => {
    const { protection } = harness();
    const first = await protection.run(
      STATION_QUERY,
      succeeds(errorResult("billing_required")).fn,
      { providerScope: SCOPE_A },
    );
    expect(first.result.errorCode).toBe("billing_required");
    expect(first.result.outcome).not.toBe("no_data");
    const second = await protection.run(
      STATION_QUERY,
      succeeds(errorResult("billing_required")).fn,
      { providerScope: SCOPE_A },
    );
    expect(second.runtime.cacheHit).toBe(false);
  });

  it("does not let a failed request break a subsequent valid one", async () => {
    const { protection } = harness();
    const failed = await protection.run(
      STATION_QUERY,
      succeeds(errorResult("provider_internal_error")).fn,
      { providerScope: SCOPE_A },
    );
    expect(failed.result.outcome).toBe("error");

    const ok = await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
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
    await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    await protection.run(
      FARE_QUERY,
      succeeds(recordsResult("railway_fare")).fn,
      {
        providerScope: SCOPE_A,
      },
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
    const run = await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    expect(Object.keys(run.runtime).sort()).toEqual([
      "budgetExhausted",
      "budgetRefusalPhase",
      "budgetTokensUsed",
      "budgetUnavailable",
      "cacheClass",
      "cacheHit",
      "dedupHit",
      "providerAttempts",
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
    await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("keeps safe counters available for tests instead of production logs", async () => {
    const { protection } = harness();
    await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    await protection.run(STATION_QUERY, succeeds().fn, {
      providerScope: SCOPE_A,
    });
    expect(protection.counters.providerRequests).toBe(1);
    expect(protection.counters.cacheHits).toBe(1);
    expect(protection.counters.cacheMisses).toBe(1);
    expect(protection.counters.cacheWrites).toBe(1);
    expect(JSON.stringify(protection.counters)).not.toContain(KEY);
  });
});

// ── Validity-aware effective TTL ─────────────────────────────────────────────

describe("provider-declared validity extraction", () => {
  const at = (iso) => Date.parse(iso);

  it("reads validUntil from a record", () => {
    const result = extractProviderValidityEndMs(
      recordsResult("station", [{ validUntil: "2026-09-10T05:00:00Z" }]),
    );
    expect(result.earliestMs).toBe(at("2026-09-10T05:00:00Z"));
    expect(result.considered).toBe(1);
  });

  it("falls back to provenance.validUntil when the top level is absent", () => {
    const result = extractProviderValidityEndMs(
      recordsResult("station", [
        { provenance: { validUntil: "2026-09-10T06:00:00Z" } },
      ]),
    );
    expect(result.earliestMs).toBe(at("2026-09-10T06:00:00Z"));
  });

  it("reads a Calendar's ISO8601 duration end", () => {
    const result = extractProviderValidityEndMs(
      recordsResult("calendar", [
        { duration: "2026-01-01T00:00:00+09:00/2026-09-30T23:59:59+09:00" },
      ]),
    );
    expect(result.earliestMs).toBe(at("2026-09-30T23:59:59+09:00"));
  });

  it("takes the EARLIEST expiry across records", () => {
    const result = extractProviderValidityEndMs(
      recordsResult("railway_fare", [
        { validUntil: "2026-09-10T04:00:00Z" },
        { validUntil: "2026-09-10T02:00:00Z" },
      ]),
    );
    expect(result.earliestMs).toBe(at("2026-09-10T02:00:00Z"));
  });

  it("ignores malformed validity instead of fabricating an expiry", () => {
    const result = extractProviderValidityEndMs(
      recordsResult("station", [{ validUntil: "not-a-date" }]),
    );
    expect(result.earliestMs).toBeNull();
    expect(result.unparseable).toBe(1);
  });

  it("does NOT infer validity from dc:date", () => {
    // `date` records generation time, not validity: it must be ignored.
    const result = extractProviderValidityEndMs(
      recordsResult("station", [{ date: "2020-01-01T00:00:00Z" }]),
    );
    expect(result.earliestMs).toBeNull();
  });

  it("reports no validity for a successful empty array", () => {
    const result = extractProviderValidityEndMs(emptyResult());
    expect(result.earliestMs).toBeNull();
    expect(result.recordCount).toBe(0);
  });
});

describe("validity-aware effective TTL", () => {
  const NOW = 1_700_000_000_000;
  const iso = (ms) => new Date(ms).toISOString();

  async function storeTimetable(validUntilMs, { cacheClass } = {}) {
    const clock = { value: NOW };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const result = recordsResult("station_timetable", [
      validUntilMs === null ? {} : { validUntil: iso(validUntilMs) },
    ]);
    const outcome = await cache.store({
      identity: `identity-${validUntilMs}`,
      cacheClass: cacheClass ?? ODPT_CACHE_CLASS.TIMETABLE,
      value: result,
      providerScope: SCOPE_A,
    });
    return { outcome, cache, clock };
  }

  it("timetable policy 5m, validUntil +2m -> expires at +2m", async () => {
    const { outcome } = await storeTimetable(NOW + 2 * MINUTE);
    expect(outcome.stored).toBe(true);
    expect(outcome.validityCapped).toBe(true);
    expect(outcome.expiresAt).toBe(NOW + 2 * MINUTE);
    expect(outcome.policyTtlMs).toBe(ODPT_CACHE_TTL_MS.timetable);
  });

  it("timetable validUntil +20m -> expires at the 5m policy maximum", async () => {
    const { outcome } = await storeTimetable(NOW + 20 * MINUTE);
    expect(outcome.stored).toBe(true);
    // Provider validity may never EXTEND beyond the policy TTL.
    expect(outcome.validityCapped).toBe(false);
    expect(outcome.expiresAt).toBe(NOW + ODPT_CACHE_TTL_MS.timetable);
  });

  it("already-expired timetable is NOT positive-cached", async () => {
    const { outcome } = await storeTimetable(NOW - MINUTE);
    expect(outcome.stored).toBe(false);
    expect(outcome.reason).toBe("provider_validity_expired");
  });

  it("two records expiring +4m/+2m -> effective expiry is +2m", async () => {
    const clock = { value: NOW };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const outcome = await cache.store({
      identity: "two-records",
      cacheClass: ODPT_CACHE_CLASS.TIMETABLE,
      value: recordsResult("station_timetable", [
        { validUntil: iso(NOW + 4 * MINUTE) },
        { validUntil: iso(NOW + 2 * MINUTE) },
      ]),
      providerScope: SCOPE_A,
    });
    expect(outcome.expiresAt).toBe(NOW + 2 * MINUTE);
  });

  it("missing validity -> normal policy TTL", async () => {
    const { outcome } = await storeTimetable(null);
    expect(outcome.stored).toBe(true);
    expect(outcome.validityCapped).toBe(false);
    expect(outcome.expiresAt).toBe(NOW + ODPT_CACHE_TTL_MS.timetable);
  });

  it("malformed optional validity -> conservative policy TTL", async () => {
    const clock = { value: NOW };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const outcome = await cache.store({
      identity: "malformed",
      cacheClass: ODPT_CACHE_CLASS.TIMETABLE,
      value: recordsResult("station_timetable", [{ validUntil: "???" }]),
      providerScope: SCOPE_A,
    });
    // Falls back rather than inventing an expiry, and does not fail the record.
    expect(outcome.stored).toBe(true);
    expect(outcome.validityCapped).toBe(false);
    expect(outcome.expiresAt).toBe(NOW + ODPT_CACHE_TTL_MS.timetable);
  });

  it("fare validity caps the 1h fare policy", async () => {
    const clock = { value: NOW };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const outcome = await cache.store({
      identity: "fare",
      cacheClass: ODPT_CACHE_CLASS.FARE,
      value: recordsResult("railway_fare", [
        { validUntil: iso(NOW + 5 * MINUTE) },
      ]),
      providerScope: SCOPE_A,
    });
    expect(outcome.expiresAt).toBe(NOW + 5 * MINUTE);
    expect(outcome.policyTtlMs).toBe(ODPT_CACHE_TTL_MS.fare);
  });

  it("reference validity caps the 6h reference policy", async () => {
    const clock = { value: NOW };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const outcome = await cache.store({
      identity: "ref",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      value: recordsResult("station", [{ validUntil: iso(NOW + 30 * MINUTE) }]),
      providerScope: SCOPE_A,
    });
    expect(outcome.expiresAt).toBe(NOW + 30 * MINUTE);
    expect(outcome.policyTtlMs).toBe(ODPT_CACHE_TTL_MS.reference);
  });

  it("calendar duration end caps the 1h calendar policy", async () => {
    const clock = { value: NOW };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const outcome = await cache.store({
      identity: "cal",
      cacheClass: ODPT_CACHE_CLASS.CALENDAR,
      value: recordsResult("calendar", [
        { duration: `${iso(NOW - HOUR)}/${iso(NOW + 10 * MINUTE)}` },
      ]),
      providerScope: SCOPE_A,
    });
    expect(outcome.expiresAt).toBe(NOW + 10 * MINUTE);
    expect(outcome.policyTtlMs).toBe(ODPT_CACHE_TTL_MS.calendar);
  });

  it("[] uses the normal class TTL (no record validity exists)", async () => {
    const clock = { value: NOW };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const outcome = await cache.store({
      identity: "empty",
      cacheClass: ODPT_CACHE_CLASS.TIMETABLE,
      value: emptyResult("station_timetable"),
      providerScope: SCOPE_A,
    });
    expect(outcome.stored).toBe(true);
    expect(outcome.expiresAt).toBe(NOW + ODPT_CACHE_TTL_MS.timetable);
  });

  it("404 keeps the independent 1m negative policy", async () => {
    const clock = { value: NOW };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const outcome = await cache.store({
      identity: "404",
      cacheClass: ODPT_CACHE_CLASS.NEGATIVE,
      value: noDataResult(),
      providerScope: SCOPE_A,
    });
    expect(outcome.stored).toBe(true);
    expect(outcome.expiresAt).toBe(NOW + ODPT_NEGATIVE_CACHE_TTL_MS);
    expect(ODPT_NEGATIVE_CACHE_TTL_MS).toBe(1 * MINUTE);
  });

  it("an expired-validity result is not served later from cache", async () => {
    const { cache, clock } = await storeTimetable(NOW + 2 * MINUTE);
    const identity = `identity-${NOW + 2 * MINUTE}`;
    clock.value = NOW + 2 * MINUTE + 1;
    const lookup = await cache.lookup({
      identity,
      cacheClass: ODPT_CACHE_CLASS.TIMETABLE,
      providerScope: SCOPE_A,
    });
    expect(lookup.hit).toBe(false);
  });
});

// ── Provider scope isolation ─────────────────────────────────────────────────

describe("provider scope isolation", () => {
  it("never serves a cached entry created under another provider scope", async () => {
    const clock = { value: 1_700_000_000_000 };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });

    await cache.store({
      identity: "same-request",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      value: recordsResult(),
      providerScope: SCOPE_A,
    });

    // Same request identity, DIFFERENT configured provider endpoint.
    const crossScope = await cache.lookup({
      identity: "same-request",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      providerScope: SCOPE_B,
    });
    expect(crossScope.hit).toBe(false);

    // The original scope still hits.
    const sameScope = await cache.lookup({
      identity: "same-request",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      providerScope: SCOPE_A,
    });
    expect(sameScope.hit).toBe(true);
  });

  it("keys empty and unspecified scopes to the same explicit token", async () => {
    const clock = { value: 1_700_000_000_000 };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    await cache.store({
      identity: "x",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      value: recordsResult(),
      providerScope: SCOPE_A,
    });
    // A missing scope must not accidentally alias a real provider scope.
    const unscoped = await cache.lookup({
      identity: "x",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
    });
    expect(unscoped.hit).toBe(false);
  });

  it("does not collide dedup across provider scopes", async () => {
    const { protection } = harness();
    const gate = deferred();
    let attempts = 0;
    const execute = async ({ acquireAttempt }) => {
      await acquireAttempt({ attempt: 1 });
      attempts += 1;
      return gate.promise;
    };

    const a = protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_A,
    });
    const b = protection.run(STATION_QUERY, execute, {
      providerScope: SCOPE_B,
    });
    gate.resolve(recordsResult());
    await Promise.all([a, b]);
    // Different scopes are different fetches, not one coalesced fetch.
    expect(attempts).toBe(2);
  });

  it("a cached entry from the current contract version is served; a stale one is not", async () => {
    const clock = { value: 1_700_000_000_000 };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    await cache.store({
      identity: "y",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      value: recordsResult(),
      providerScope: SCOPE_A,
    });
    const key = odptCacheKey({ providerScope: SCOPE_A, identity: "y" });
    const entry = await store.read(key);
    expect(entry.contractVersion).toBe(ODPT_CACHE_CONTRACT_VERSION);

    // Simulate a payload-contract bump by writing an old-version entry.
    await store.write(key, {
      ...entry,
      contractVersion: "odpt-cache-contract-v0",
    });
    const lookup = await cache.lookup({
      identity: "y",
      cacheClass: ODPT_CACHE_CLASS.REFERENCE,
      providerScope: SCOPE_A,
    });
    expect(lookup.hit).toBe(false);
    expect(lookup.reason).toBe("cache_context_mismatch");
  });
});

// ── Async / failing budget backends ──────────────────────────────────────────

/**
 * Builds a protection layer whose provider is `providerStub`, so budget
 * behaviour is observable through the same seam production uses.
 */
function budgetHarness(budget) {
  // Accept either a budget object or a bare acquire function.
  const resolved = typeof budget === "function" ? { acquire: budget } : budget;
  const store = createMemoryCacheStore();
  const protection = createOdptRuntimeProtection({
    cache: createOdptResultCache({ store }),
    budget: resolved,
  });
  return {
    protection,
    store,
    run: (execute, scope = SCOPE_A) =>
      protection.run(STATION_QUERY, execute, { providerScope: scope }),
    counters: protection.counters,
  };
}

describe("budget acquisition seam", () => {
  it("accepts a SYNCHRONOUS budget (the current in-memory implementation)", async () => {
    const stub = providerStub(recordsResult());
    const { run, counters } = budgetHarness(
      createOdptRequestBudget({ limit: 5 }),
    );
    const { result, runtime } = await run(stub.fn);
    expect(result.outcome).toBe("records");
    expect(stub.attempts).toBe(1);
    expect(runtime.budgetTokensUsed).toBe(1);
    expect(counters.budgetAllowed).toBe(1);
  });

  it("awaits an ASYNC budget that resolves allowed", async () => {
    const stub = providerStub(recordsResult());
    let acquisitions = 0;
    const { run, counters } = budgetHarness({
      acquire: async () => {
        acquisitions += 1;
        return { allowed: true };
      },
    });
    const { result, runtime } = await run(stub.fn);
    expect(result.outcome).toBe("records");
    expect(stub.attempts).toBe(1);
    expect(acquisitions).toBe(1);
    expect(runtime.budgetTokensUsed).toBe(1);
    expect(counters.budgetAllowed).toBe(1);
  });

  it("awaits an ASYNC budget that resolves exhausted -> budget_exhausted, 0 fetches", async () => {
    const stub = providerStub(recordsResult());
    const { run, counters } = budgetHarness({
      acquire: async () => ({ allowed: false, retryAfterMs: 5000 }),
    });
    const { result, runtime } = await run(stub.fn);
    expect(stub.attempts).toBe(0);
    expect(result.outcome).toBe("error");
    expect(result.errorCode).toBe("budget_exhausted");
    expect(result.records).toEqual([]);
    expect(result.recordCount).toBe(0);
    expect(runtime.providerAttempts).toBe(0);
    expect(runtime.providerRequest).toBe(false);
    expect(runtime.budgetUnavailable).toBe(false);
    expect(counters.budgetRejected).toBe(1);
    expect(counters.providerRequests).toBe(0);
  });

  it("maps an ASYNC budget that REJECTS before the first attempt to budget_unavailable, 0 fetches", async () => {
    const stub = providerStub(recordsResult());
    const { run, counters } = budgetHarness({
      acquire: async () => {
        throw new Error("durable object unavailable");
      },
    });
    const { result, runtime } = await run(stub.fn);
    // The provider was never contacted.
    expect(stub.attempts).toBe(0);
    expect(result.outcome).toBe("error");
    expect(result.errorCode).toBe("budget_unavailable");
    expect(result.records).toEqual([]);
    expect(result.recordCount).toBe(0);
    expect(runtime.providerAttempts).toBe(0);
    expect(runtime.providerRequest).toBe(false);
    expect(runtime.budgetTokensUsed).toBe(0);
    expect(runtime.budgetUnavailable).toBe(true);
    expect(runtime.budgetExhausted).toBe(false);
    expect(counters.budgetUnavailable).toBe(1);
    expect(counters.providerRequests).toBe(0);
  });

  it("never reports budget_unavailable as provider unavailability or provider no-data", async () => {
    const stub = providerStub(recordsResult());
    const { run } = budgetHarness({
      acquire: async () => {
        throw new Error("down");
      },
    });
    const { result } = await run(stub.fn);
    expect(result.errorCode).not.toBe("no_data");
    expect(result.errorCode).not.toBe("provider_not_configured");
    expect(result.errorCode).not.toBe("provider_unavailable");
    // Distinct from ordinary exhaustion too.
    expect(result.errorCode).not.toBe("budget_exhausted");
    expect(result.outcome).not.toBe("empty");
    expect(result.outcome).not.toBe("records");
  });

  it("maps a SYNCHRONOUS budget that THROWS to budget_unavailable, not exhaustion", async () => {
    const stub = providerStub(recordsResult());
    const { run } = budgetHarness({
      acquire: () => {
        throw new Error("boom");
      },
    });
    const { result } = await run(stub.fn);
    expect(stub.attempts).toBe(0);
    expect(result.errorCode).toBe("budget_unavailable");
    expect(result.errorCode).not.toBe("budget_exhausted");
  });

  it("does NOT leak a rejected budget as an exception out of the lookup", async () => {
    const stub = providerStub(recordsResult());
    const { run } = budgetHarness({
      acquire: async () => {
        throw new TypeError("backend exploded");
      },
    });
    // Must resolve, never reject: honours odptLookup's "never throws" contract.
    await expect(run(stub.fn)).resolves.toBeDefined();
  });

  it("preserves the truthful attempt count when the budget fails before a 503 RETRY", async () => {
    const stub = providerStub(RETRY_503);
    let acquisitions = 0;
    const { run, counters } = budgetHarness({
      acquire: async () => {
        acquisitions += 1;
        if (acquisitions === 1) return { allowed: true };
        throw new Error("do unavailable mid-flight");
      },
    });
    const { result, runtime } = await run(stub.fn);
    // Exactly ONE real provider attempt happened: the original 503.
    expect(stub.attempts).toBe(1);
    expect(counters.providerRequests).toBe(1);
    expect(result.outcome).toBe("error");
    expect(result.errorCode).toBe("budget_unavailable");
    // Public result exposes no attempt bookkeeping; the phase is internal.
    expect(result).not.toHaveProperty("providerAttempts");
    expect(result).not.toHaveProperty("retryBlockedByBudget");
    expect(runtime.budgetRefusalPhase).toBe("retry");
    // Provenance stays truthful for the attempt that WAS made.
    expect(result.sourceUrl).toContain("https://");
    expect(runtime.budgetUnavailable).toBe(true);
    expect(runtime.budgetExhausted).toBe(false);
    expect(runtime.budgetTokensUsed).toBe(1);
  });

  it("does not cache budget_unavailable", async () => {
    const stub = providerStub(recordsResult());
    let acquisitions = 0;
    const { run, store } = budgetHarness({
      acquire: async () => {
        acquisitions += 1;
        throw new Error("still down");
      },
    });
    await run(stub.fn);
    expect(store.size()).toBe(0);
    await run(stub.fn);
    // A cached failure would have avoided the second acquisition entirely.
    expect(acquisitions).toBe(2);
  });

  it("does not cache budget_exhausted either", async () => {
    const stub = providerStub(recordsResult());
    const { run, store } = budgetHarness({
      acquire: () => ({ allowed: false }),
    });
    await run(stub.fn);
    expect(store.size()).toBe(0);
  });

  it("dedup followers consume NO extra budget acquisition", async () => {
    let acquisitions = 0;
    const gate = deferred();
    const { run } = budgetHarness({
      acquire: async () => {
        acquisitions += 1;
        return { allowed: true };
      },
    });
    const leader = () =>
      run(async ({ acquireAttempt, attempt }) => {
        const permission = await acquireAttempt({ attempt });
        if (!permission || permission.allowed !== true) {
          return {
            ...recordsResult(),
            outcome: "error",
            errorCode: permission?.errorCode ?? "budget_exhausted",
            records: [],
            recordCount: 0,
          };
        }
        return gate.promise;
      });
    const a = leader();
    const b = leader();
    const c = leader();
    gate.resolve(recordsResult());
    const results = await Promise.all([a, b, c]);
    expect(acquisitions).toBe(1);
    expect(results.filter((r) => r.runtime.dedupHit)).toHaveLength(2);
    expect(results[0].runtime.budgetTokensUsed).toBe(1);
    for (const follower of results.filter((r) => r.runtime.dedupHit)) {
      expect(follower.runtime.budgetTokensUsed).toBe(0);
      expect(follower.runtime.providerAttempts).toBe(0);
    }
  });
});

// ── Calendar odpt:duration period parsing ────────────────────────────────────

describe("parseCalendarPeriodEnd", () => {
  it("applies the Asia/Tokyo start-of-day ceiling to the spec's DATE-ONLY example", () => {
    // ODPT v4.16 documents exactly this shape for odpt:duration.
    const parsed = parseCalendarPeriodEnd("2017-11-13/2017-11-18");
    expect(parsed.status).toBe("date_only_start_of_day_jst");
    // 2017-11-18T00:00:00+09:00 — NOT UTC midnight.
    expect(parsed.endMs).toBe(Date.UTC(2017, 10, 17, 15, 0, 0));
    expect(new Date(parsed.endMs).toISOString()).toBe(
      "2017-11-17T15:00:00.000Z",
    );
    // The instant is explicitly Meguruto policy, not a provider claim.
    expect(parsed.policy).toBe("meguruto_start_of_date_asia_tokyo");
  });

  it("does NOT apply UTC-midnight semantics to a date-only endpoint", () => {
    const parsed = parseCalendarPeriodEnd("2017-11-13/2017-11-18");
    // JST start-of-day is NINE HOURS EARLIER than UTC midnight of the same
    // date: the conservative direction, and not a UTC assumption.
    expect(parsed.endMs).not.toBe(Date.parse("2017-11-18"));
    expect(parsed.endMs - Date.parse("2017-11-18")).toBe(-9 * 60 * 60 * 1000);
  });

  it("parses an explicit offset datetime endpoint as that instant", () => {
    const parsed = parseCalendarPeriodEnd(
      "2017-11-13T00:00:00+09:00/2017-11-18T23:59:59+09:00",
    );
    expect(parsed.status).toBe("datetime");
    expect(parsed.endMs).toBe(Date.parse("2017-11-18T23:59:59+09:00"));
  });

  it("parses a Z datetime endpoint as that instant", () => {
    const parsed = parseCalendarPeriodEnd(
      "2017-11-13T00:00:00Z/2017-11-18T15:00:00Z",
    );
    expect(parsed.status).toBe("datetime");
    expect(parsed.endMs).toBe(Date.UTC(2017, 10, 18, 15, 0, 0));
  });

  it("accepts a compact offset and uses the stated instant", () => {
    const parsed = parseCalendarPeriodEnd(
      "2017-11-13/2017-11-18T12:00:00+0900",
    );
    expect(parsed.status).toBe("datetime");
    expect(parsed.endMs).toBe(Date.parse("2017-11-18T12:00:00+09:00"));
  });

  it("rejects a timezone-LESS datetime rather than guessing an instant", () => {
    const parsed = parseCalendarPeriodEnd(
      "2017-11-13T00:00:00/2017-11-18T00:00:00",
    );
    expect(parsed.status).toBe("unsupported");
    expect(parsed.reason).toBe("datetime_without_timezone");
    expect(parsed.endMs).toBeUndefined();
  });

  it("rejects MALFORMED intervals without inventing an instant", () => {
    for (const value of [
      "2017-11-13/not-a-date",
      "2017-11-18",
      "2017-11-13/2017-13-45",
      "/2017-11-18",
      "2017-11-13/2017-11-18/2017-11-19",
    ]) {
      const parsed = parseCalendarPeriodEnd(value);
      expect(parsed.status).toBe("unsupported");
      expect(parsed.endMs).toBeUndefined();
    }
  });

  it("treats a missing end as unsupported", () => {
    const parsed = parseCalendarPeriodEnd("2017-11-13/");
    expect(parsed.status).toBe("unsupported");
    expect(parsed.reason).toBe("missing_end");
  });

  it("rejects non-string input", () => {
    expect(parseCalendarPeriodEnd(null).status).toBe("unsupported");
    expect(parseCalendarPeriodEnd(undefined).status).toBe("unsupported");
    expect(parseCalendarPeriodEnd(20171118).status).toBe("unsupported");
  });

  it("places the date-only boundary correctly around JST midnight", () => {
    const boundary = parseCalendarPeriodEnd("2017-11-13/2017-11-18").endMs;
    // One millisecond earlier is still 2017-11-17 in JST.
    expect(new Date(boundary - 1).toISOString()).toBe(
      "2017-11-17T14:59:59.999Z",
    );
    // The JST hour at the boundary is exactly midnight.
    expect(new Date(boundary + 9 * 60 * 60 * 1000).getUTCHours()).toBe(0);
    // And the boundary is itself in JST on the 18th.
    expect(new Date(boundary + 9 * 60 * 60 * 1000).getUTCDate()).toBe(18);
  });
});

describe("validity from a Calendar duration period", () => {
  it("uses the date-only ceiling for the spec-shaped value", () => {
    const validity = extractProviderValidityEndMs({
      records: [{ duration: "2017-11-13/2017-11-18" }],
    });
    expect(validity.earliestMs).toBe(Date.UTC(2017, 10, 17, 15, 0, 0));
    expect(validity.notes).toContain(
      "duration_date_only_ceiling_meguruto_asia_tokyo",
    );
  });

  it("ignores an unsupported duration instead of fabricating an expiry", () => {
    const validity = extractProviderValidityEndMs({
      records: [{ duration: "2017-11-13T00:00:00/2017-11-18T00:00:00" }],
    });
    expect(validity.earliestMs).toBeNull();
    expect(validity.unparseable).toBe(1);
    expect(validity.notes.join(",")).toContain("datetime_without_timezone");
  });

  it("provider validity can SHORTEN the TTL but never EXTEND the policy cap", async () => {
    const clock = { value: 1_700_000_000_000 };
    const store = createMemoryCacheStore({ now: () => clock.value });
    const cache = createOdptResultCache({ store, now: () => clock.value });
    const args = {
      identity: "duration-validity",
      cacheClass: ODPT_CACHE_CLASS.TIMETABLE,
      providerScope: SCOPE_A,
    };
    // Validity is read from the normalized RECORD (dct:valid), not a parameter.
    const withValidUntil = (iso) => ({
      ...recordsResult(),
      records: [{ ...recordsResult().records[0], validUntil: iso }],
    });

    // Shortens: 5m policy TTL, but the provider declares validity ending in 2m.
    await cache.store({
      ...args,
      value: withValidUntil(new Date(clock.value + 2 * MINUTE).toISOString()),
    });
    const shortened = await cache.lookup(args);
    expect(shortened.hit).toBe(true);
    expect(shortened.expiresAt).toBe(clock.value + 2 * MINUTE);

    // Cannot extend: validity ending in 20m stays capped at the 5m policy.
    await cache.store({
      ...args,
      value: withValidUntil(new Date(clock.value + 20 * MINUTE).toISOString()),
    });
    const capped = await cache.lookup(args);
    expect(capped.hit).toBe(true);
    expect(capped.expiresAt).toBe(clock.value + 5 * MINUTE);
  });
});

// ── Malformed budget decisions are NOT exhaustion (three-way semantics) ───────

describe("budget decision is strictly three-way", () => {
  const MALFORMED = [
    ["undefined", undefined],
    ["null", null],
    ["{}", {}],
    ["{ remaining: 10 }", { remaining: 10 }],
    ['{ allowed: "false" }', { allowed: "false" }],
    ["{ allowed: 0 }", { allowed: 0 }],
    ["{ allowed: null }", { allowed: null }],
    ["{ allowed: 1 }", { allowed: 1 }],
  ];

  it.each(MALFORMED)(
    "treats %s as budget_unavailable, not exhaustion",
    async (_label, decision) => {
      const stub = providerStub(recordsResult());
      const { run, counters } = budgetHarness(async () => decision);
      const { result, runtime } = await run(stub.fn);

      // No provider request for the blocked attempt.
      expect(stub.attempts).toBe(0);
      expect(runtime.providerRequest).toBe(false);
      expect(counters.providerRequests).toBe(0);
      // Canonical error state, honestly labelled.
      expect(result.outcome).toBe("error");
      expect(result.errorCode).toBe("budget_unavailable");
      expect(result.errorCode).not.toBe("budget_exhausted");
      // Never no_data, never a successful [].
      expect(result.errorCode).not.toBe("no_data");
      expect(result.outcome).not.toBe("empty");
      expect(result.records).toEqual([]);
      // No exception escaped, and the internal counters agree.
      expect(runtime.budgetUnavailable).toBe(true);
      expect(runtime.budgetExhausted).toBe(false);
      expect(counters.budgetMalformed).toBe(1);
      expect(counters.budgetRejected).toBe(0);
      // First-attempt refusal: nothing was fetched, so provenance is empty.
      expect(result.sourceUrl).toBe("");
      expect(runtime.budgetRefusalPhase).toBe("first_attempt");
    },
  );

  it("A. malformed FIRST decision -> budget_unavailable with ZERO provider attempts", async () => {
    const stub = providerStub(recordsResult());
    const { run, counters } = budgetHarness(async () => ({ remaining: 10 }));
    const { result, runtime } = await run(stub.fn);
    expect(stub.attempts).toBe(0);
    expect(result.errorCode).toBe("budget_unavailable");
    expect(runtime.providerAttempts).toBe(0);
    expect(runtime.providerRequest).toBe(false);
    expect(result.sourceUrl).toBe("");
    expect(counters.providerRequests).toBe(0);
  });

  it("B. 503 then a malformed decision before the retry -> budget_unavailable, exactly ONE real attempt, safe sourceUrl, no second fetch", async () => {
    let decisions = 0;
    const stub = providerStub(RETRY_503);
    const { run, counters } = budgetHarness(async () => {
      decisions += 1;
      // First decision is a valid grant; the retry decision is malformed.
      return decisions === 1 ? { allowed: true } : { allowed: "maybe" };
    });
    const { result, runtime } = await run(stub.fn);

    // Exactly ONE real provider attempt happened (the original 503).
    expect(stub.attempts).toBe(1);
    expect(counters.providerRequests).toBe(1);
    expect(runtime.providerAttempts).toBe(1);
    expect(decisions).toBe(2); // the retry DID ask for permission
    // No second provider fetch was issued.
    expect(counters.providerRequests).toBe(1);
    // Honest canonical state.
    expect(result.outcome).toBe("error");
    expect(result.errorCode).toBe("budget_unavailable");
    // Truthful provenance for the attempt that really occurred.
    expect(result.sourceUrl).toBe("https://api.odpt.org/api/v4/x");
    // Phase is internal-only.
    expect(runtime.budgetRefusalPhase).toBe("retry");
    expect(result).not.toHaveProperty("providerAttempts");
    expect(result).not.toHaveProperty("retryBlockedByBudget");
    expect(runtime.budgetUnavailable).toBe(true);
    expect(runtime.budgetExhausted).toBe(false);
    expect(counters.budgetMalformed).toBe(1);
  });

  it("C. explicit { allowed: false } -> budget_exhausted", async () => {
    const stub = providerStub(recordsResult());
    const { run, counters } = budgetHarness(async () => ({ allowed: false }));
    const { result, runtime } = await run(stub.fn);
    expect(stub.attempts).toBe(0);
    expect(result.errorCode).toBe("budget_exhausted");
    expect(result.errorCode).not.toBe("budget_unavailable");
    expect(runtime.budgetExhausted).toBe(true);
    expect(runtime.budgetUnavailable).toBe(false);
    expect(counters.budgetRejected).toBe(1);
    expect(counters.budgetMalformed).toBe(0);
  });

  it("D. explicit { allowed: true } -> the provider fetch proceeds", async () => {
    const stub = providerStub(recordsResult());
    const { run, counters } = budgetHarness(async () => ({ allowed: true }));
    const { result, runtime } = await run(stub.fn);
    expect(stub.attempts).toBe(1);
    expect(result.outcome).toBe("records");
    expect(runtime.budgetTokensUsed).toBe(1);
    expect(counters.budgetAllowed).toBe(1);
    expect(counters.budgetMalformed).toBe(0);
  });

  it("keeps async REJECT (throw) working as budget_unavailable", async () => {
    const stub = providerStub(recordsResult());
    const { run, counters } = budgetHarness(async () => {
      throw new Error("backend down");
    });
    const { result, runtime } = await run(stub.fn);
    expect(stub.attempts).toBe(0);
    expect(result.errorCode).toBe("budget_unavailable");
    expect(runtime.budgetUnavailable).toBe(true);
    // A throw is not a malformed DECISION: it is counted separately.
    expect(counters.budgetUnavailable).toBe(1);
    expect(counters.budgetMalformed).toBe(0);
  });

  it("never caches a malformed-decision refusal", async () => {
    let acquisitions = 0;
    const stub = providerStub(recordsResult());
    const { run, store } = budgetHarness(async () => {
      acquisitions += 1;
      return { allowed: "nope" };
    });
    await run(stub.fn);
    expect(store.size()).toBe(0);
    await run(stub.fn);
    expect(acquisitions).toBe(2);
  });
});

// ── Both budget states are in the explicit non-cacheable list ────────────────

describe("budget states are enumerated as non-cacheable", () => {
  it("lists BOTH budget_exhausted and budget_unavailable", () => {
    expect(ODPT_NON_CACHEABLE_ERROR_CODES).toContain("budget_exhausted");
    expect(ODPT_NON_CACHEABLE_ERROR_CODES).toContain("budget_unavailable");
  });

  it("classifies every listed budget code as non-cacheable, and never as data", () => {
    for (const code of ["budget_exhausted", "budget_unavailable"]) {
      expect(ODPT_NON_CACHEABLE_ERROR_CODES).toContain(code);
      const classification = classifyResultForCache(
        {
          provider: "odpt",
          operation: "station",
          outcome: "error",
          errorCode: code,
          records: [],
          recordCount: 0,
          sourceUrl: "",
        },
        "station",
      );
      expect(classification.cacheable).toBe(false);
      expect(classification.cacheClass).toBeUndefined();
      expect(classification.reason).toBe(`error_code_not_cacheable:${code}`);
    }
  });

  it("iterates the whole non-cacheable list and proves each entry is refused", () => {
    // The point of the explicit list is that every known non-cacheable canonical
    // error is enumerated, so this guards against future omissions too.
    for (const code of ODPT_NON_CACHEABLE_ERROR_CODES) {
      const classification = classifyResultForCache(
        {
          provider: "odpt",
          operation: "station",
          outcome: "error",
          errorCode: code,
          records: [],
          recordCount: 0,
          sourceUrl: "",
        },
        "station",
      );
      expect(classification.cacheable, `${code} must not be cacheable`).toBe(
        false,
      );
    }
  });
});

// ── Strict Gregorian date validation ────────────────────────────────────────

describe("impossible Calendar dates are rejected structurally", () => {
  it("accepts real dates, including leap years", () => {
    for (const [value, iso] of [
      ["2017-02-28", "2017-02-27T15:00:00.000Z"],
      ["2016-02-29", "2016-02-28T15:00:00.000Z"],
      ["2000-02-29", "2000-02-28T15:00:00.000Z"],
      ["2017-11-18", "2017-11-17T15:00:00.000Z"],
    ]) {
      const parsed = parseCalendarPeriodEnd(`2017-11-13/${value}`);
      expect(parsed.status).toBe("date_only_start_of_day_jst");
      expect(new Date(parsed.endMs).toISOString()).toBe(iso);
    }
  });

  it.each([
    ["2017-02-29", "not a leap year"],
    ["2017-02-30", "February never has 30 days"],
    ["2017-11-31", "November never has 31 days"],
    ["2017-13-01", "month out of range"],
    ["2017-00-10", "month 00"],
    ["2017-04-31", "April never has 31 days"],
    ["2017-01-00", "day 00"],
    ["1900-02-29", "century not divisible by 400"],
    ["2100-02-29", "century not divisible by 400"],
  ])("rejects the impossible date %s (%s)", (value) => {
    const parsed = parseCalendarPeriodEnd(`2017-11-13/${value}`);
    expect(parsed.status).toBe("unsupported");
    expect(parsed.endMs).toBeUndefined();
    expect(parsed.reason).toContain("impossible_date");
    // Crucially, it must NOT have been normalised into a neighbouring date.
    expect(parsed.reason).not.toBe("unparseable_date_only");
  });

  it("does not let Date.parse normalise 2017-02-29 into March", () => {
    // Proof the guard is doing real work: Date.parse alone WOULD normalise it.
    expect(Number.isNaN(Date.parse("2017-02-29"))).toBe(false);
    expect(new Date(Date.parse("2017-02-29")).toISOString()).toBe(
      "2017-03-01T00:00:00.000Z",
    );
    // ...but the parser rejects it instead.
    expect(parseCalendarPeriodEnd("2017-11-13/2017-02-29").status).toBe(
      "unsupported",
    );
  });

  it("exposes the structural validator directly", () => {
    expect(validateGregorianDate("2016-02-29")).toMatchObject({
      ok: true,
      year: 2016,
      month: 2,
      day: 29,
    });
    expect(validateGregorianDate("2017-02-29")).toMatchObject({
      ok: false,
      reason: "day_out_of_range",
    });
    expect(validateGregorianDate("2017-13-01")).toMatchObject({
      ok: false,
      reason: "month_out_of_range",
    });
    expect(validateGregorianDate("not-a-date")).toMatchObject({
      ok: false,
      reason: "not_a_date_shape",
    });
  });

  it("rejects impossible dates inside explicit-offset datetimes too", () => {
    expect(
      parseCalendarPeriodEnd("2017-11-13/2017-11-18T00:00:00+09:00").status,
    ).toBe("datetime");
    for (const value of [
      "2017-02-29T00:00:00+09:00",
      "2017-11-31T00:00:00Z",
      "2017-11-18T25:00:00+09:00",
      "2017-11-18T00:60:00+09:00",
      "2017-11-18T00:00:00+15:00",
    ]) {
      const parsed = parseCalendarPeriodEnd(`2017-11-13/${value}`);
      expect(parsed.status, value).toBe("unsupported");
      expect(parsed.endMs).toBeUndefined();
    }
  });

  it("still rejects a timezone-LESS datetime", () => {
    const parsed = parseCalendarPeriodEnd(
      "2017-11-13T00:00:00/2017-11-18T00:00:00",
    );
    expect(parsed.status).toBe("unsupported");
    expect(parsed.reason).toBe("datetime_without_timezone");
  });

  it("keeps the spec's own date-only example valid", () => {
    const parsed = parseCalendarPeriodEnd("2017-11-13/2017-11-18");
    expect(parsed.status).toBe("date_only_start_of_day_jst");
    expect(parsed.policy).toBe("meguruto_start_of_date_asia_tokyo");
    expect(new Date(parsed.endMs).toISOString()).toBe(
      "2017-11-17T15:00:00.000Z",
    );
  });
});
