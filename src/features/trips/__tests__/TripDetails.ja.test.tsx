/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import TripDetails from "../TripDetails";
import type { Trip } from "@/shared/types/trip";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockTrip: Trip = {
  id: "test-trip-1",
  userId: "user-1",
  title: "Tokyo Weekend Trip",
  status: "planned",
  stops: [],
  journalNotes: "",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    getTrip: () => mockTrip,
    updateTrip: vi.fn(),
    deleteTrip: vi.fn(),
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "ja", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "ja" },
    t: (key: string, opts?: Record<string, any>) => {
      const jaMap: Record<string, string> = {
        "trips.status": "ステータス",
        "trips.statusLabels.planned": "計画中",
        "trips.statusLabels.completed": "完了",
        "trips.statusLabels.active": "進行中",
        "trips.statusLabels.draft": "下書き",
        "trips.journalNotes": "旅の記録・メモ",
        "trips.journalDescription":
          "旅の思い出、チケット情報、お店のメモなどを記録できます。",
        "trips.journalPlaceholder":
          "予約確認、電車のリンク、チケット情報などを入力...",
        "trips.saveJournal": "メモを保存",
        "trips.exportCalendar": "カレンダーに出力",
        "trips.printTrip": "旅程を印刷",
        "trips.copyTripLink": "旅程のリンクをコピー",
        "ui.noDatesSet": "日程未設定",
        "ui.back": "戻る",
        "ui.setDates": "日程を設定",
        "ui.editDates": "日程を編集",
        "ui.startDate": "開始日",
        "ui.endDate": "終了日",
        "ui.selectDate": "日付を選択",
        "ui.invalidDates": "開始日は終了日より前にしてください",
        "ui.save": "保存",
        "ui.cancel": "キャンセル",
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

describe("TripDetails — Japanese Localization", () => {
  it("renders localized status '計画中' instead of raw English enum", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <MemoryRouter>
          <TripDetails
            trip={mockTrip}
            onBack={vi.fn()}
            onUpdateTrip={vi.fn()}
            onAddStop={vi.fn()}
            onRemoveStop={vi.fn()}
            onReorderStops={vi.fn()}
          />
        </MemoryRouter>,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("ステータス");
    expect(text).toContain("計画中");
    expect(text).not.toContain("ステータス: planned");
    expect(host.querySelector('button[aria-label="戻る"]')).not.toBeNull();
  });

  it("uses the canonical trip date range in the editor", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const datedTrip = {
      ...mockTrip,
      status: "draft" as const,
      startDate: "2026-08-08",
      endDate: "2026-08-09",
    };

    act(() => {
      root!.render(
        <MemoryRouter>
          <TripDetails
            trip={datedTrip}
            onBack={vi.fn()}
            onUpdateTrip={vi.fn()}
            onAddStop={vi.fn()}
            onRemoveStop={vi.fn()}
            onReorderStops={vi.fn()}
          />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain("2026年8月8日〜9日");
    expect(host.textContent).toContain("日程を編集");
    expect(host.textContent).toContain("1日目 · 2026年8月8日");
    expect(host.textContent).toContain("2日目 · 2026年8月9日");
    expect(host.textContent).toContain("日程未設定");
    expect(host.textContent).not.toContain("下書き");
  });

  it("opens the canonical date editor and updates only trip dates", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const onUpdateTrip = vi.fn();

    act(() => {
      root!.render(
        <MemoryRouter>
          <TripDetails
            trip={{ ...mockTrip, status: "draft", startDate: "2026-08-08" }}
            onBack={vi.fn()}
            onUpdateTrip={onUpdateTrip}
            onAddStop={vi.fn()}
            onRemoveStop={vi.fn()}
            onReorderStops={vi.fn()}
          />
        </MemoryRouter>,
      );
    });

    expect(host!.textContent).toContain("2026年8月8日");
    expect(host!.textContent).not.toContain("〜9日");
    act(() =>
      host!
        .querySelector<HTMLButtonElement>("[data-trip-date-trigger]")
        ?.click(),
    );
    expect(host!.querySelector("[data-trip-dates-editor]")).not.toBeNull();

    const end = host!.querySelector<HTMLInputElement>('input[name="endDate"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(end, "2026-08-09");
      end.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() =>
      host!
        .querySelector<HTMLButtonElement>(
          '[data-trip-dates-editor] button[type="submit"]',
        )
        ?.click(),
    );

    expect(onUpdateTrip).toHaveBeenCalledWith({
      startDate: "2026-08-08",
      endDate: "2026-08-09",
    });
  });

  it("closes the date editor with Escape", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <MemoryRouter>
          <TripDetails
            trip={mockTrip}
            onBack={vi.fn()}
            onUpdateTrip={vi.fn()}
            onAddStop={vi.fn()}
            onRemoveStop={vi.fn()}
            onReorderStops={vi.fn()}
          />
        </MemoryRouter>,
      );
    });
    act(() =>
      host!
        .querySelector<HTMLButtonElement>("[data-trip-date-trigger]")
        ?.click(),
    );
    expect(host!.querySelector("[data-trip-dates-editor]")).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(host!.querySelector("[data-trip-dates-editor]")).toBeNull();
  });
});
