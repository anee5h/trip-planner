/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Passport from "../Passport";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  user: { id: "user-a" } as { id: string } | null,
  authLoading: false,
  profileSyncStatus: "loading",
  retry: vi.fn(),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user, loading: state.authLoading }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    profileSyncStatus: state.profileSyncStatus,
    retryProfileHydration: state.retry,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/shared/components/ui/PageHeader", () => ({
  PageHeader: () => <div>passport-header</div>,
}));

vi.mock("@/shared/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));

vi.mock("../components/PassportNav", () => ({
  PassportNav: () => <div>passport-nav</div>,
}));

vi.mock("../components/PassportOverview", () => ({
  PassportOverview: () => <div>passport-overview</div>,
}));

vi.mock("../components/PassportJapanMap", () => ({
  PassportJapanMap: () => null,
}));
vi.mock("../components/PassportTimeline", () => ({
  PassportTimeline: () => null,
}));
vi.mock("../components/PassportAchievements", () => ({
  PassportAchievements: () => null,
}));
vi.mock("../components/PassportBadges", () => ({
  PassportBadges: () => null,
}));

let root: Root;
let host: HTMLDivElement;

function render() {
  act(() => root.render(<Passport />));
}

beforeEach(() => {
  state.user = { id: "user-a" };
  state.authLoading = false;
  state.profileSyncStatus = "loading";
  state.retry.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Passport hydration rendering", () => {
  it("hides Passport content while auth or profile hydration is loading", () => {
    render();

    expect(host.textContent).toContain("ui.passportLoading");
    expect(host.textContent).not.toContain("passport-nav");
    expect(host.textContent).not.toContain("passport-overview");
  });

  it("shows retry UI after hydration failure", () => {
    state.profileSyncStatus = "error";
    render();

    expect(host.textContent).toContain("ui.passportLoadError");
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "ui.retry",
    );
    act(() => retry?.click());
    expect(state.retry).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("passport-overview");
  });

  it.each(["ready", "saving"])(
    "renders hydrated Passport content while %s",
    (status) => {
      state.profileSyncStatus = status;
      render();
      expect(host.textContent).toContain("passport-overview");
    },
  );

  it("shows sign-in prompt when signed out", () => {
    state.user = null;
    state.authLoading = false;
    state.profileSyncStatus = "idle";
    render();
    expect(host.textContent).toContain("passport.signedOutTitle");
    expect(host.textContent).not.toContain("passport-overview");
  });
});
