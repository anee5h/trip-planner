/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import RecentlyViewedRail from "../RecentlyViewedRail";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { getRecent } = vi.hoisted(() => ({ getRecent: vi.fn() }));

vi.mock("@/shared/hooks/useRecentlyViewedDestinations", () => ({
  useRecentlyViewedDestinations: getRecent,
}));

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
  getRecent.mockReset();
});

function renderRail(topMatchIds?: readonly string[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <section aria-label="Top matches">Top matches</section>
        <RecentlyViewedRail
          partySize={2}
          carMode="none"
          publicModes={["train"]}
          topMatchIds={topMatchIds}
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
    getRecent.mockReturnValue(recent);
    const container = renderRail();
    const sections = container.querySelectorAll("section");

    expect(sections).toHaveLength(2);
    expect(sections[0].textContent).toContain("Top matches");
    expect(sections[1].textContent).toContain("Continue exploring");
  });

  it("renders nothing when recent history is empty", () => {
    getRecent.mockReturnValue([]);
    const container = renderRail();

    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(container.textContent).not.toContain("Continue exploring");
  });

  it("prefers recent destinations outside Top matches when alternatives exist", () => {
    getRecent.mockReturnValue([
      { id: "top-match", name: "Top match" },
      { id: "alternative", name: "Alternative" },
    ] as Destination[]);
    const container = renderRail(["top-match"]);

    expect(
      Array.from(container.querySelectorAll('a[href^="/destinations/"]')).map(
        (link) => link.textContent,
      ),
    ).toEqual(["Alternative", "Top match"]);
  });
});
