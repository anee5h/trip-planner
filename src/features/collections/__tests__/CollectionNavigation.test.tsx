import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CollectionDetails from "../CollectionDetails";
import CollectionGroupDetails from "../CollectionGroupDetails";

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
  default: ({ destination }: { destination: { id: string } }) => (
    <div data-testid="destination-card">{destination.id}</div>
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

function renderAt(
  entry: string,
  routePath: string,
  element: ReactNode,
  extraRoutes?: ReactNode,
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={routePath} element={element} />
          {extraRoutes}
        </Routes>
      </MemoryRouter>,
    );
  });
  return host;
}

function linkHrefs(host: HTMLDivElement): string[] {
  return Array.from(host.querySelectorAll<HTMLAnchorElement>("a")).map(
    (anchor) => anchor.getAttribute("href") ?? "",
  );
}

/** Group-card links: a destination page (single place) or a group page. */
function groupLinks(host: HTMLDivElement, collectionSlug: string): string[] {
  const groupPage = new RegExp(`^/collections/${collectionSlug}/\\d+$`);
  return linkHrefs(host).filter(
    (href) => href.startsWith("/destinations/") || groupPage.test(href),
  );
}

describe("CollectionDetails — UNESCO property grouping", () => {
  it("renders one group card per UNESCO property", () => {
    const host = renderAt(
      "/collections/unesco-japan",
      "/collections/:slug",
      <CollectionDetails />,
    );

    expect(groupLinks(host, "unesco-japan")).toHaveLength(27);
    // No destination cards are rendered on the grouped UNESCO page.
    expect(
      host.querySelectorAll('[data-testid="destination-card"]'),
    ).toHaveLength(0);
  });

  it("links single-place properties straight to their destination", () => {
    const host = renderAt(
      "/collections/unesco-japan",
      "/collections/:slug",
      <CollectionDetails />,
    );

    // Himeji-jo and Fujisan are single-record properties.
    expect(groupLinks(host, "unesco-japan")).toContain(
      "/destinations/himeji-castle",
    );
    expect(groupLinks(host, "unesco-japan")).toContain(
      "/destinations/mount-fuji",
    );
  });

  it("links multi-place properties to their group page", () => {
    const host = renderAt(
      "/collections/unesco-japan",
      "/collections/:slug",
      <CollectionDetails />,
    );

    // Ancient Kyoto (8 components) and the Kii Mountain Range (5 components).
    expect(groupLinks(host, "unesco-japan")).toContain(
      "/collections/unesco-japan/688",
    );
    expect(groupLinks(host, "unesco-japan")).toContain(
      "/collections/unesco-japan/1142",
    );
  });

  it("keeps the standard destination grid for non-UNESCO collections", () => {
    const host = renderAt(
      "/collections/japan-top-castles",
      "/collections/:slug",
      <CollectionDetails />,
    );

    expect(
      host.querySelectorAll('[data-testid="destination-card"]').length,
    ).toBeGreaterThan(0);
    expect(
      linkHrefs(host).some((href) =>
        href.startsWith("/collections/japan-top-castles/"),
      ),
    ).toBe(false);
  });
});

describe("CollectionGroupDetails — places of one UNESCO property", () => {
  it("lists every place of a multi-place property with a back link", () => {
    const host = renderAt(
      "/collections/unesco-japan/688",
      "/collections/:slug/:groupId",
      <CollectionGroupDetails />,
    );

    expect(host.textContent).toContain(
      "Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities)",
    );
    expect(
      host.querySelectorAll('[data-testid="destination-card"]'),
    ).toHaveLength(8);
    expect(linkHrefs(host)).toContain("/collections/unesco-japan");
  });

  it("redirects a single-place property straight to its destination", () => {
    const host = renderAt(
      "/collections/unesco-japan/661",
      "/collections/:slug/:groupId",
      <CollectionGroupDetails />,
      <Route
        path="/destinations/:id"
        element={<div data-testid="destination-page">destination-page</div>}
      />,
    );

    expect(
      host.querySelector('[data-testid="destination-page"]'),
    ).not.toBeNull();
    expect(
      host.querySelectorAll('[data-testid="destination-card"]'),
    ).toHaveLength(0);
  });

  it("shows the not-found state for an unknown property group", () => {
    const host = renderAt(
      "/collections/unesco-japan/9999",
      "/collections/:slug/:groupId",
      <CollectionGroupDetails />,
    );

    expect(host.textContent).toContain("ui.collectionNotFound");
    expect(linkHrefs(host)).toContain("/collections/unesco-japan");
  });
});
