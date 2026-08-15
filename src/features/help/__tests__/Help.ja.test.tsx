/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import Help from "../Help";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "ja", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      const jaMap: Record<string, string> = {
        "help.title": "ヘルプセンター",
        "help.subtitle": "ドキュメント＆サポート",
        "help.description":
          "機能の使い方、キーボードショートカット、リリースノートの確認やフィードバックの送信ができます。",
        "help.sendFeedback": "フィードバックを送信",
        "help.searchPlaceholder":
          "ヘルプトピック、よくある質問、ショートカットを検索...",
        "help.clearSearch": "クリア",
        "help.sections.gettingStarted": "はじめてガイド",
        "help.sections.faq": "よくある質問",
        "help.sections.shortcuts": "キーボードショートカット",
        "help.sections.changelog": "更新履歴",
        "help.gettingStarted.title": "Megurutoの使い方",
        "help.gettingStarted.subtitle":
          "日本の旅を最大限に楽しむための3つのステップ。",
        "help.gettingStarted.step1Title": "見つける・保存する",
        "help.gettingStarted.step1Description":
          "日本各地の見どころやユネスコ遺産コレクションを探索。行きたい場所を行きたいリストに保存しましょう。",
        "help.gettingStarted.step2Title": "旅程を計画する",
        "help.gettingStarted.step2Description":
          "「旅程」で毎日の旅行プランを作成。設定で出発地を登録すれば、正確な移動時間を計算できます。",
        "help.gettingStarted.step3Title": "旅の記録を残す",
        "help.gettingStarted.step3Description":
          "訪れたスポットを「パスポート」に記録。日本地図を塗りつぶし、達成バッジを獲得しましょう。",
        "help.faq.title": "よくある質問",
        "help.faq.subtitle": "Megurutoに関する一般的な質問と回答。",
        "help.faq.items.visited.question":
          "目的地や観光地を訪問済みにするにはどうすればよいですか？",
        "help.faq.items.visited.answer":
          "目的地の詳細ページやカードの「訪問済みにする」チェックボタンをクリックしてください。",
        "help.faq.items.baseLocation.question":
          "出発地設定はどのように機能しますか？",
        "help.faq.items.baseLocation.answer":
          "設定 > 一般 で出発地を設定できます。",
        "help.faq.items.achievements.question":
          "実績とバッジの違いは何ですか？",
        "help.faq.items.achievements.answer":
          "実績はユネスコ世界遺産などの公式な文化的指標を表します。",
        "help.faq.items.calendar.question":
          "旅程をGoogleカレンダーにエクスポートするにはどうすればよいですか？",
        "help.faq.items.calendar.answer":
          "カレンダーに出力ボタンをクリックしてください。",
        "help.shortcuts.title": "キーボードショートカット一覧",
        "help.shortcuts.subtitle":
          "ショートカットを使ってMegurutoを素早く操作できます。",
        "help.shortcuts.globalSearch": "グローバル検索・コマンドパレットを開く",
        "help.shortcuts.closeDialog":
          "コマンドパレットやモーダル／メニューを閉じる",
        "help.shortcuts.navigateItems": "検索結果やリストの項目を上下に移動",
        "help.shortcuts.selectItem": "選択中の項目またはアクションを実行",
        "help.changelog.title": "リリース履歴＆更新情報",
        "help.changelog.subtitle": "Megurutoに追加された最新の機能と改善内容。",
        "help.changelog.version152Title":
          "バージョン 1.5.2 — デザインシステム＆UIのブラッシュアップ",
        "help.changelog.version152Date": "2026年7月",
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
});

describe("Help Page — Japanese Localization", () => {
  it("renders Japanese page title, description, navigation, and getting started steps", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <MemoryRouter>
          <Help />
        </MemoryRouter>,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("ヘルプセンター");
    expect(text).toContain("ドキュメント＆サポート");
    expect(text).toContain("フィードバックを送信");
    expect(text).toContain("はじめてガイド");
    expect(text).toContain("よくある質問");
    expect(text).toContain("キーボードショートカット");
    expect(text).toContain("更新履歴");
    expect(text).toContain("Megurutoの使い方");
    expect(text).toContain("見つける・保存する");
    expect(text).toContain("旅程を計画する");
    expect(text).toContain("旅の記録を残す");

    const searchInput = host.querySelector(
      "input[placeholder='ヘルプトピック、よくある質問、ショートカットを検索...']",
    );
    expect(searchInput).not.toBeNull();
  });

  it("switches to FAQ section and displays Japanese FAQs", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <MemoryRouter>
          <Help />
        </MemoryRouter>,
      );
    });

    const faqButton = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("よくある質問"),
    );
    expect(faqButton).not.toBeUndefined();

    act(() => {
      faqButton?.click();
    });

    const text = host.textContent ?? "";
    expect(text).toContain("よくある質問");
    expect(text).toContain(
      "目的地や観光地を訪問済みにするにはどうすればよいですか？",
    );
  });
});
