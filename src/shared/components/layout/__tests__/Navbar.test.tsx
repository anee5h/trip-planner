import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import Navbar from "../Navbar";

const authState = vi.hoisted(() => ({
  user: null as {
    email?: string;
    user_metadata?: Record<string, unknown>;
  } | null,
  loading: false,
  signOut: vi.fn(),
}));
const localeState = vi.hoisted(() => ({
  locale: "en" as "en" | "ja",
  setLocale: vi.fn(),
}));
const themeState = vi.hoisted(() => ({
  resolvedTheme: "light" as "light" | "dark",
  setTheme: vi.fn(),
}));
const openAuthModal = vi.hoisted(() => vi.fn());
const analyticsMock = vi.hoisted(() => ({
  trackSignupCtaImpression: vi.fn(),
  trackSignupCtaClick: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    signOut: authState.signOut,
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({
    locale: localeState.locale,
    setLocale: localeState.setLocale,
  }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal }),
}));

vi.mock("@/shared/context/ThemeContext", () => ({
  useTheme: () => ({
    theme: themeState.resolvedTheme,
    setTheme: themeState.setTheme,
    resolvedTheme: themeState.resolvedTheme,
  }),
}));

vi.mock("@/shared/services/analytics/RecommendationAnalyticsService", () => ({
  recommendationAnalytics: analyticsMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, Record<"en" | "ja", string>> = {
        "actions.signUp": { en: "Sign Up", ja: "新規登録" },
        "actions.close": { en: "Close", ja: "閉じる" },
        "navigation.signIn": { en: "Sign In", ja: "ログイン" },
        "navigation.signOut": { en: "Sign Out", ja: "ログアウト" },
        "navigation.signedInAs": { en: "Signed in as", ja: "ログイン中:" },
        "navigation.editProfile": { en: "Edit Profile", ja: "アカウント編集" },
        "navigation.settings": { en: "Settings", ja: "設定" },
        "navigation.trips": { en: "Trips", ja: "旅程" },
        "navigation.itineraries": { en: "Itineraries", ja: "旅行の旅程" },
        "navigation.bucketList": { en: "Bucket List", ja: "行きたい" },
        "navigation.passport": { en: "Passport", ja: "パスポート" },
        "navigation.language": { en: "Language", ja: "言語" },
        "navigation.help": { en: "Help", ja: "ヘルプ" },
        "navigation.feedback": {
          en: "Send Feedback",
          ja: "フィードバック送信",
        },
        "navigation.collections": { en: "Collections", ja: "コレクション" },
        "navigation.discover": { en: "Discover", ja: "発見" },
        "navigation.theme": { en: "Theme", ja: "テーマ" },
        "theme.light": { en: "light", ja: "ライト" },
        "theme.dark": { en: "dark", ja: "ダーク" },
        "navigation.explore": { en: "Explore", ja: "探す" },
        "navigation.back": { en: "Back", ja: "戻る" },
        "navigation.userMenu": { en: "User menu", ja: "ユーザーメニュー" },
        "navigation.selectLanguage": {
          en: "Select language",
          ja: "言語を選択",
        },
        "navigation.toggleTheme": {
          en: "Toggle theme",
          ja: "テーマを切り替え",
        },
        "navigation.toggleMenu": { en: "Toggle menu", ja: "メニューを開閉" },
      };
      return labels[key]?.[localeState.locale] ?? key;
    },
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  authState.user = null;
  authState.loading = false;
  localeState.locale = "en";
  themeState.resolvedTheme = "light";
  vi.clearAllMocks();
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

  it("keeps the home link accessible and shows both mark and wordmark", () => {
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
    expect(wordmark?.className).toContain("whitespace-nowrap");
    expect(wordmark?.className).toContain("max-[359px]:hidden");
    expect(markFrame?.className).toContain("dark:ring-white/50");
  });

  it("renders a left-aligned brand and a prominent guest signup CTA", () => {
    const node = renderNavbar();
    const brand = node.querySelector<HTMLAnchorElement>(
      'a[aria-label="Meguruto home"]',
    );
    const cta = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-signup-cta"]',
    );

    expect(brand?.className).not.toContain("absolute");
    expect(cta?.textContent).toBe("Sign Up");
    expect(cta?.className).toContain("min-h-11");
  });

  it("records one signup CTA impression across ordinary rerenders", () => {
    renderNavbar();
    expect(analyticsMock.trackSignupCtaImpression).toHaveBeenCalledTimes(1);

    act(() => {
      root!.render(
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>,
      );
    });

    expect(analyticsMock.trackSignupCtaImpression).toHaveBeenCalledTimes(1);
    expect(analyticsMock.trackSignupCtaImpression).toHaveBeenCalledWith(
      "header",
      "en",
    );
  });

  it("opens the existing signup flow and records a header click", () => {
    const node = renderNavbar();
    const cta = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-signup-cta"]',
    );

    act(() => cta?.click());

    expect(analyticsMock.trackSignupCtaClick).toHaveBeenCalledWith(
      "header",
      "en",
    );
    expect(openAuthModal).toHaveBeenCalledWith("signup", "header");
  });

  it("replaces signup with an avatar and exposes account actions when signed in", () => {
    authState.user = {
      email: "traveller@example.com",
      user_metadata: { full_name: "A Traveller" },
    };
    const node = renderNavbar();

    expect(node.querySelector('[data-testid="navbar-signup-cta"]')).toBeNull();
    const avatar = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-avatar-trigger"]',
    );
    expect(avatar).not.toBeNull();

    act(() => avatar?.click());

    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("Collections");
    expect(menu?.textContent).toContain("Bucket List");
    expect(menu?.textContent).toContain("Itineraries");
    expect(menu?.textContent).toContain("Edit Profile");
    expect(menu?.textContent).toContain("Settings");
    expect(menu?.textContent).not.toContain("Passport");
    expect(menu?.textContent).not.toContain("Trips");
    expect(menu?.textContent).toContain("Send Feedback");
    expect(menu?.textContent).toContain("Sign Out");
  });

  it("exposes language and theme toggles beside the guest CTA on mobile", () => {
    const node = renderNavbar();

    const languageToggle = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-mobile-language-toggle"]',
    );
    const themeToggle = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-mobile-theme-toggle"]',
    );

    expect(languageToggle).not.toBeNull();
    expect(themeToggle).not.toBeNull();
    act(() => languageToggle?.click());
    act(() => themeToggle?.click());
    expect(localeState.setLocale).toHaveBeenCalledWith("ja");
    expect(themeState.setTheme).toHaveBeenCalledWith("dark");
  });

  it("styles secondary account actions as destructive red controls", () => {
    authState.user = { email: "traveller@example.com" };
    const node = renderNavbar();
    act(() =>
      node
        .querySelector<HTMLButtonElement>(
          '[data-testid="navbar-avatar-trigger"]',
        )
        ?.click(),
    );

    for (const label of ["Edit Profile", "Settings", "Help", "Send Feedback"]) {
      const item = Array.from(
        document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      ).find((candidate) => candidate.textContent?.includes(label));
      expect(item?.className).not.toContain("text-red-600");
    }

    const signOut = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((candidate) => candidate.textContent?.includes("Sign Out"));
    expect(signOut?.className).toContain("text-red-600");
  });

  it("keeps sign out available from the avatar account menu", () => {
    authState.user = { email: "traveller@example.com" };
    const node = renderNavbar();
    act(() =>
      node
        .querySelector<HTMLButtonElement>(
          '[data-testid="navbar-avatar-trigger"]',
        )
        ?.click(),
    );

    const signOut = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Sign Out"),
    );
    act(() => signOut?.click());
    expect(authState.signOut).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the avatar when its menu is dismissed outside", () => {
    authState.user = { email: "traveller@example.com" };
    const node = renderNavbar();
    const avatar = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-avatar-trigger"]',
    );
    act(() => avatar?.click());

    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(document.activeElement).toBe(avatar);
  });

  it("removes the hamburger and opens the account sheet from the right", () => {
    authState.user = { email: "traveller@example.com" };
    const node = renderNavbar();

    expect(node.querySelector('[data-testid="navbar-hamburger"]')).toBeNull();
    expect(node.querySelector("#mobile-menu-drawer")).toBeNull();

    const avatar = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-avatar-trigger"]',
    );
    act(() => avatar?.click());

    const sheet = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(sheet).not.toBeNull();
    expect(sheet?.className).toContain("right-0");
    expect(sheet?.textContent).toContain("Collections");
    expect(sheet?.textContent).toContain("Itineraries");
    expect(sheet?.textContent).not.toContain("Trips");
    expect(sheet?.textContent).not.toContain("Passport");
    expect(sheet?.textContent).toContain("Edit Profile");
    expect(sheet?.textContent).toContain("Sign Out");
  });

  it("renders the signup CTA with the existing Japanese auth terminology", () => {
    localeState.locale = "ja";
    const node = renderNavbar();
    expect(
      node.querySelector<HTMLButtonElement>('[data-testid="navbar-signup-cta"]')
        ?.textContent,
    ).toBe("新規登録");
  });

  it("keeps desktop language switching and exposes the mobile language toggle", () => {
    const node = renderNavbar();
    const desktopLanguageContainer = node.querySelector<HTMLDivElement>(
      "div.relative.hidden.md\\:block",
    );
    expect(desktopLanguageContainer).not.toBeNull();

    const langToggle = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-mobile-language-toggle"]',
    );
    expect(langToggle).not.toBeNull();
    act(() => langToggle?.click());
    expect(localeState.setLocale).toHaveBeenCalledWith("ja");
  });

  it("closes the right-side account sheet with its accessible close control", () => {
    authState.user = { email: "traveller@example.com" };
    const node = renderNavbar();
    const avatar = node.querySelector<HTMLButtonElement>(
      '[data-testid="navbar-avatar-trigger"]',
    );
    act(() => avatar?.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    const close = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Close",
    );
    expect(close).not.toBeUndefined();
    act(() => (close as HTMLButtonElement | undefined)?.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders 4 consistent top-level navigation items on desktop", () => {
    const node = renderNavbar();
    const desktopNav = node.querySelector("nav.hidden.md\\:flex");
    expect(desktopNav).not.toBeNull();
    const links = desktopNav?.querySelectorAll("a");
    expect(links?.length).toBe(4);
    const hrefs = Array.from(links || []).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/destinations",
      "/collections",
      "/my-trips",
      "/passport",
    ]);
  });
});
