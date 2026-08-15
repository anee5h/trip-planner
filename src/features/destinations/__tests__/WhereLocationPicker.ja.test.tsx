/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import WhereLocationPicker from "../components/WhereLocationPicker";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "ja", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      const jaMap: Record<string, string> = {
        "ui.anywhere": "すべての地域・都道府県",
        "ui.allRegionsAndPrefectures": "すべての地域・都道府県",
        "ui.location": "場所",
        "ui.region": "地域",
        "ui.prefecture": "都道府県",
        "ui.clear": "クリア",
        "ui.locationFilter": "場所フィルター",
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

describe("WhereLocationPicker — Japanese Localization", () => {
  it("renders Japanese regions and prefectures in dropdown", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <WhereLocationPicker
          selectedRegions={[]}
          setSelectedRegions={vi.fn()}
          selectedPrefectures={[]}
          setSelectedPrefectures={vi.fn()}
        />,
      );
    });

    const triggerBtn = host.querySelector("button");
    expect(triggerBtn).not.toBeNull();
    expect(triggerBtn?.textContent).toContain("すべての地域・都道府県");

    // Open dropdown
    act(() => {
      triggerBtn?.click();
    });

    const text = host.textContent ?? "";
    expect(text).toContain("地域");
    expect(text).toContain("都道府県");

    // Japanese region names
    expect(text).toContain("北海道");
    expect(text).toContain("東北");
    expect(text).toContain("関東");
    expect(text).toContain("中部");
    expect(text).toContain("関西");
    expect(text).toContain("中国地方");
    expect(text).toContain("四国");
    expect(text).toContain("九州");
    expect(text).toContain("沖縄");

    // Japanese prefecture names (Kanto is expanded by default)
    expect(text).toContain("東京都");
    expect(text).toContain("神奈川県");
    expect(text).toContain("千葉県");
    expect(text).toContain("埼玉県");
  });

  it("renders '中国地方' without duplicate '地方' suffix when Chugoku region is fully selected", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const chugokuPrefectures = [
      "Tottori",
      "Shimane",
      "Okayama",
      "Hiroshima",
      "Yamaguchi",
    ];

    act(() => {
      root!.render(
        <WhereLocationPicker
          selectedRegions={["Chugoku"]}
          setSelectedRegions={vi.fn()}
          selectedPrefectures={chugokuPrefectures}
          setSelectedPrefectures={vi.fn()}
        />,
      );
    });

    const triggerBtn = host.querySelector("button");
    expect(triggerBtn?.textContent).toContain("中国地方");
    expect(triggerBtn?.textContent).not.toContain("中国地方地方");
  });

  it("renders '関東地方' and '東京都' cleanly on trigger button", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const kantoPrefectures = [
      "Ibaraki",
      "Tochigi",
      "Gunma",
      "Saitama",
      "Chiba",
      "Tokyo",
      "Kanagawa",
    ];

    act(() => {
      root!.render(
        <WhereLocationPicker
          selectedRegions={["Kanto"]}
          setSelectedRegions={vi.fn()}
          selectedPrefectures={kantoPrefectures}
          setSelectedPrefectures={vi.fn()}
        />,
      );
    });

    const triggerBtn = host.querySelector("button");
    expect(triggerBtn?.textContent).toContain("関東地方");

    // Single prefecture
    act(() => {
      root!.render(
        <WhereLocationPicker
          selectedRegions={[]}
          setSelectedRegions={vi.fn()}
          selectedPrefectures={["Tokyo"]}
          setSelectedPrefectures={vi.fn()}
        />,
      );
    });

    const triggerBtnPref = host.querySelector("button");
    expect(triggerBtnPref?.textContent).toContain("東京都");
  });
});
