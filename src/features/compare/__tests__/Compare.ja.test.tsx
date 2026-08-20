/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  beforeAll,
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { loadLiteIndex, loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import Compare from "../Compare";
import CompareModal from "../components/CompareModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const compareState = vi.hoisted(() => ({
  compareList: ["kyoto-city", "osaka-city"],
  toggleCompare: vi.fn(),
  clearCompare: vi.fn(),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    compareList: compareState.compareList,
    toggleCompare: compareState.toggleCompare,
    clearCompare: compareState.clearCompare,
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "ja", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      const jaMap: Record<string, string> = {
        "compare.features": "特徴",
        "compare.overallScore": "総合スコア",
        "compare.budgetRecommended": "おすすめ予算",
        "compare.travelTime": "所要時間",
        "compare.walkIntensity": "歩行量",
        "compare.coupleScore": "カップル向け",
        "compare.summerComfort": "夏の快適度",
        "compare.vibeTags": "雰囲気タグ",
        "compare.viewDetails": "詳細を見る",
        "compare.best": "最良",
        "compare.lowest": "最安",
        "compare.fastest": "最速",
        "compare.highest": "最高",
        "compare.score": "スコア",
        "compare.budget": "予算",
        "compare.travel": "移動時間",
        "compare.walk": "歩行量",
        "compare.couple": "カップル",
        "compare.top": "上位",
        "compare.removeFromCompare": "比較から削除",
        "compare.closeModal": "比較モーダルを閉じる",
        "compare.unavailable": "比較情報なし",
        "compare.attraction": "観光スポット",
        "ui.compare": "比較",
        "ui.of": "/",
        "ui.destinations": "目的地",
        "ui.clearAll": "すべてクリア",
        "ui.view": "詳細を見る",
        "home.transportModes.train": "電車",
        "home.transportModes.shinkansen": "新幹線",
        "home.transportModes.bus": "バス",
        "home.transportModes.car": "車",
        "home.transportModes.my_car": "マイカー",
      };
      return jaMap[key] ?? opts?.defaultValue ?? key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

// KAI-121: full catalogue is runtime-lazy; preload so
// useFullCatalogue renders full data synchronously in tests.
beforeAll(async () => {
  await loadDestinationsIndex();
  await loadLiteIndex();
});

beforeEach(() => {
  compareState.compareList = ["kyoto-city", "osaka-city"];
  compareState.toggleCompare.mockClear();
  compareState.clearCompare.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("Compare Page & Modal — Japanese Localization", () => {
  it("renders Japanese table headers, metrics, vibe tags, and place labels on Compare page without overall score", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <Compare />
        </MemoryRouter>,
      );
    await Promise.resolve();
    });

    const text = host.textContent ?? "";
    expect(text).toContain("特徴");
    expect(text).toContain("おすすめ予算");
    expect(text).toContain("所要時間");
    expect(text).toContain("歩行量");
    expect(text).toContain("カップル向け");
    expect(text).toContain("夏の快適度");
    expect(text).toContain("雰囲気タグ");
    expect(text).toContain("詳細を見る");

    // Post-KAI-89: Numeric overall destination score is hidden
    expect(text).not.toContain("総合スコア");

    // Japanese place names / prefectures rendered
    expect(text).toContain("京都");
    expect(text).toContain("大阪");

    // Japanese vibe tags rendered instead of raw English tags
    expect(text).toContain("古都");
    expect(text).toContain("京都市");
    expect(text).toContain("道頓堀");
    expect(text).toContain("たこ焼きの本場");

    // Japanese travel time and mode rendered instead of raw English "min (shinkansen)"
    expect(text).toContain("130分（新幹線）");
    expect(text).not.toContain("130 min");
    expect(text).not.toContain("(shinkansen)");
    expect(text).not.toContain("(train)");
  });

  it("renders '比較情報なし' when destination travel time is unavailable", async () => {
    // hiroshima-peace-memorial has transportOptions: {}
    compareState.compareList = ["kyoto-city", "hiroshima-peace-memorial"];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <Compare />
        </MemoryRouter>,
      );
    await Promise.resolve();
    });

    const text = host.textContent ?? "";
    expect(text).toContain("比較情報なし");
    expect(text).not.toContain("N/A");
  });

  it("renders Japanese comparison metrics, category, and buttons in CompareModal without overall score", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <CompareModal isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("比較");
    expect(text).not.toContain("総合スコア");
    expect(text).toContain("予算");
    expect(text).toContain("移動時間");
    expect(text).toContain("歩行量");
    expect(text).toContain("カップル");
    expect(text).toContain("詳細を見る");
    expect(text).toContain("すべてクリア");

    // Japanese modal travel time (分 instead of m)
    expect(text).toContain("130分");
    expect(text).not.toContain("130m");

    // Close button has Japanese aria-label
    const closeBtn = host.querySelector(
      "button[aria-label='比較モーダルを閉じる']",
    );
    expect(closeBtn).not.toBeNull();
  });
});
