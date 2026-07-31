import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthModal } from "../AuthModal";

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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
});
