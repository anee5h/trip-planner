/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const map: Record<string, string> = {
        "settings.deleteAccountTitle": "Delete account",
        "settings.deleteAccountConfirmPlaceholder": "DELETE",
        "settings.deleteAccountIrreversible": "This action is irreversible.",
        "settings.deleteAccountConfirmAction": "Permanently delete my account",
        "settings.deleteAccountCancel": "Cancel",
        "settings.deleteAccountOauthPrompt":
          "For security, you'll sign in again with {{provider}}. Deletion completes automatically after that.",
        "settings.deleteAccountOauthFailed":
          "Reauthentication failed. Please try again.",
        "settings.deleteAccountMismatch":
          "The account you signed in with does not match the account you started deleting.",
        "settings.deleteAccountNetworkError":
          "We couldn't confirm the result (network error).",
        "settings.deleteAccountPasswordPrompt":
          "Enter your password to confirm deletion.",
        "settings.deleteAccountPasswordLabel": "Enter your password to confirm",
      };
      const value = map[key] ?? key;
      return params
        ? value.replace(
            /\{\{(\w+)\}\}/g,
            (_, name: string) => params[name] ?? "",
          )
        : value;
    },
  }),
}));

// Stable references so the modal's [user, isOpen] effect does not re-run
// (and reset the delete surface) on every render.
const {
  mockUser,
  mockSignOut,
  mockGetSession,
  mockGetUser,
  mockRequestDeletion,
  mockSignInWithOAuth,
} = vi.hoisted(() => ({
  mockUser: {
    id: "u1",
    email: "u@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {},
  },
  mockSignOut: vi.fn().mockResolvedValue({ error: null }),
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockRequestDeletion: vi.fn(),
  mockSignInWithOAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      signInWithOAuth: mockSignInWithOAuth,
      signInWithPassword: vi.fn(),
      verifyOtp: vi.fn(),
      reauthenticate: vi.fn(),
    },
  },
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    updateUserProfile: vi.fn(),
    clearProfileData: vi.fn(),
    signOut: mockSignOut,
  }),
}));

vi.mock("@/shared/utils/accountDeletion", () => ({
  requestAccountDeletion: mockRequestDeletion,
}));

// The deletion REQUEST logic is covered by accountDeletion.test.ts; this
// suite guards the modal surface: entry point, reauthentication UI, and
// the ambiguous-network reconciliation contract.
import { ProfileModal } from "../ProfileModal";
import { getPendingAccountDeletionIntent } from "@/shared/utils/pendingAccountDeletion";

/** Invokes a React element's onClick through its internal prop attachment
 *  (portal content is outside the root container in jsdom). Base UI's
 *  merged handler expects an event-like object. */
function invokeClick(element: Element | null) {
  const propsKey = Object.keys(element ?? {}).find((k) =>
    k.startsWith("__reactProps"),
  );
  const props = (element as unknown as Record<string, unknown>)[
    propsKey ?? ""
  ] as { onClick?: (event?: unknown) => void } | undefined;
  const fakeEvent = {
    preventDefault() {},
    stopPropagation() {},
    currentTarget: element,
  };
  return props?.onClick?.(fakeEvent);
}

/** Sets a controlled input value via the native setter + input event. */
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function openDeletePanel(root: Root) {
  await act(async () => {
    root.render(<ProfileModal isOpen onClose={onCloseMock} />);
  });
  const deleteButton = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Delete account",
  );
  await act(async () => {
    invokeClick(deleteButton ?? null);
  });
}

const onCloseMock = vi.fn();

