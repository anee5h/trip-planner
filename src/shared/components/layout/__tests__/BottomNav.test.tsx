import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import BottomNav from "../BottomNav";

const tripStoreState = vi.hoisted(() => ({
  compareList: [] as string[],
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    compareList: tripStoreState.compareList,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "navigation.home") return "Home";
      if (key === "navigation.explore") return "Explore";
      if (key === "navigation.trips") return "Trips";
      if (key === "navigation.passport") return "Passport";
      if (key === "search.label") return "Search";
      return key;
    },
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderBottomNav(initialEntries = ["/"]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={initialEntries}>
        <BottomNav />
      </MemoryRouter>,
    );
  });
  return host;
}

describe("BottomNav Component", () => {
  it("renders 5 mobile navigation items with correct labels and links", () => {
    const node = renderBottomNav(["/"]);
    const nav = node.querySelector("nav[aria-label='Mobile Navigation']");
    expect(nav).not.toBeNull();

    const links = node.querySelectorAll("a");
    expect(links.length).toBe(4); // Home, Explore, Trips, Passport (Search is a button)

    const homeLink = Array.from(links).find(
      (a) => a.getAttribute("href") === "/",
    );
    const exploreLink = Array.from(links).find(
      (a) => a.getAttribute("href") === "/destinations",
    );
    const tripsLink = Array.from(links).find(
      (a) => a.getAttribute("href") === "/my-trips",
    );
    const passportLink = Array.from(links).find(
      (a) => a.getAttribute("href") === "/passport",
    );

    expect(homeLink).not.toBeNull();
    expect(exploreLink).not.toBeNull();
    expect(tripsLink).not.toBeNull();
    expect(passportLink).not.toBeNull();

    const searchButton = node.querySelector("button[aria-label='Search']");
    expect(searchButton).not.toBeNull();
  });

  it("marks active page correctly with aria-current='page'", () => {
    const node = renderBottomNav(["/destinations"]);
    const exploreLink = Array.from(node.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/destinations",
    );
    expect(exploreLink?.getAttribute("aria-current")).toBe("page");

    const homeLink = Array.from(node.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/",
    );
    expect(homeLink?.getAttribute("aria-current")).toBeNull();
  });

  it("dispatches global search shortcut on search button click", () => {
    const node = renderBottomNav(["/"]);
    const searchButton = node.querySelector<HTMLButtonElement>(
      "button[aria-label='Search']",
    );

    let eventFired = false;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "k" && e.metaKey) {
        eventFired = true;
      }
    };
    window.addEventListener("keydown", listener);

    act(() => {
      searchButton?.click();
    });

    expect(eventFired).toBe(true);
    window.removeEventListener("keydown", listener);
  });

  it("hides bottom nav when compareList selection tray is active to avoid bar collision", () => {
    tripStoreState.compareList = ["kyoto-station", "osaka-station"];
    const node = renderBottomNav(["/"]);
    const nav = node.querySelector("nav[aria-label='Mobile Navigation']");
    expect(nav).toBeNull();
    tripStoreState.compareList = [];
  });
});
