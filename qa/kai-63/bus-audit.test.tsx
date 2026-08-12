/**
 * KAI-63: Bus eligibility audit — reproduce Explore counts and decompose
 * every exclusion by reason across a nationwide origin matrix.
 *
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import Destinations from "../../src/features/destinations/Destinations";
import destinationsData from "../../src/shared/data/destinations-index.json";
import type { Destination } from "../../src/shared/types/destination";
import { getOriginAwareTransportEstimate } from "../../src/shared/services/transport/OriginAwareTransportService";
import { getValidModes } from "../../src/shared/services/recommendation/RecommendationScorer";
import { matchesPersonalizedDayTripDuration } from "../../src/shared/services/recommendation/TripDurationService";
import {
  getEligibleOriginModes,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "../../src/shared/services/transport/TransportTopologyService";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tripStoreMock = vi.hoisted(() => ({
  homeStationCoords: null as { lat: number; lng: number } | null,
  homeStationTransportZoneId: undefined as string | undefined,
  originSource: "saved" as string,
  destinationRatings: {},
  favorites: [],
  isVisited: () => false,
  isFavorite: () => false,
  isComparing: () => false,
  toggleCompare: vi.fn(),
  toggleFavorite: vi.fn(),
  compareList: [],
  canMutateProfile: true,
  addVisitedDate: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  user: null as unknown,
  loading: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number | string>) => {
      const value: Record<string, string> = {
        "destination.tripAreas.summary": "{{areas}} areas · {{places}} places",
        "destination.tripAreas.show": "Show {{count}}",
        "destination.tripModes.any": "Any",
        "destination.tripModes.day_trip": "Day trip",
        "destination.tripModes.weekend_2d1n": "2D1N",
      };
      const str = value[key] ?? key;
      return options
        ? str.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
            String(options[name] ?? ""),
          )
        : str;
    },
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/features/home/hooks/useWeatherContext", () => ({
  useWeatherContext: () => ({ weatherContext: { forecastMap: undefined } }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => tripStoreMock,
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => authMock,
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));

vi.mock("@/shared/components/StationInput", () => ({
  default: () => null,
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  tripStoreMock.homeStationCoords = null;
  tripStoreMock.homeStationTransportZoneId = undefined;
  authMock.user = null;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderDestinations(entry: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[entry]}>
        <Destinations />
      </MemoryRouter>,
    );
  });
  return host;
}

function getResultCount(container: HTMLDivElement): number {
  const summarySpan = container.querySelector("#results-grid span");
  if (!summarySpan) return 0;
  const text = summarySpan.textContent ?? "";
  const match = text.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

const allDests = destinationsData as unknown as Destination[];

// Real-world station/centre coordinates for the audited origins.
const ORIGINS: Record<string, { lat: number; lng: number }> = {
  "Tokyo (Tokyo St)": { lat: 35.6812, lng: 139.7671 },
  Shinagawa: { lat: 35.6285, lng: 139.7387 },
  Yokohama: { lat: 35.4658, lng: 139.6222 },
  Machida: { lat: 35.5464, lng: 139.4466 },
  Nakayama: { lat: 35.514745, lng: 139.539692 },
  Chiba: { lat: 35.6125, lng: 140.1167 },
  Fukushima: { lat: 37.7544, lng: 140.4665 },
  Nagano: { lat: 36.6431, lng: 138.1888 },
  Osaka: { lat: 34.7025, lng: 135.4959 },
  Hiroshima: { lat: 34.3983, lng: 132.4756 },
  Iwakuni: { lat: 34.1758, lng: 132.2251 },
  Hakata: { lat: 33.5902, lng: 130.4207 },
  "Naha 900-8585": { lat: 26.2124, lng: 127.6809 },
  Sendai: { lat: 38.268, lng: 140.87 },
  Sapporo: { lat: 43.068, lng: 141.351 },
  Kochi: { lat: 33.5597, lng: 133.5311 },
  Nagoya: { lat: 35.1709, lng: 136.8815 },
  Koriyama: { lat: 37.4, lng: 140.36 },
  Kanazawa: { lat: 36.5782, lng: 136.6485 },
  Matsuyama: { lat: 33.8404, lng: 132.7657 },
  Kagoshima: { lat: 31.583, lng: 130.542 },
  Kumamoto: { lat: 32.7897, lng: 130.6867 },
  Nagasaki: { lat: 32.7503, lng: 129.8776 },
  Aomori: { lat: 40.8246, lng: 140.7406 },
  Morioka: { lat: 39.7015, lng: 141.1365 },
  Niigata: { lat: 37.9121, lng: 139.0614 },
  Toyama: { lat: 36.7015, lng: 137.2133 },
  Tottori: { lat: 35.4927, lng: 134.2256 },
  Matsue: { lat: 35.4646, lng: 133.064 },
  Takamatsu: { lat: 34.3503, lng: 134.0469 },
  Tokushima: { lat: 34.0745, lng: 134.5573 },
  Uwajima: { lat: 33.2237, lng: 132.5609 },
  Kushiro: { lat: 42.9838, lng: 144.3815 },
  "Okinawa City": { lat: 26.3344, lng: 127.8056 },
  Miyakojima: { lat: 24.8061, lng: 125.2811 },
};

type Reason =
  | "bus-eligible"
  | "origin-zone-unknown"
  | "dest-zone-unknown"
  | "topology-no-bus"
  | "no-bus-corridor"
  | "night-only"
  | "day-infeasible"
  | "no-visit-hours";

function classify(
  dest: Destination,
  coords: { lat: number; lng: number },
): Reason {
  const originZoneId = resolveOriginTransportZone({ coordinates: coords });
  if (!originZoneId || originZoneId === "unknown") return "origin-zone-unknown";
  const destZoneId = resolveDestinationTransportZone(dest);
  if (destZoneId === "unknown") return "dest-zone-unknown";
  const eligible = getEligibleOriginModes({
    originZoneId,
    destinationZoneId: destZoneId,
    destination: dest,
  });
  const authorized = new Set(
    originZoneId === destZoneId ? eligible.localModes : eligible.crossZoneModes,
  );
  if (!authorized.has("bus")) return "topology-no-bus";

  const modes = getValidModes(
    dest,
    "none",
    ["bus"],
    coords,
    undefined,
    originZoneId,
    undefined,
  );
  if (modes.length === 0) return "no-bus-corridor";

  const estimate = getOriginAwareTransportEstimate(
    dest,
    { homeStationCoords: coords, originZoneId },
    ["bus"],
  );
  if (estimate?.mode === "bus" && estimate.servicePeriod === "night") {
    return "night-only";
  }
  const dayOk = matchesPersonalizedDayTripDuration(
    dest,
    { homeStationCoords: coords, originZoneId },
    ["bus"],
    "any",
  );
  if (dayOk) return "bus-eligible";
  if (!dest.recommendedVisitHours) return "no-visit-hours";
  return "day-infeasible";
}

describe("KAI-63 bus audit", () => {
  it("explore counts and exclusion reasons per origin", () => {
    console.log(`Catalogue total: ${allDests.length}`);
    for (const [origin, coords] of Object.entries(ORIGINS)) {
      tripStoreMock.homeStationCoords = coords;
      tripStoreMock.homeStationTransportZoneId = resolveOriginTransportZone({
        coordinates: coords,
      });
      const uiHost = renderDestinations("/destinations?mode=bus");
      const uiCount = getResultCount(uiHost);
      if (root) act(() => root!.unmount());
      root = undefined;
      uiHost.remove();

      const reasons = new Map<Reason, number>();
      for (const dest of allDests) {
        const reason = classify(dest, coords);
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      }
      const eligible = reasons.get("bus-eligible") ?? 0;
      console.log(
        `\n=== ${origin} (zone ${tripStoreMock.homeStationTransportZoneId}) | UI=${uiCount} pipeline=${eligible} ===`,
      );
      for (const [reason, count] of [...reasons.entries()].sort(
        (a, b) => b[1] - a[1],
      )) {
        console.log(`  ${reason}: ${count}`);
      }
      console.log(
        `  reachable: ${((eligible / allDests.length) * 100).toFixed(1)}%`,
      );
    }
  }, 300000);
});
