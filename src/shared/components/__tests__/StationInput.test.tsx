/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StationInput from "../StationInput";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const setOriginLocation = vi.fn();
const locale = vi.hoisted(() => ({ value: "en" as "en" | "ja" }));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const translations = {
          en: {
            "origin.changeLocation": "Change origin location",
            "origin.closeLocationEditor": "Close location editor",
            "origin.selectBaseStation": "Select base station:",
            "origin.station": "Station",
            "origin.zipPostal": "ZIP / Postal",
            "origin.selectStation": "-- Select station --",
            "origin.zipPlaceholder": "e.g. 100-0001",
            "origin.locating": "Locating...",
            "origin.setLocation": "Set Location",
            "origin.cancel": "Cancel",
          },
          ja: {
            "origin.changeLocation": "出発地を変更",
            "origin.closeLocationEditor": "出発地の編集を閉じる",
            "origin.selectBaseStation": "出発駅を選択：",
            "origin.station": "駅",
            "origin.zipPostal": "郵便番号",
            "origin.selectStation": "-- 駅を選択 --",
            "origin.zipPlaceholder": "例：100-0001",
            "origin.locating": "検索中…",
            "origin.setLocation": "場所を設定",
            "origin.cancel": "キャンセル",
          },
        } as const;
        return (
          translations[locale.value][
            key as keyof (typeof translations)["en"]
          ] ?? key
        );
      },
    }),
  };
});

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    homeStation: "",
    setOriginLocation,
    canSelectOrigin: true,
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: locale.value, setLocale: vi.fn() }),
}));

const STATIONS: Record<
  string,
  Array<{ name: string; lat: number; lng: number }>
> = {
  Kanagawa: [
    { name: "Nakayama Station", lat: 35.5147, lng: 139.5393 },
    { name: "Shin-Yokohama Station", lat: 35.5076, lng: 139.6177 },
  ],
};

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("stations-by-prefecture")) {
      return { ok: true, json: async () => STATIONS };
    }
    return { ok: false, json: async () => [] };
  }),
);

let root: Root;
let host: HTMLDivElement;

function render(embedded = true) {
  act(() => root.render(<StationInput embedded={embedded} />));
}

function selectElement(
  container: HTMLElement,
  label: string,
): HTMLSelectElement {
  const selects = container.querySelectorAll("select");
  for (const sel of selects) {
    if (sel.querySelector(`option[value="${label}"]`)) return sel;
  }
  return selects[0] as HTMLSelectElement;
}

function setSelectValue(sel: HTMLSelectElement, value: string) {
  act(() => {
    sel.value = value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function clickSetButton(container: HTMLElement) {
  const buttons = container.querySelectorAll("button");
  const setBtn = Array.from(buttons).find((b) =>
    b.textContent?.includes("Set Location"),
  );
  act(() => {
    setBtn?.dispatchEvent(new Event("click", { bubbles: true }));
  });
}

beforeEach(() => {
  setOriginLocation.mockReset();
  locale.value = "en";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("StationInput — atomic origin selection", () => {
  it("renders location modal copy in the active locale", () => {
    render(false);

    expect(host.textContent).toContain("Select base station:");
    expect(host.textContent).toContain("ZIP / Postal");
    expect(host.textContent).toContain("Set Location");

    locale.value = "ja";
    render(false);

    expect(host.textContent).toContain("出発駅を選択：");
    expect(host.textContent).toContain("郵便番号");
    expect(host.textContent).toContain("場所を設定");
    expect(host.textContent).not.toContain("Select base station:");
    expect(
      host.querySelector("[aria-label='Close location editor']"),
    ).toBeNull();
    expect(
      host.querySelector("[aria-label='出発地の編集を閉じる']"),
    ).not.toBeNull();
  });

  it("selects Kanagawa and Nakayama, submits, and commits one atomic setOriginLocation", async () => {
    render();

    // Wait for stations JSON to load.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Select prefecture: Kanagawa
    const prefSelect = selectElement(host, "Kanagawa");
    setSelectValue(prefSelect, "Kanagawa");

    // Select station: Nakayama Station
    const stationSelect = selectElement(host, "Nakayama Station");
    setSelectValue(stationSelect, "Nakayama Station");

    // Submit
    await act(async () => {
      clickSetButton(host);
    });

    expect(setOriginLocation).toHaveBeenCalledTimes(1);
    expect(setOriginLocation).toHaveBeenCalledWith({
      label: "Nakayama Station, Kanagawa",
      coordinates: { lat: 35.5147, lng: 139.5393 },
      source: "station",
      transportZoneId: "mainland-honshu",
    });
  });

  it("selects Kanagawa and Shin-Yokohama, produces matching label and coordinates", async () => {
    render();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const prefSelect = selectElement(host, "Kanagawa");
    setSelectValue(prefSelect, "Kanagawa");

    const stationSelect = selectElement(host, "Shin-Yokohama Station");
    setSelectValue(stationSelect, "Shin-Yokohama Station");

    await act(async () => {
      clickSetButton(host);
    });

    expect(setOriginLocation).toHaveBeenCalledTimes(1);
    const call = setOriginLocation.mock.calls[0][0];
    expect(call.label).toBe("Shin-Yokohama Station, Kanagawa");
    expect(call.coordinates).toEqual({ lat: 35.5076, lng: 139.6177 });
    expect(call.source).toBe("station");
  });
});
