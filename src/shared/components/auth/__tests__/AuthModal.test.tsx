import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthModal } from "../AuthModal";

const authMock = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
const analyticsMock = vi.hoisted(() => ({
  trackSignupStarted: vi.fn(),
  trackSignupCompleted: vi.fn(),
  markPendingSignup: vi.fn(),
  clearPendingSignup: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    signInWithGoogle: authMock.signInWithGoogle,
    signInWithEmail: authMock.signInWithEmail,
    signUpWithEmail: authMock.signUpWithEmail,
    resetPasswordForEmail: vi.fn(),
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
  act(() => {
    root!.render(
      <MemoryRouter>
        <AuthModal isOpen onClose={vi.fn()} />
      </MemoryRouter>,
    );
  });
}

describe("AuthModal", () => {
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
    authMock.signUpWithEmail.mockResolvedValueOnce({ error: null });
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
