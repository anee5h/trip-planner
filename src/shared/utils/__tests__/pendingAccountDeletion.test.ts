/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccountDeletionPending,
  executePendingAccountDeletionIfRequested,
  getPendingAccountDeletionIntent,
  markAccountDeletionPending,
  storeAccountDeletionResult,
  takeAccountDeletionResult,
} from "../pendingAccountDeletion";

const { mockGetSession, mockGetUser, mockSignOut, mockRequestDeletion } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetUser: vi.fn(),
    mockSignOut: vi.fn(),
    mockRequestDeletion: vi.fn(),
  }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
  },
}));

vi.mock("@/shared/utils/accountDeletion", () => ({
  requestAccountDeletion: mockRequestDeletion,
}));

const sessionFor = (userId: string) => ({
  data: {
    session: {
      access_token: "fresh-oauth-token",
      user: { id: userId },
    },
  },
});

describe("KAI-44 pending OAuth account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockGetSession.mockResolvedValue(sessionFor("user-A"));
    mockRequestDeletion.mockResolvedValue({ ok: true, deleted: {} });
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("is a no-op without a pending intent", async () => {
    await executePendingAccountDeletionIfRequested();
    expect(mockRequestDeletion).not.toHaveBeenCalled();
  });

  it("waits for a session when an intent is set (OAuth redirect pending)", async () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await executePendingAccountDeletionIfRequested();
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    expect(getPendingAccountDeletionIntent()).not.toBeNull(); // retried later
  });

  it("executes deletion with reauthMode otp and signs out on success", async () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    await executePendingAccountDeletionIfRequested();
    expect(mockRequestDeletion).toHaveBeenCalledWith("fresh-oauth-token", {
      reauthMode: "otp",
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(getPendingAccountDeletionIntent()).toBeNull();
  });

  it("NEVER deletes when the returned session belongs to a different user (A → B)", async () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    mockGetSession.mockResolvedValue(sessionFor("user-B")); // chooser picked B
    await executePendingAccountDeletionIfRequested();
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(getPendingAccountDeletionIntent()).toBeNull(); // intent cleared
    const result = takeAccountDeletionResult();
    expect(result).not.toBeNull();
    if (result && !result.ok) {
      expect(result.error).toBe("account_mismatch");
    }
  });

  it("preserves a partial deletion failure instead of discarding it", async () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    mockRequestDeletion.mockResolvedValue({
      ok: false,
      error: "data_deletion_failed",
      step: "delete_user_data",
      deleted: { trips: true, user_data: false },
      retrySafe: true,
    });
    await executePendingAccountDeletionIfRequested();
    expect(mockSignOut).not.toHaveBeenCalled();
    const result = takeAccountDeletionResult();
    expect(result).not.toBeNull();
    if (result && !result.ok) {
      expect(result.error).toBe("data_deletion_failed");
      expect(result.deleted).toEqual({ trips: true, user_data: false });
    }
  });

  it("reconciliation: definitive 401 after network error -> completed, no stored result", async () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    mockRequestDeletion.mockResolvedValue({
      ok: false,
      error: "network_error",
    });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error("invalid JWT"), { status: 401 }),
    });
    await executePendingAccountDeletionIfRequested();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(takeAccountDeletionResult()).toBeNull();
  });

  it("reconciliation: transport failure during reconciliation -> unknown outcome stored", async () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    mockRequestDeletion.mockResolvedValue({
      ok: false,
      error: "network_error",
    });
    mockGetUser.mockRejectedValue(new Error("network down"));
    await executePendingAccountDeletionIfRequested();
    expect(mockSignOut).not.toHaveBeenCalled();
    const result = takeAccountDeletionResult();
    expect(result).not.toBeNull();
    if (result && !result.ok) {
      expect(result.error).toBe("network_error");
    }
  });

  it("markAccountDeletionPending reports failure when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    });
    const persisted = markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    expect(persisted).toBe(false);
    vi.unstubAllGlobals();
  });

  it("clearAccountDeletionPending removes the intent", () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    clearAccountDeletionPending();
    expect(getPendingAccountDeletionIntent()).toBeNull();
  });

  it("NEVER executes an expired intent (cancelled flow days later)", async () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now() - 16 * 60 * 1000, // 16 minutes old — past the TTL
    });
    await executePendingAccountDeletionIfRequested();
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(getPendingAccountDeletionIntent()).toBeNull(); // intent cleared
    const result = takeAccountDeletionResult();
    expect(result).not.toBeNull();
    if (result && !result.ok) {
      expect(result.error).toBe("reauth_required"); // user can restart cleanly
    }
  });

  it("NEVER executes an intent with a missing/invalid createdAt", async () => {
    // Missing createdAt (no Date.now() substitution — invalid authorization).
    sessionStorage.setItem(
      "meguruto_pending_account_deletion",
      JSON.stringify({ userId: "user-A", provider: "google" }),
    );
    await executePendingAccountDeletionIfRequested();
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    expect(getPendingAccountDeletionIntent()).toBeNull();

    // Non-finite createdAt.
    sessionStorage.setItem(
      "meguruto_pending_account_deletion",
      JSON.stringify({
        userId: "user-A",
        provider: "google",
        createdAt: "not-a-number",
      }),
    );
    await executePendingAccountDeletionIfRequested();
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    expect(getPendingAccountDeletionIntent()).toBeNull();
  });

  it("issues exactly ONE deletion request when executions overlap (single-flight)", async () => {
    markAccountDeletionPending({
      userId: "user-A",
      provider: "google",
      createdAt: Date.now(),
    });
    let resolveSession: (value: unknown) => void = () => {};
    mockGetSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const first = executePendingAccountDeletionIfRequested();
    const second = executePendingAccountDeletionIfRequested(); // overlaps
    resolveSession(
      sessionFor("user-A"), // resolved AFTER both calls entered
    );
    await Promise.all([first, second]);
    expect(mockRequestDeletion).toHaveBeenCalledTimes(1);
  });

  it("store/takeAccountDeletionResult round-trips a preserved outcome", () => {
    storeAccountDeletionResult({
      ok: false,
      error: "auth_delete_failed",
      deleted: { trips: true, user_data: true, feedback: true },
      retrySafe: true,
    });
    const result = takeAccountDeletionResult();
    expect(result).toEqual({
      ok: false,
      error: "auth_delete_failed",
      deleted: { trips: true, user_data: true, feedback: true },
      retrySafe: true,
    });
    expect(takeAccountDeletionResult()).toBeNull(); // consumed once
  });
});
