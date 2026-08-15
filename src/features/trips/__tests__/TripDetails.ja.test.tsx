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
  });
});
