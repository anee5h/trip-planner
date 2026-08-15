/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import { FeedbackModal } from "../FeedbackModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      const jaMap: Record<string, string> = {
        "feedbackModal.title": "フィードバックを送信",
        "feedbackModal.subtitle": "Megurutoの改善にご協力ください",
        "feedbackModal.typesLabel": "フィードバックの種類",
        "feedbackModal.types.general": "ご意見・感想",
        "feedbackModal.types.feature": "機能リクエスト",
        "feedbackModal.types.bug": "不具合の報告",
        "feedbackModal.messageLabel": "メッセージ",
        "feedbackModal.placeholder":
          "ご意見、ご要望、不具合の詳細などをお聞かせください...",
        "feedbackModal.cancel": "キャンセル",
        "feedbackModal.submit": "送信する",
        "feedbackModal.submitting": "送信中...",
        "feedbackModal.successToast":
          "フィードバックを送信しました。ご協力ありがとうございます。",
        "feedbackModal.errorGeneric":
          "フィードバックの送信に失敗しました。もう一度お試しください。",
        "feedbackModal.successTitle": "ご意見ありがとうございます！",
        "feedbackModal.successMessage":
          "フィードバックが正常に保存されました。",
        "feedbackModal.sendEmail": "メールでも送信する",
        "feedbackModal.done": "完了",
        "ui.close": "閉じる",
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
  root = undefined;
  host = undefined;
  document.body.innerHTML = "";
});

describe("FeedbackModal — Japanese Localization", () => {
  it("targets the configured beta feedback mailbox", async () => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);
    });

    const textarea =
      document.body.querySelector<HTMLTextAreaElement>("textarea");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "テスト");
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await vi.advanceTimersByTimeAsync(600);
    });

    const emailLink =
      document.body.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    expect(emailLink?.href).toMatch(/^mailto:info@meguruto\.app\?/);
    expect(emailLink?.href).not.toContain("@meguruto.jp");
    vi.useRealTimers();
  });

  it("renders Japanese title, feedback categories, placeholders, and buttons", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("フィードバックを送信");
    expect(text).toContain("Megurutoの改善にご協力ください");
    expect(text).toContain("フィードバックの種類");
    expect(text).toContain("ご意見・感想");
    expect(text).toContain("機能リクエスト");
    expect(text).toContain("不具合の報告");
    expect(text).toContain("メッセージ");
    expect(text).toContain("キャンセル");
    expect(text).toContain("送信する");

    const textarea = document.body.querySelector(
      "textarea[placeholder='ご意見、ご要望、不具合の詳細などをお聞かせください...']",
    );
    expect(textarea).not.toBeNull();
  });
});
