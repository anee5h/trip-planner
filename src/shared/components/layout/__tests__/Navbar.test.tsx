import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import Navbar from "../Navbar";

const localeState = vi.hoisted(() => ({ setLocale: vi.fn() }));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en",
    setLocale: localeState.setLocale,
  }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
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
  root = undefined;
  host = undefined;
});

function renderNavbar() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );
  });
  return host;
}

describe("Navbar Component", () => {
  it("exports Navbar function component", () => {
    expect(typeof Navbar).toBe("function");
  });

  it("keeps the home link accessible and shows the wordmark from 360px", () => {
    const node = renderNavbar();

    const homeLink = node.querySelector<HTMLAnchorElement>(
      'a[aria-label="Meguruto home"]',
    );
    const wordmark = node.querySelector<HTMLElement>(
      '[data-testid="navbar-brand-wordmark"]',
    );
    const markFrame = node.querySelector<HTMLElement>(
      '[data-testid="navbar-brand-mark-frame"]',
    );

    expect(homeLink).not.toBeNull();
    expect(wordmark?.textContent).toBe("Meguruto");
    expect(wordmark?.className).toContain("hidden min-[360px]:inline");
    expect(wordmark?.className).not.toContain("sm:inline");
    expect(markFrame?.className).toContain("dark:ring-white/50");
  });

  it("makes the language menu available in the mobile navbar", () => {
    const node = renderNavbar();
    const languageButton = node.querySelector<HTMLButtonElement>(
      'button[aria-label="Select language"]',
    );

    expect(languageButton).not.toBeNull();
    expect(languageButton?.parentElement?.className).not.toContain("hidden");

    act(() => languageButton?.click());
    const japanese = Array.from(node.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("日本語"),
    );
    act(() => japanese?.click());
    expect(localeState.setLocale).toHaveBeenCalledWith("ja");
  });

  it("renders version badge as plain text, not a clickable release-notes trigger", () => {
    const node = renderNavbar();
    // Open mobile menu to access version badge
    const menuButton = node.querySelector<HTMLButtonElement>(
      'button[aria-label="Toggle menu"]',
    );
    act(() => menuButton?.click());
    // The version badge should be a <span>, not a <button>
    const spans = node.querySelectorAll("span");
    const versionSpan = Array.from(spans).find((s) =>
      s.textContent?.startsWith("Meguruto v"),
    );
    expect(versionSpan).not.toBeNull();
    expect(versionSpan?.tagName).toBe("SPAN");
    // No 'Notes' badge element should exist
    expect(node.textContent).not.toContain("Notes");
  });
});
