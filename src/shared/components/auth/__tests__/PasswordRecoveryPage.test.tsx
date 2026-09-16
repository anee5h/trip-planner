/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordRecoveryPage } from "../PasswordRecoveryPage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authMock = vi.hoisted(() => ({
  user: { id: "recovery-user" } as { id: string } | null,
  loading: false,
  isPasswordRecovery: true,
  updatePassword: vi.fn(),
  clearPasswordRecovery: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => authMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "auth.resetPasswordTitle": "Create a new password",
        "auth.resetPasswordHelp": "Choose a new password for your account.",
        "auth.newPassword": "New password",
        "auth.confirmNewPassword": "Confirm new password",
        "auth.updatePassword": "Update password",
        "auth.passwordUpdatedTitle": "Password updated",
        "auth.passwordUpdatedHelp": "Your password was changed successfully.",
        "auth.continueToMeguruto": "Continue to Meguruto",
        "auth.errors.passwordTooShort":
          "Password must be at least 6 characters.",
        "auth.errors.passwordPolicy":
          "This password does not meet the current security requirements.",
        "auth.errors.passwordPolicyPwned":
          "Choose a password that has not appeared in a known data leak.",
        "auth.errors.passwordsDoNotMatch": "Passwords do not match.",
        "auth.errors.samePassword":
          "Choose a password different from your current password.",
        "auth.errors.generic": "We could not update your password.",
        "auth.errors.networkError": "Network error. Please try again.",
        "auth.resetInvalidTitle": "This reset link is no longer valid",
        "auth.resetInvalidHelp": "Request a new reset email to continue.",
        "auth.emailAddress": "Email address",
        "auth.resetEmailRequired": "Enter your email address first.",
        "auth.resetEmailSent": "Check your email for a password reset link.",
        "auth.sendAnotherResetEmail": "Send another reset email",
        "actions.pleaseWait": "Please wait…",
      })[key] ?? key,
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <PasswordRecoveryPage />
      </MemoryRouter>,
    );
  });
}

function setInput(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  authMock.user = { id: "recovery-user" };
  authMock.loading = false;
  authMock.isPasswordRecovery = true;
  authMock.updatePassword.mockReset().mockResolvedValue({
    data: { user: authMock.user },
    error: null,
  });
  authMock.clearPasswordRecovery.mockReset();
  authMock.resetPasswordForEmail.mockReset().mockResolvedValue({
    data: {},
    error: null,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("PasswordRecoveryPage", () => {
  it("renders the reset form with password browser semantics", () => {
    render();
    expect(document.body.textContent).toContain("Create a new password");
    expect(
      document
        .querySelector('input[name="new-password"]')
        ?.getAttribute("autocomplete"),
    ).toBe("new-password");
    expect(
      document
        .querySelector('input[name="confirm-new-password"]')
        ?.getAttribute("autocomplete"),
    ).toBe("new-password");
  });

  it("shows a clear mismatch error and does not update the password", async () => {
    render();
    setInput('input[name="new-password"]', "secret1");
    setInput('input[name="confirm-new-password"]', "secret2");
    await submit();

    expect(document.body.textContent).toContain("Passwords do not match.");
    expect(authMock.updatePassword).not.toHaveBeenCalled();
  });

  it("updates a valid password, shows success, and waits for explicit continue", async () => {
    render();
    setInput('input[name="new-password"]', "secret1");
    setInput('input[name="confirm-new-password"]', "secret1");
    await submit();

    expect(authMock.updatePassword).toHaveBeenCalledWith("secret1");
    expect(document.body.textContent).toContain("Password updated");
    expect(document.body.textContent).toContain(
      "Your password was changed successfully.",
    );
    expect(authMock.clearPasswordRecovery).not.toHaveBeenCalled();

    await act(async () =>
      document.querySelector<HTMLButtonElement>("button")?.click(),
    );
    expect(authMock.clearPasswordRecovery).toHaveBeenCalledTimes(1);
  });

  it("renders an invalid-link recovery path with resend", async () => {
    authMock.user = null;
    authMock.isPasswordRecovery = false;
    render();

    expect(document.body.textContent).toContain(
      "This reset link is no longer valid",
    );
    expect(document.querySelector("form")).toBeNull();
    setInput('input[name="email"]', "person@example.com");
    await act(async () =>
      document.querySelector<HTMLButtonElement>("button")?.click(),
    );

    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith(
      "person@example.com",
    );
    expect(document.body.textContent).toContain(
      "Check your email for a password reset link.",
    );
  });

  it("does not render a usable reset form for a URL-only recovery hint", () => {
    authMock.isPasswordRecovery = false;
    render();

    expect(document.querySelector("form")).toBeNull();
    expect(document.body.textContent).toContain(
      "This reset link is no longer valid",
    );
  });

  it.each([
    [
      { code: "weak_password", status: 422, message: "server policy" },
      "This password does not meet the current security requirements.",
    ],
    [
      { code: "same_password", status: 422, message: "same password" },
      "Choose a password different from your current password.",
    ],
    [
      { code: "unknown", status: 500, message: "secret provider detail" },
      "We could not update your password.",
    ],
  ])(
    "maps safe update error %s without exposing its message",
    async (updateError, expected) => {
      authMock.updatePassword.mockResolvedValueOnce({
        data: { user: null },
        error: updateError,
      });
      render();
      setInput('input[name="new-password"]', "secret1");
      setInput('input[name="confirm-new-password"]', "secret1");
      await submit();

      expect(document.body.textContent).toContain(expected);
      expect(document.body.textContent).not.toContain("secret provider detail");
    },
  );

  it("maps a missing recovery session to the resend state", async () => {
    authMock.updatePassword.mockResolvedValueOnce({
      data: { user: null },
      error: {
        name: "AuthSessionMissingError",
        status: 400,
        message: "Auth session missing!",
      },
    });
    render();
    setInput('input[name="new-password"]', "secret1");
    setInput('input[name="confirm-new-password"]', "secret1");
    await submit();

    expect(document.querySelector("form")).toBeNull();
    expect(document.body.textContent).toContain(
      "This reset link is no longer valid",
    );
  });

  it("defers password policy enforcement to Supabase", async () => {
    authMock.updatePassword.mockResolvedValueOnce({
      data: { user: null },
      error: {
        code: "weak_password",
        status: 422,
        message: "server policy",
      },
    });
    render();
    setInput('input[name="new-password"]', "x");
    setInput('input[name="confirm-new-password"]', "x");
    await submit();

    expect(authMock.updatePassword).toHaveBeenCalledWith("x");
    expect(document.body.textContent).toContain(
      "This password does not meet the current security requirements.",
    );
  });
});
