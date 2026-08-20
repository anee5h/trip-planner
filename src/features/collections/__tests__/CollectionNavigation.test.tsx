import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CollectionDetails from "../CollectionDetails";

// react-dom 19 requires this flag for act(); existing component tests set it
// at module scope (e.g. Home.test.tsx). The global is not typed, so assign
// through a named const instead of an inline member cast.
const testGlobals = globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({ visited: [] }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
  }),
}));

vi.mock("@/features/destinations/components/DestinationCard", () => ({
  default: ({
    destination,
  }: {
    destination: {
      id: string;
      virtualGroup?: {
        name: string;
        badgeKey: string;
        placeCount: number;
        href: string;
      };
    };
  }) => (
    <div data-testid="destination-card">
      <span data-testid="dest-id">{destination.id}</span>
      {destination.virtualGroup && (
        <>
          <a data-testid="group-link" href={destination.virtualGroup.href}>
            {destination.virtualGroup.name}
          </a>
          <span data-testid="group-count">
            {destination.virtualGroup.placeCount}
          </span>
          <span data-testid="group-badge">
            {destination.virtualGroup.badgeKey}
          </span>
        </>
      )}
    </div>
  ),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

async function renderAt(entry: string, element: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/collections/:slug" element={element} />
        </Routes>
      </MemoryRouter>,
    );
    // Flush the lite-catalogue microtask (useLiteCatalogueReady resolves
    // via loadLiteIndex's promise).
    await Promise.resolve();
  });
  return host;
}

function groupLinks(host: HTMLDivElement): string[] {
  return Array.from(
    host.querySelectorAll<HTMLAnchorElement>('[data-testid="group-link"]'),
  ).map((anchor) => anchor.getAttribute("href") ?? "");
}

function cardIds(host: HTMLDivElement): string[] {
  return Array.from(host.querySelectorAll('[data-testid="dest-id"]')).map(
    (node) => node.textContent ?? "",
  );
}

describe("CollectionDetails — UNESCO property groups", () => {
  it("renders one virtual group card per UNESCO property (27)", async () => {
    const host = await renderAt(
      "/collections/unesco-japan",
      <CollectionDetails />,
    );

    expect(cardIds(host)).toHaveLength(27);
    expect(cardIds(host).every((id) => id.startsWith("unesco-property-"))).toBe(
      true,
    );
    expect(host.querySelectorAll('[data-testid="group-badge"]').length).toBe(
      27,
    );
  });

  it("links single-place properties straight to their destination", async () => {
    const host = await renderAt(
      "/collections/unesco-japan",
      <CollectionDetails />,
    );

    expect(groupLinks(host)).toContain("/destinations/himeji-castle");
    expect(groupLinks(host)).toContain("/destinations/mount-fuji");
    expect(groupLinks(host)).toContain("/destinations/genbaku-dome");
  });

  it("links multi-place properties to the collection listing surface", async () => {
    const host = await renderAt(
      "/collections/unesco-japan",
      <CollectionDetails />,
    );

    expect(groupLinks(host)).toContain(
      "/collections/unesco-japan?property=688",
    );
    expect(groupLinks(host)).toContain(
      "/collections/unesco-japan?property=1142",
    );
  });

  it("carries the badge key and per-property place counts on group cards", async () => {
    const host = await renderAt(
      "/collections/unesco-japan",
      <CollectionDetails />,
    );

    const badges = Array.from(
      host.querySelectorAll('[data-testid="group-badge"]'),
    ).map((node) => node.textContent);
    expect(badges.every((badge) => badge === "ui.unescoBadge")).toBe(true);

    const kyotoIndex = cardIds(host).indexOf("unesco-property-688");
    const himejiIndex = cardIds(host).indexOf("unesco-property-661");
    const counts = Array.from(
      host.querySelectorAll('[data-testid="group-count"]'),
    ).map((node) => node.textContent);
    expect(counts[kyotoIndex]).toBe("8");
    expect(counts[himejiIndex]).toBe("1");
  });

  it("shows exactly the property's places in the group view", async () => {
    const host = await renderAt(
      "/collections/unesco-japan?property=688",
      <CollectionDetails />,
    );

    expect(cardIds(host).sort()).toEqual(
      [
        "nijo-castle-kyoto",
        "kinkaku-ji",
        "byodoin-temple",
        "enryaku-ji-mount-hiei",
        "ginkaku-ji",
        "uji-tea-culture-center",
        "ninna-ji",
        "ryoan-ji",
      ].sort(),
    );
    expect(host.querySelectorAll('[data-testid="group-link"]')).toHaveLength(0);
    // Back link returns to the whole collection.
    expect(
      Array.from(host.querySelectorAll<HTMLAnchorElement>("a")).some(
        (anchor) => anchor.getAttribute("href") === "/collections/unesco-japan",
      ),
    ).toBe(true);
  });

  it("falls back to the group overview for an unknown property id", async () => {
    const host = await renderAt(
      "/collections/unesco-japan?property=9999",
      <CollectionDetails />,
    );

    expect(cardIds(host)).toHaveLength(27);
  });

  it("keeps the ordinary destination grid for non-UNESCO collections", async () => {
    const host = await renderAt(
      "/collections/japan-top-castles",
      <CollectionDetails />,
    );

    expect(cardIds(host).length).toBeGreaterThan(0);
    expect(
      cardIds(host).every((id) => !id.startsWith("unesco-property-")),
    ).toBe(true);
    expect(host.querySelectorAll('[data-testid="group-link"]')).toHaveLength(0);
  });
});
