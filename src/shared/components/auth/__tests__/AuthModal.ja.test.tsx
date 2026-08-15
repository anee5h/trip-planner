/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthModal } from "../AuthModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authMock = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    signInWithGoogle: authMock.signInWithGoogle,
    signInWithEmail: authMock.signInWithEmail,
    signUpWithEmail: authMock.signUpWithEmail,
    resetPasswordForEmail: authMock.resetPasswordForEmail,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      const jaMap: Record<string, string> = {
        "auth.signInTitle": "ログイン",
        "auth.signUpTitle": "アカウント登録",
        "auth.continueWithGoogle": "Googleでログイン",
        "auth.orContinueWithEmail": "またはメールアドレスでログイン",
        "auth.emailAddress": "メールアドレス",
        "auth.password": "パスワード",
        "auth.confirmEmailSent": "確認メールを送信しました。",
        "auth.errors.invalidCredentials":
          "メールアドレスまたはパスワードが正しくありません。",
        "auth.errors.generic":
          "認証エラーが発生しました。もう一度お試しください。",
        "actions.close": "閉じる",
      };
      return jaMap[key] ?? opts?.defaultValue ?? key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
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

describe("AuthModal — Japanese Localization", () => {
  it("renders Japanese labels, placeholders, and buttons", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <MemoryRouter>
          <AuthModal isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("ログイン");
    expect(text).toContain("Googleでログイン");
    expect(text).toContain("またはメールアドレスでログイン");

    const emailInput = document.body.querySelector("input[type='email']");
    expect(emailInput?.getAttribute("placeholder")).toBe("メールアドレス");
  });

  it("translates Supabase backend error to localized Japanese message", async () => {
    authMock.signInWithEmail.mockResolvedValueOnce({
      error: new Error("Invalid login credentials"),
    });

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <MemoryRouter>
          <AuthModal isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });

    const form = document.body.querySelector("form");
    expect(form).not.toBeNull();

    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain(
      "メールアドレスまたはパスワードが正しくありません。",
    );
    expect(text).not.toContain("Invalid login credentials");
  });
});
