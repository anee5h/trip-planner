import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isJwtFutureRejection,
  refreshSessionOnce,
  withJwtFutureRecovery,
} from "../jwtRecovery";

function pgError(code: string, message: string): PostgrestError {
  return new PostgrestError({ code, message, details: "", hint: "" });
}

const jwtFutureError = pgError("PGRST303", "JWT issued at future");
const nbfError = pgError("PGRST303", "JWT not yet valid");
const expiredError = pgError("PGRST303", "JWT expired");
const networkError = pgError("NETWORK_ERROR", "fetch failed");

function makeClient(overrides?: Partial<SupabaseClient["auth"]>): {
  client: SupabaseClient;
  refreshSession: Mock;
  getSession: Mock;
} {
  const refreshSession = vi
    .fn()
    .mockResolvedValue({ data: { session: {} }, error: null });
  const getSession = vi
    .fn()
    .mockResolvedValue({ data: { session: null }, error: null });
  const auth = { getSession, refreshSession, ...overrides };
  const client = { auth } as unknown as SupabaseClient;
  return {
    client,
    refreshSession: auth.refreshSession as Mock,
    getSession: auth.getSession as Mock,
  };
}

function ok<T>(data: T) {
  return { data, error: null };
}

function fail(error: PostgrestError | Error) {
  return { data: null, error: error as PostgrestError };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const alwaysCurrent = () => true;

describe("isJwtFutureRejection", () => {
  it("matches future-iat and not-yet-valid rejections", () => {
    expect(isJwtFutureRejection(jwtFutureError)).toBe(true);
    expect(isJwtFutureRejection(nbfError)).toBe(true);
  });

  it("rejects other PGRST303 claim failures", () => {
    expect(isJwtFutureRejection(expiredError)).toBe(false);
    expect(
      isJwtFutureRejection(pgError("PGRST303", "JWT not in audience")),
    ).toBe(false);
    expect(
      isJwtFutureRejection(pgError("PGRST303", "Parsing claims failed")),
    ).toBe(false);
  });

  it("rejects non-PGRST303 and malformed errors", () => {
    expect(isJwtFutureRejection(networkError)).toBe(false);
    expect(isJwtFutureRejection(new Error("JWT issued at future"))).toBe(false);
    expect(isJwtFutureRejection(null)).toBe(false);
    expect(isJwtFutureRejection(undefined)).toBe(false);
    expect(isJwtFutureRejection("PGRST303")).toBe(false);
  });
});

describe("refreshSessionOnce", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares a single in-flight refresh across concurrent callers", async () => {
    const { client, refreshSession } = makeClient();
    const pending = deferred<{ data: { session: {} } | null; error: null }>();
    refreshSession.mockReturnValue(pending.promise);

    const first = refreshSessionOnce(client);
    const second = refreshSessionOnce(client);

    expect(refreshSession).toHaveBeenCalledTimes(1);

    pending.resolve({ data: { session: {} }, error: null });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight promise after completion", async () => {
    const { client, refreshSession } = makeClient();
    await refreshSessionOnce(client);
    await refreshSessionOnce(client);
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it("resolves false when the refresh fails", async () => {
    const { client } = makeClient({
      refreshSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: new Error() }),
    });
    await expect(refreshSessionOnce(client)).resolves.toBe(false);
  });
});