describe("KAI-44 ProfileModal account deletion surface", () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mockUser.app_metadata.provider = "email";
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
    });
    mockRequestDeletion.mockResolvedValue({ ok: true, deleted: {} });
    onCloseMock.mockClear();
    mockSignOut.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it("renders the account deletion entry point distinct from clear-profile", async () => {
    await act(async () => {
      root.render(<ProfileModal isOpen onClose={onCloseMock} />);
    });
    const texts = Array.from(document.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(texts).toContain("Delete account");
    expect(texts).toContain("Clear Profile Data");
  });

  it("OAuth: ONE destructive continuation — no separate button, confirm gated by typed DELETE", async () => {
    mockUser.app_metadata.provider = "google";
    await openDeletePanel(root);
    const panel = document.body.textContent ?? "";
    // Explanatory text only — no separate provider-action button.
    expect(panel).toContain("Deletion completes automatically after that");
    const buttons = Array.from(document.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(buttons).not.toContain("Continue with Google");

    const confirm = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Permanently delete my account"),
    );
    // Disabled until DELETE is typed — invoking it directly must not
    // bypass the gate (React does not fire disabled buttons, and the
    // handler is only reachable through the enabled button).
    expect(confirm?.hasAttribute("disabled")).toBe(true);
    await act(async () => {
      invokeClick(confirm ?? null);
    });
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });

  it("OAuth: typed DELETE + confirm starts the provider round-trip with an identity-bound intent", async () => {
    mockUser.app_metadata.provider = "google";
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    await openDeletePanel(root);
    const typed = document.querySelector<HTMLInputElement>(
      'input[placeholder="DELETE"]',
    );
    setInputValue(typed!, "DELETE");
    const confirm = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Permanently delete my account"),
    );
    expect(confirm?.hasAttribute("disabled")).toBe(false);
    await act(async () => {
      invokeClick(confirm ?? null);
    });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" }),
    );
    const intent = getPendingAccountDeletionIntent();
    expect(intent).not.toBeNull();
    expect(intent?.userId).toBe("u1"); // bound to the initiating account
    expect(intent?.provider).toBe("google");
  });

  it("OAuth: failed provider initiation clears the pending intent", async () => {
    mockUser.app_metadata.provider = "google";
    mockSignInWithOAuth.mockResolvedValue({
      error: new Error("provider down"),
    });
    await openDeletePanel(root);
    const typed = document.querySelector<HTMLInputElement>(
      'input[placeholder="DELETE"]',
    );
    setInputValue(typed!, "DELETE");
    const confirm = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Permanently delete my account"),
    );
    await act(async () => {
      invokeClick(confirm ?? null);
    });
    expect(getPendingAccountDeletionIntent()).toBeNull();
    expect(document.body.textContent ?? "").toContain(
      "Reauthentication failed. Please try again.",
    );
  });

  it("reconciliation: definitive invalid session after network error -> completed", async () => {
    mockRequestDeletion.mockResolvedValue({
      ok: false,
      error: "network_error",
    });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error("invalid JWT"), { status: 401 }),
    });
    await openDeletePanel(root);
    const typed = document.querySelector<HTMLInputElement>(
      'input[placeholder="DELETE"]',
    );
    setInputValue(typed!, "DELETE");
    const password = document.querySelector<HTMLInputElement>(
      "#delete-account-password",
    );
    setInputValue(password!, "correct-password");
    const confirm = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Permanently delete my account"),
    );
    await act(async () => {
      invokeClick(confirm ?? null);
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("reconciliation: network/server error during reconciliation -> NOT completed", async () => {
    mockRequestDeletion.mockResolvedValue({
      ok: false,
      error: "network_error",
    });
    // Reconciliation itself fails (transport) — outcome stays unknown.
    mockGetUser.mockRejectedValue(new Error("network down"));
    await openDeletePanel(root);
    const typed = document.querySelector<HTMLInputElement>(
      'input[placeholder="DELETE"]',
    );
    setInputValue(typed!, "DELETE");
    const password = document.querySelector<HTMLInputElement>(
      "#delete-account-password",
    );
    setInputValue(password!, "correct-password");
    const confirm = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Permanently delete my account"),
    );
    await act(async () => {
      invokeClick(confirm ?? null);
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(onCloseMock).not.toHaveBeenCalled();
    expect(document.body.textContent ?? "").toContain(
      "We couldn't confirm the result (network error).",
    );
  });
});
