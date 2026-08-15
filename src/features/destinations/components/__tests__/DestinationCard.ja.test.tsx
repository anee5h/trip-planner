/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import DestinationCard from "../DestinationCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tripStoreState = vi.hoisted(() => ({
  visited: false,
  comparing: false,
  canMutateProfile: true,
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    isVisited: () => tripStoreState.visited,
    isComparing: () => tripStoreState.comparing,
    toggleCompare: vi.fn(),
    compareList: [],
    homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    canMutateProfile: tripStoreState.canMutateProfile,
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "ja", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      const jaMap: Record<string, string> = {
        "destination.alreadyVisited": "訪問済み",
        "destination.markVisited": "訪問済みにする",
        "destination.markUnvisited": "未訪問に戻す",
        "destination.megurutoScore": "Megurutoスコア",
        "home.transportModes.train": "電車",
        "home.transportModes.travelUnavailable": "交通情報なし",
        "compare.driving": " · 車",
      };
      return jaMap[key] ?? opts?.defaultValue ?? key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} />
  ),
}));

vi.mock("@/features/trips/components/ItineraryPickerModal", () => ({
  ItineraryPickerModal: () => null,
}));
vi.mock("../MarkVisitedModal", () => ({ MarkVisitedModal: () => null }));
vi.mock("../VisitedDateModal", () => ({ VisitedDateModal: () => null }));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("DestinationCard — Japanese Localization", () => {
  const dest = destinations.find((d) => d.id === "kyoto-city") as Destination;

  it("renders Japanese action buttons, place names, and prefecture", () => {
    tripStoreState.visited = false;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <MemoryRouter>
          <DestinationCard destination={dest} />
        </MemoryRouter>,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("詳しく見る");

    // Japanese visited button aria-label
    const visitedBtn = host.querySelector(
      "button[aria-label='訪問済みにする']",
    );
    expect(visitedBtn).not.toBeNull();

    // Japanese add to itinerary button
    const addBtn = host.querySelector("button[aria-label='旅程に追加']");
    expect(addBtn).not.toBeNull();
  });

  it("renders Japanese '訪問済み' badge and '未訪問に戻す' button when visited", () => {
    tripStoreState.visited = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <MemoryRouter>
          <DestinationCard destination={dest} />
        </MemoryRouter>,
      );
    });

    const text = host.textContent ?? "";
    expect(text).toContain("訪問済み");

    const unvisitBtn = host.querySelector("button[aria-label='未訪問に戻す']");
    expect(unvisitBtn).not.toBeNull();
  });
});
