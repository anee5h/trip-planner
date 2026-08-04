/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import { UnexploredNearbyRail } from "../UnexploredNearbyRail";
import type { Destination } from "@/shared/types/destination";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "home.unexploredNearby": "Unexplored places near you",
        "home.unexploredNearbyDescription":
          "Closest places you haven't visited yet",
        "home.viewAllUnexploredNearby": "View all nearby unexplored places",
        "home.viewAll": "View all",
        "home.transportModes.travel": "Travel",
        "home.transportModes.train": "Train",
        "home.transportModes.shinkansen": "Shinkansen",
        "home.transportModes.bus": "Bus",
        "home.transportModes.flight": "Flight",
        "home.transportModes.car": "Rental car",
        "home.transportModes.my_car": "Personal car",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    favorites: [],
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
    canMutateProfile: true,
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: (_props: { alt: string }) => null,
}));

function makeDestination(id: string, lat: number, lng: number): Destination {
  return {
    id,
    name: `Destination ${id}`,
    coordinates: { lat, lng },
    heroImage: "https://example.com/hero.jpg",
    prefecture: "Tokyo",
    categories: ["park"],
    tags: [],
    region: "Kanto",
    budgetMin: 500,
    budgetMax: 800,
    ratings: { overall: 8 },
    searchTokens: [],
    description: "",
    indoorPercent: 0,
    walkingMin: 30,
    season: { spring: 5, summer: 5, autumn: 5, winter: 5 },
    suitabilities: [],
    transportOptions: {},
    collections: [],
    imageMetadata: {
      license: "CC BY 4.0",
      attribution: "Test",
      sourceUrl: "https://example.com",
    },
  } as unknown as Destination;
}

const origin = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station
const origin2 = { lat: 35.4651, lng: 139.6224 }; // Yokohama

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderRail(props: {
  destinations: Destination[];
  homeStationCoords: { lat: number; lng: number } | null;
  isVisited: (id: string) => boolean;
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
}): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <UnexploredNearbyRail
          destinations={props.destinations}
          homeStationCoords={props.homeStationCoords}
          isVisited={props.isVisited}
          partySize={props.partySize ?? 2}
          carMode={props.carMode ?? "none"}
          publicModes={props.publicModes ?? ["train"]}
        />
      </MemoryRouter>,
    );
  });
  return host;
}

describe("UnexploredNearbyRail", () => {
  it("hides when homeStationCoords is null", () => {
    const container = renderRail({
      destinations: [makeDestination("a", 35.68, 139.77)],
      homeStationCoords: null,
      isVisited: () => false,
    });

    expect(container.querySelector("section")).toBeNull();
  });

  it("hides when all destinations are visited", () => {
    const container = renderRail({
      destinations: [makeDestination("a", 35.68, 139.77)],
      homeStationCoords: origin,
      isVisited: () => true,
    });

    expect(container.querySelector("section")).toBeNull();
  });

  it("excludes destinations without coordinates", () => {
    const noCoords = {
      ...makeDestination("b", 0, 0),
      id: "b",
      coordinates: null,
    } as unknown as Destination;

    const container = renderRail({
      destinations: [
        { ...makeDestination("a", 35.69, 139.78), id: "a" },
        noCoords,
      ],
      homeStationCoords: origin,
      isVisited: () => false,
    });

    const section = container.querySelector("section");
    expect(section).not.toBeNull();
    const links = section!.querySelectorAll<HTMLAnchorElement>(
      "a[href^='/destinations/']",
    );
    expect(links.length).toBe(1);
  });

  it("shows at most 5 destinations sorted by distance", () => {
    const dests = [
      makeDestination("far", 34.6937, 135.5023), // Osaka ~400km
      makeDestination("near", 35.69, 139.78), // ~2km
      makeDestination("mid", 35.44, 139.64), // Yokohama ~30km
      makeDestination("close", 35.672, 139.77), // ~1km
      makeDestination("mid2", 35.73, 139.74), // ~6km
      makeDestination("far2", 43.0621, 141.3544), // Sapporo ~830km
      makeDestination("near2", 35.685, 139.755), // ~1.5km
    ];

    const container = renderRail({
      destinations: dests,
      homeStationCoords: origin,
      isVisited: () => false,
    });

    const links = container.querySelectorAll<HTMLAnchorElement>(
      "a[href^='/destinations/']",
    );
    expect(links.length).toBe(5);

    // Check order: nearest first
    const ids = Array.from(links).map((a) =>
      a.getAttribute("href")!.split("/").pop()!,
    );
    expect(ids).toEqual(["close", "near2", "near", "mid2", "mid"]);
  });

  it("uses destination ID as tie-breaker for equal distances", () => {
    const samePoint = [
      { ...makeDestination("b", 35.69, 139.78), id: "b" },
      { ...makeDestination("c", 35.69, 139.78), id: "c" },
      { ...makeDestination("a", 35.69, 139.78), id: "a" },
    ];

    const container = renderRail({
      destinations: samePoint,
      homeStationCoords: origin,
      isVisited: () => false,
    });

    const links = container.querySelectorAll<HTMLAnchorElement>(
      "a[href^='/destinations/']",
    );
    const ids = Array.from(links).map((a) =>
      a.getAttribute("href")!.split("/").pop()!,
    );
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("excludes visited destinations", () => {
    const visitedId = "near";
    const dests = [
      makeDestination("far", 34.6937, 135.5023),
      makeDestination(visitedId, 35.69, 139.78),
      makeDestination("mid", 35.44, 139.64),
    ];

    const container = renderRail({
      destinations: dests,
      homeStationCoords: origin,
      isVisited: (id: string) => id === visitedId,
    });

    const links = container.querySelectorAll<HTMLAnchorElement>(
      "a[href^='/destinations/']",
    );
    const ids = Array.from(links).map((a) =>
      a.getAttribute("href")!.split("/").pop()!,
    );
    expect(ids).not.toContain(visitedId);
    expect(ids).toEqual(["mid", "far"]);
  });

  it("View all link points to /destinations?sort=nearest", () => {
    const container = renderRail({
      destinations: [makeDestination("a", 35.69, 139.78)],
      homeStationCoords: origin,
      isVisited: () => false,
    });

    const viewAllLink = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a"),
    ).find((a) => a.textContent === "View all");
    expect(viewAllLink?.getAttribute("href")).toBe(
      "/destinations?sort=nearest",
    );
  });

  it("updates when origin changes", () => {
    const dests = [
      makeDestination("yokohama", 35.4651, 139.6224),
      makeDestination("tokyo", 35.69, 139.78),
    ];

    // Render with Tokyo origin
    let container = renderRail({
      destinations: dests,
      homeStationCoords: origin,
      isVisited: () => false,
    });

    let links = container.querySelectorAll<HTMLAnchorElement>(
      "a[href^='/destinations/']",
    );
    let ids = Array.from(links).map((a) =>
      a.getAttribute("href")!.split("/").pop()!,
    );
    // From Tokyo, tokyo should be first
    expect(ids).toEqual(["tokyo", "yokohama"]);

    // Clean up
    act(() => root!.unmount());
    host?.remove();

    // Re-render with Yokohama origin
    container = renderRail({
      destinations: dests,
      homeStationCoords: origin2,
      isVisited: () => false,
    });

    links = container.querySelectorAll<HTMLAnchorElement>(
      "a[href^='/destinations/']",
    );
    ids = Array.from(links).map((a) =>
      a.getAttribute("href")!.split("/").pop()!,
    );
    // From Yokohama, yokohama should be first
    expect(ids).toEqual(["yokohama", "tokyo"]);
  });
});
