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
        "auth.errors.passwordsDoNotMatch": "Passwords do not match.",
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
});
