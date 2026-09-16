/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../useAuth";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: authMock },
}));
vi.mock("@/shared/utils/errorReporter", () => ({
  reportAuthFailureIfOperational: vi.fn(),
}));
vi.mock("@/shared/utils/pendingAccountDeletion", () => ({
  executePendingAccountDeletionIfRequested: vi.fn(),
}));
vi.mock("@/shared/services/analytics/RecommendationAnalyticsService", () => ({
  recommendationAnalytics: {
    trackPendingSignupError: vi.fn(),
    trackPendingSignupCompletion: vi.fn(),
  },
}));
vi.mock("../clearProfileOrchestration", () => ({
  executeClearProfile: vi.fn(),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let latestAuth: ReturnType<typeof useAuth> | undefined;
let authListener: ((event: string, session: unknown) => void) | undefined;

function Harness() {
  latestAuth = useAuth();
  return null;
}

function session(userId: string) {
  return {
    access_token: "redacted-access-token",
    refresh_token: "redacted-refresh-token",
    expires_in: 3600,
    expires_at: 1,
    token_type: "bearer",
    user: { id: userId },
  };
}

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await Promise.resolve();
  });
}

beforeEach(() => {
  latestAuth = undefined;
  authListener = undefined;
  authMock.getSession.mockReset().mockResolvedValue({
    data: { session: session("existing-user") },
  });
  authMock.onAuthStateChange.mockReset().mockImplementation((listener) => {
    authListener = listener;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  authMock.updateUser.mockReset().mockResolvedValue({
    data: { user: { id: "recovery-user" } },
    error: null,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("AuthProvider recovery confirmation", () => {
  it("does not activate recovery from a URL hint or ordinary session", async () => {
    window.history.replaceState({}, "", "/reset-password?type=recovery");
    await render();

    expect(latestAuth?.user?.id).toBe("existing-user");
    expect(latestAuth?.isPasswordRecovery).toBe(false);
    await act(async () => {
      authListener?.("SIGNED_IN", session("existing-user"));
    });
    expect(latestAuth?.isPasswordRecovery).toBe(false);
  });

  it("activates recovery only from a PASSWORD_RECOVERY event with a session", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password#type=recovery&access_token=redacted-access-token",
    );
    await render();

    await act(async () => {
      authListener?.("PASSWORD_RECOVERY", session("recovery-user"));
    });
    expect(latestAuth?.user?.id).toBe("recovery-user");
    expect(latestAuth?.isPasswordRecovery).toBe(true);
    await latestAuth?.updatePassword("test-password");
    expect(authMock.updateUser).toHaveBeenCalledWith({
      password: "test-password",
    });

    await act(async () => {
      authListener?.("SIGNED_OUT", null);
    });
    expect(latestAuth?.isPasswordRecovery).toBe(false);
  });
});
