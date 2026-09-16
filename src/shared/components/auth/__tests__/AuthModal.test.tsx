import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthModal } from "../AuthModal";

const authMock = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
const analyticsMock = vi.hoisted(() => ({
  trackSignupStarted: vi.fn(),
  trackSignupCompleted: vi.fn(),
  trackSignupError: vi.fn(),
  trackSignupDismissed: vi.fn(),
  markPendingSignup: vi.fn(),
  clearPendingSignup: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    signInWithGoogle: authMock.signInWithGoogle,
    signInWithEmail: authMock.signInWithEmail,
    signUpWithEmail: authMock.signUpWithEmail,
    resetPasswordForEmail: authMock.resetPasswordForEmail,
  }),
}));

vi.mock("@/shared/services/analytics/RecommendationAnalyticsService", () => ({
  recommendationAnalytics: analyticsMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", resolvedLanguage: "en" },
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body
    .querySelectorAll('[data-testid="auth-modal-card"]')
    .forEach((node) => node.closest(".fixed")?.remove());
  root = undefined;
  host = undefined;
  vi.clearAllMocks();
});

function renderAuthModal() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const onClose = vi.fn();
  act(() => {
    root!.render(
      <MemoryRouter>
        <AuthModal isOpen onClose={onClose} />
      </MemoryRouter>,
    );
  });
  return onClose;
}

function setInputValue(selector: string, value: string) {
  const input = document.body.querySelector<HTMLInputElement>(selector);
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

describe("AuthModal", () => {
  it("submits forgot-password email without sending password data", async () => {
    authMock.resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: null,
    });
    renderAuthModal();
    setInputValue('input[type="email"]', "person@example.com");

    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "auth.forgotPassword")
        ?.click();
      await Promise.resolve();
    });

    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith(
      "person@example.com",
    );
    expect(document.body.textContent).toContain("auth.resetEmailSent");
    expect(authMock.resetPasswordForEmail.mock.calls[0]).not.toContain(
      "password",
    );
  });

  it("completes ordinary email login without entering recovery", async () => {
    const onClose = renderAuthModal();
    authMock.signInWithEmail.mockResolvedValueOnce({ error: null });

    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await Promise.resolve();
    });

    expect(authMock.signInWithEmail).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Google OAuth on the ordinary auth path", async () => {
    authMock.signInWithGoogle.mockResolvedValueOnce({ error: null });
    renderAuthModal();

    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent === "auth.continueWithGoogle")
        ?.click();
      await Promise.resolve();
    });

    expect(authMock.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("preserves a useful unknown backend error in English", async () => {
    authMock.signInWithEmail.mockResolvedValueOnce({
      error: new Error("Database temporarily unavailable"),
    });
    renderAuthModal();

    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(document.body.textContent).toContain(
      "Database temporarily unavailable",
    );
  });

  it("renders a light card with dark-mode variants and a separated brand mark", () => {
    renderAuthModal();

    const card = document.body.querySelector<HTMLElement>(
      '[data-testid="auth-modal-card"]',
    );
    const markFrame = document.body.querySelector<HTMLElement>(
      '[data-testid="auth-brand-mark-frame"]',
    );
    const emailInput = document.body.querySelector<HTMLInputElement>(
      'input[type="email"]',
    );

    expect(card?.className).toContain("bg-white dark:bg-slate-900");
    expect(card?.className).toContain("border-slate-200 dark:border-slate-700");
    expect(markFrame?.className).toContain("bg-slate-50");
    expect(markFrame?.className).toContain("dark:bg-white");
    expect(emailInput?.className).toContain("border-slate-300 bg-white");
    expect(emailInput?.className).toContain("dark:bg-slate-950/60");
  });

  it("records signup start and completion only after a successful email signup", async () => {
    authMock.signUpWithEmail.mockResolvedValueOnce({
      data: { user: { identities: [{ id: "new-user" }] } },
      error: null,
    });
    renderAuthModal();

    const toggle = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.signUp",
    );
    await act(async () => toggle?.click());
    expect(analyticsMock.trackSignupStarted).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(analyticsMock.trackSignupCompleted).toHaveBeenCalledWith(
      "email",
      "auth_modal",
      "en",
    );
  });

  it("does not record signup completion when signup fails", async () => {
    authMock.signUpWithEmail.mockResolvedValueOnce({
      error: new Error("user already registered"),
    });
    renderAuthModal();

    const toggle = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.signUp",
    );
    act(() => toggle?.click());
    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(analyticsMock.trackSignupCompleted).not.toHaveBeenCalled();
  });
});
