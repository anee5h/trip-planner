/**
 * KAI-199: Explore must never present the empty catalogue while an
 * authoritative full sort catalogue is still loading.
 *
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import liteCatalogue from "@/shared/data/destinations-index.lite.json";
import fullCatalogue from "@/shared/data/destinations-index.json";
import Destinations from "../Destinations";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const catalogueMock = vi.hoisted(() => ({
  summaryPlaces: [] as Destination[],
  fullPlaces: [] as Destination[],
  fullStatus: "loading" as "loading" | "ready" | "error",
  fullError: null as Error | null,
  fullDeferred: null as Deferred<Destination[]> | null,
  fullRequestCount: 0,
}));

vi.mock("@/shared/hooks/useCatalogue", async () => {
  const React = await import("react");
  return {
    useCatalogue: ({
      need,
      enabled = true,
    }: {
      need: "summary" | "full";
      enabled?: boolean;
    }) => {
      const [, forceRender] = React.useState(0);
      const promise =
        need === "full" && enabled ? catalogueMock.fullDeferred?.promise : null;

      React.useEffect(() => {
        if (!promise) return;
        catalogueMock.fullRequestCount += 1;
        promise.then(
          (places) => {
            catalogueMock.fullPlaces = places;
            catalogueMock.fullStatus = "ready";
            catalogueMock.fullError = null;
            forceRender((value) => value + 1);
          },
          (reason) => {
            catalogueMock.fullStatus = "error";
            catalogueMock.fullError =
              reason instanceof Error ? reason : new Error(String(reason));
            forceRender((value) => value + 1);
          },
        );
      }, [promise]);

      if (!enabled) {
        return { status: "idle", places: [], error: null, retry: vi.fn() };
      }
      if (need === "summary") {
        return {
          status: "ready",
          places: catalogueMock.summaryPlaces,
          error: null,
          retry: vi.fn(),
        };
      }
      return {
        status: catalogueMock.fullStatus,
        places: catalogueMock.fullPlaces,
        error: catalogueMock.fullError,
        retry: () => {
          catalogueMock.fullStatus = "loading";
          catalogueMock.fullError = null;
          catalogueMock.fullPlaces = [];
          catalogueMock.fullDeferred = (() => {
            let resolve!: (value: Destination[]) => void;
            let reject!: (reason?: unknown) => void;
            const promise = new Promise<Destination[]>((res, rej) => {
              resolve = res;
              reject = rej;
            });
            return { promise, resolve, reject };
          })();
          forceRender((value) => value + 1);
        },
      };
    },
  };
});

vi.mock("@/shared/services/place/PlaceCatalog", () => ({
  getLocalizedPlace: (destination: Destination) => destination,
}));

vi.mock("@/shared/services/recommendation/RecommendationPipeline", () => ({
  buildRecommendationCandidate: (destination: Destination) => destination,
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    homeStation: undefined,
    homeStationCoords: null,
    homeStationTransportZoneId: undefined,
    originSource: "none",
    destinationRatings: {},
  }),
}));
vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en" }),
}));
vi.mock("@/features/home/hooks/useWeatherContext", () => ({
  useWeatherContext: () => ({ weatherContext: { forecastMap: undefined } }),
}));
vi.mock("@/shared/components/StationInput", () => ({ default: () => null }));
vi.mock("@/shared/components/ui/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("../components/DestinationFilters", () => ({
  default: ({
    sortBy,
    setSortBy,
    sortLoading,
  }: {
    sortBy: string;
    setSortBy: (value: string) => void;
    sortLoading?: boolean;
  }) => (
    <div>
      <button
        type="button"
        data-sort-control
        data-sort-loading={sortLoading || undefined}
        onClick={() => setSortBy("recommended")}
      >
        {sortBy}
      </button>
    </div>
  ),
}));
vi.mock("../components/DestinationCard", () => ({
  default: ({ destination }: { destination: Destination }) => (
    <div data-card>{destination.id}</div>
  ),
}));
vi.mock("../components/DestinationMap", () => ({ default: () => null }));
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number | string>) => {
      if (key === "ui.destinationsMatching")
        return `${options?.count ?? 0} destinations matching`;
      if (key === "ui.noDestinationsFound")
        return "No destinations match the selected filters.";
      if (key === "ui.noDestinationsFoundHint")
        return "Try adjusting your search terms.";
      if (key === "ui.destinations") return "Destinations";
      return key;
    },
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  catalogueMock.summaryPlaces = liteCatalogue as unknown as Destination[];
  catalogueMock.fullPlaces = [];
  catalogueMock.fullStatus = "loading";
  catalogueMock.fullError = null;
  catalogueMock.fullDeferred = deferred<Destination[]>();
  catalogueMock.fullRequestCount = 0;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

async function render(entry: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <Destinations />
      </MemoryRouter>,
    );
    await Promise.resolve();
  });
  return host;
}

function resultCount(container: HTMLDivElement): string {
  return container.querySelector("#results-grid")?.textContent ?? "";
}

describe("deferred full catalogue sort loading", () => {
  it("keeps summary results visible and atomically replaces them after full data arrives", async () => {
    const container = await render("/destinations?sort=walking");

    expect(container.querySelectorAll("[data-card]")).toHaveLength(20);
    expect(resultCount(container)).toContain("1095 destinations matching");
    expect(resultCount(container)).not.toMatch(/^0 destinations/);
    expect(resultCount(container)).not.toContain("No destinations");
    expect(container.querySelector("[data-sort-loading]")).not.toBeNull();

    await act(async () => {
      catalogueMock.fullDeferred!.resolve(
        fullCatalogue as unknown as Destination[],
      );
      await catalogueMock.fullDeferred!.promise;
    });

    expect(container.querySelector("[data-sort-loading]")).toBeNull();
    expect(resultCount(container)).toContain("1095 destinations matching");
    expect(container.querySelectorAll("[data-card]")).toHaveLength(20);
  });

  it("shows an explicit full-catalogue error and supports retry", async () => {
    const container = await render("/destinations?sort=walking");

    await act(async () => {
      catalogueMock.fullDeferred!.reject(
        new Error("full catalogue unavailable"),
      );
      await expect(catalogueMock.fullDeferred!.promise).rejects.toThrow(
        "full catalogue unavailable",
      );
    });

    expect(container.querySelector("[data-catalogue-error]")).not.toBeNull();
    expect(resultCount(container)).not.toMatch(/^0 destinations/);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-catalogue-error] button")!
        .click();
      await Promise.resolve();
    });

    expect(container.querySelector("[data-catalogue-error]")).toBeNull();
    expect(container.querySelector("[data-sort-loading]")).not.toBeNull();

    await act(async () => {
      catalogueMock.fullDeferred!.resolve(
        fullCatalogue as unknown as Destination[],
      );
      await catalogueMock.fullDeferred!.promise;
    });
    expect(container.querySelector("[data-sort-loading]")).toBeNull();
    expect(resultCount(container)).toContain("1095 destinations matching");
  });

  it("can switch back to Recommended while full sorting is still pending", async () => {
    const container = await render("/destinations?sort=walking");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-sort-control]")!
        .click();
      await Promise.resolve();
    });

    expect(container.querySelector("[data-sort-loading]")).toBeNull();
    expect(resultCount(container)).toContain("1095 destinations matching");
  });

  it("normalizes a legacy Budget URL without requesting the full catalogue", async () => {
    const container = await render("/destinations?sort=budget");

    expect(container.querySelector("[data-sort-control]")?.textContent).toBe(
      "recommended",
    );
    expect(container.querySelector("[data-sort-loading]")).toBeNull();
    expect(catalogueMock.fullRequestCount).toBe(0);
    expect(container.querySelectorAll("[data-card]")).toHaveLength(20);
    expect(resultCount(container)).toContain("1095 destinations matching");
  });
});
