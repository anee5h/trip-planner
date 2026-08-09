/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "../OnboardingFlow";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const store: Record<string, string> = {};
const lsMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (idx: number) => Object.keys(store)[idx] ?? null,
};
Object.defineProperty(globalThis, "localStorage", {
  value: lsMock,
  writable: true,
});

const state = vi.hoisted(() => ({
  userId: "user-a" as string | null,
  userMeta: {} as Record<string, unknown>,
  updateError: null as { message: string } | null,
  locale: "en" as "en" | "ja",
  updateProfileMock: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    user: state.userId
      ? { id: state.userId, user_metadata: state.userMeta }
      : null,
    loading: false,
    updateUserProfile: state.updateProfileMock,
  }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    savedHomeStation: "Tokyo Station",
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({
    locale: state.locale,
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/shared/components/StationInput", () => ({
  default: () => null,
}));

vi.mock("@/shared/components/ui/SearchableDestinationPicker", () => ({
  SearchableDestinationPicker: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let root: Root;
let host: HTMLDivElement;

function render() {
  act(() => root.render(<OnboardingFlow />));
}

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}

beforeEach(() => {
  lsMock.clear();
  state.userId = "user-a";
  state.userMeta = {};
  state.updateError = null;
  state.locale = "en";
  state.updateProfileMock = vi.fn(async () => ({
    error: state.updateError,
  }));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  lsMock.clear();
});

describe("OnboardingFlow", () => {
  it("shows onboarding for a new user", () => {
    render();
    expect(document.body.textContent).toContain("onboarding.accountTitle");
  });

  it("does not show onboarding after skip", () => {
    render();
    const skipBtn = findButton("onboarding.skip");
    act(() => skipBtn?.click());
    expect(document.body.textContent).not.toContain("onboarding.accountTitle");
  });

  it("does not re-show onboarding for skipped user after re-render", () => {
    render();
    const skipBtn = findButton("onboarding.skip");
    act(() => skipBtn?.click());
    act(() => root.unmount());
    host.remove();

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    render();
    expect(document.body.textContent).not.toContain("onboarding.accountTitle");
  });

  it("shows onboarding for user B after user A skipped", () => {
    render();
    const skipBtn = findButton("onboarding.skip");
    act(() => skipBtn?.click());
    act(() => root.unmount());
    host.remove();

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    state.userId = "user-b";
    render();
    expect(document.body.textContent).toContain("onboarding.accountTitle");
  });

  it("resets and re-evaluates when user switches in the same mounted root", () => {
    // User A sees and skips onboarding
    render();
    expect(document.body.textContent).toContain("onboarding.accountTitle");
    const skipBtn = findButton("onboarding.skip");
    act(() => skipBtn?.click());
    expect(document.body.textContent).not.toContain("onboarding.accountTitle");

    // Switch to user B without unmounting
    state.userId = "user-b";
    state.userMeta = {};
    act(() => root.render(<OnboardingFlow />));
    // User B should see onboarding (different user, clean state)
    expect(document.body.textContent).toContain("onboarding.accountTitle");

    // Switch back to user A without unmounting
    state.userId = "user-a";
    act(() => root.render(<OnboardingFlow />));
    // User A should NOT see onboarding (already skipped)
    expect(document.body.textContent).not.toContain("onboarding.accountTitle");
  });

  it("resets form fields on user switch so User B cannot inherit User A unsaved data", () => {
    // User A types a name but does NOT save
    render();
    const nameInput = document.body.querySelector("input");
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(nameInput, "Alice");
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect((nameInput as HTMLInputElement)?.value).toBe("Alice");

    // Switch to User B without unmounting
    state.userId = "user-b";
    state.userMeta = {};
    act(() => root.render(<OnboardingFlow />));

    // User B's full name input should be blank (clean defaults)
    const nameInputB = document.body.querySelector("input");
    expect((nameInputB as HTMLInputElement)?.value).toBe("");
  });

  it("does not advance on save error and shows feedback", async () => {
    state.updateError = { message: "Network error" };
    render();

    const continueBtn = findButton("onboarding.continue");
    await act(async () => continueBtn?.click());

    expect(document.body.textContent).toContain("onboarding.accountTitle");
    expect(document.body.textContent).toContain("Network error");
  });

  it("advances to preferences on successful account save", async () => {
    render();
    const continueBtn = findButton("onboarding.continue");
    await act(async () => continueBtn?.click());
    expect(document.body.textContent).toContain("onboarding.preferencesTitle");
  });

  it("does not show for existing user with preferences_set metadata", () => {
    state.userMeta = { preferences: { preferences_set: true } };
    render();
    // Should not show onboarding, no localStorage key yet
    expect(document.body.textContent).not.toContain("onboarding.accountTitle");
    // Completion marker should be persisted locally
    const stored = JSON.parse(
      localStorage.getItem("meguruto-onboarding-v2-user-a") || "{}",
    );
    expect(stored.completed).toBe(true);
  });

  it("does not show for skipped user after re-render with preferences_set", () => {
    // First skip
    render();
    const skipBtn = findButton("onboarding.skip");
    act(() => skipBtn?.click());

    // Set preferences_set and re-render
    state.userMeta = { preferences: { preferences_set: true } };
    state.userId = "user-a";
    act(() => root.render(<OnboardingFlow />));
    expect(document.body.textContent).not.toContain("onboarding.accountTitle");
  });

  it("shows onboarding for new user without preferences_set", () => {
    state.userMeta = { preferences: {} };
    render();
    expect(document.body.textContent).toContain("onboarding.accountTitle");
  });

  it("account switching still works with preferences_set check", () => {
    // User A: existing with preferences_set
    state.userMeta = { preferences: { preferences_set: true } };
    render();
    expect(document.body.textContent).not.toContain("onboarding.accountTitle");

    // Switch to User B: new user
    state.userId = "user-b";
    state.userMeta = {};
    act(() => root.render(<OnboardingFlow />));
    expect(document.body.textContent).toContain("onboarding.accountTitle");
  });
});