describe("withJwtFutureRecovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replays exactly once after a successful refresh (Case A)", async () => {
    const { client, refreshSession } = makeClient();
    const operation = vi
      .fn()
      .mockResolvedValueOnce(fail(jwtFutureError))
      .mockResolvedValueOnce(ok({ id: "user-1" }));

    const result = await withJwtFutureRecovery(client, operation, {
      phase: "user_data.hydrate",
      isStillCurrent: alwaysCurrent,
    });

    expect(result).toEqual(ok({ id: "user-1" }));
    expect(operation).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("stops after one refresh + one replay on persistent failure (Case B)", async () => {
    const { client, refreshSession } = makeClient();
    const operation = vi
      .fn()
      .mockResolvedValueOnce(fail(jwtFutureError))
      .mockResolvedValueOnce(fail(jwtFutureError));

    const result = await withJwtFutureRecovery(client, operation, {
      phase: "user_data.hydrate",
      isStillCurrent: alwaysCurrent,
    });

    expect(result).toEqual(fail(jwtFutureError));
    expect(operation).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("does not replay when the refresh fails (Case C)", async () => {
    const { client, refreshSession } = makeClient({
      refreshSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: new Error() }),
    });
    const operation = vi.fn().mockResolvedValueOnce(fail(jwtFutureError));

    const result = await withJwtFutureRecovery(client, operation, {
      phase: "user_data.hydrate",
      isStillCurrent: alwaysCurrent,
    });

    expect(result).toEqual(fail(jwtFutureError));
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("never refreshes for non-JWT-future errors (Case D)", async () => {
    const { client, refreshSession } = makeClient();
    const operation = vi.fn().mockResolvedValueOnce(fail(networkError));

    const result = await withJwtFutureRecovery(client, operation, {
      phase: "user_data.hydrate",
      isStillCurrent: alwaysCurrent,
    });

    expect(result).toEqual(fail(networkError));
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("does not recover when identity changed before the refresh", async () => {
    const { client, refreshSession } = makeClient();
    let current = true;
    const operation = vi.fn().mockImplementationOnce(async () => {
      current = false; // identity flips before recovery checks the guard
      return fail(jwtFutureError);
    });

    const result = await withJwtFutureRecovery(client, operation, {
      phase: "user_data.hydrate",
      isStillCurrent: () => current,
    });

    expect(result).toEqual(fail(jwtFutureError));
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("does not replay when identity changed during the refresh", async () => {
    const { client, refreshSession } = makeClient();
    const operation = vi.fn().mockResolvedValueOnce(fail(jwtFutureError));
    let current = true;

    const promise = withJwtFutureRecovery(client, operation, {
      phase: "user_data.hydrate",
      isStillCurrent: () => current,
    });

    await Promise.resolve();
    await Promise.resolve();
    current = false; // sign-out lands while the refresh is in flight

    const result = await promise;
    expect(result).toEqual(fail(jwtFutureError));
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent recoveries into one refresh (stampede)", async () => {
    const { client, refreshSession } = makeClient();
    const pending = deferred<{ data: { session: {} } | null; error: null }>();
    refreshSession.mockReturnValue(pending.promise);

    const opA = vi
      .fn()
      .mockResolvedValueOnce(fail(jwtFutureError))
      .mockResolvedValueOnce(ok("A"));
    const opB = vi
      .fn()
      .mockResolvedValueOnce(fail(nbfError))
      .mockResolvedValueOnce(ok("B"));

    const recoveryA = withJwtFutureRecovery(client, opA, {
      phase: "user_data.hydrate",
      isStillCurrent: alwaysCurrent,
    });
    const recoveryB = withJwtFutureRecovery(client, opB, {
      phase: "trips.hydrate",
      isStillCurrent: alwaysCurrent,
    });

    // Let both operations fail and both reach the shared refresh.
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshSession).toHaveBeenCalledTimes(1);

    pending.resolve({ data: { session: {} }, error: null });

    await expect(recoveryA).resolves.toEqual(ok("A"));
    await expect(recoveryB).resolves.toEqual(ok("B"));
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("logs safe diagnostics without the token (no secrets)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE4MDAwMDAxMjB9.sig";

    const { client, getSession } = makeClient({
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: token } },
        error: null,
      }),
    });
    const operation = vi
      .fn()
      .mockResolvedValueOnce(fail(jwtFutureError))
      .mockResolvedValueOnce(ok("done"));

    await withJwtFutureRecovery(client, operation, {
      phase: "user_data.hydrate",
      isStillCurrent: alwaysCurrent,
      userId: "0123456789abcdef",
    });

    const messages = errorSpy.mock.calls.map((call) => call[0]);
    const infoMessages = infoSpy.mock.calls.map((call) => call[0]);
    expect(
      messages.some((m) => m.includes("sync.user_data.hydrate.jwt_future")),
    ).toBe(true);
    expect(
      infoMessages.some((m) =>
        m.includes("sync.user_data.hydrate.recovery_success"),
      ),
    ).toBe(true);

    // The token itself must never reach the log.
    const allLogged = JSON.stringify([
      ...errorSpy.mock.calls,
      ...infoSpy.mock.calls,
    ]);
    expect(allLogged).not.toContain(token);
    expect(allLogged).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(getSession).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
