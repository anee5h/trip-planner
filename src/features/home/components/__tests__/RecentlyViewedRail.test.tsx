/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { orderRecentlyViewedDestinations } from "../../services/HomeRailService";
import RecentlyViewedRail from "../RecentlyViewedRail";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "home.continueExploring": "Continue exploring",
        "home.continueExploringDescription": "Pick up where you left off.",
        "home.viewAllContinueExploring":
          "View all recently viewed destinations",
        "home.previousRail": "Scroll left",
        "home.nextRail": "Scroll right",
      })[key] ?? key,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../HomeMatchCard", () => ({
  default: ({ destination }: { destination: Destination }) => (
    <a href={`/destinations/${destination.id}`}>{destination.name}</a>
  ),
}));

vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: () => null,
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderRail(destinations: readonly Destination[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <section aria-label="Top matches">Top matches</section>
        <RecentlyViewedRail
          destinations={destinations}
          partySize={2}
          carMode="none"
          publicModes={["train"]}
        />
      </MemoryRouter>,
    );
  });
  return host;
}

const recent = [
  { id: "himeji-castle", name: "Himeji Castle" },
] as unknown as Destination[];

describe("RecentlyViewedRail", () => {
  it("renders directly after Top matches when recent history exists", () => {
    const container = renderRail(recent);
    const sections = container.querySelectorAll("section");

    expect(sections).toHaveLength(2);
    expect(sections[0].textContent).toContain("Top matches");
    expect(sections[1].textContent).toContain("Continue exploring");
  });

  it("renders nothing when recent history is empty", () => {
    const container = renderRail([]);

    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(container.textContent).not.toContain("Continue exploring");
  });

  it("prefers recent destinations outside Top matches when alternatives exist", () => {
    const recentDestinations = [
      { id: "top-match", name: "Top match" },
      { id: "alternative", name: "Alternative" },
    ] as Destination[];
    const container = renderRail(
      orderRecentlyViewedDestinations(recentDestinations, ["top-match"]),
    );

    expect(
      Array.from(container.querySelectorAll('a[href^="/destinations/"]')).map(
        (link) => link.textContent,
      ),
    ).toEqual(["Alternative", "Top match"]);
  });

  it("exposes Continue Exploring IDs for discovery-rail deduplication", () => {
    const ordered = orderRecentlyViewedDestinations(
      [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
        { id: "C", name: "C" },
      ] as Destination[],
      [],
    );

    const container = renderRail(ordered);
    expect(
      Array.from(container.querySelectorAll('a[href^="/destinations/"]')).map(
        (link) => link.getAttribute("href")?.split("/").pop(),
      ),
    ).toEqual(["A", "B", "C"]);
  });
});
