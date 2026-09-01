/**
 * KAI-63: Explore Bus eligibility regression tests.
 *
 * Covers the bus-focused audit outcomes at the UI level:
 *   - Naha postcode 900-8585 now returns Okinawa-local bus results (and only
 *     Okinawa results — no mainland bus connectivity is fabricated).
 *   - Iwakuni postcode origins resolve as mainland-honshu and produce bus
 *     results (previously zeroed by a shikoku-box mis-resolution).
 *   - Zero-result origins stay zero and show the empty state.
 *   - Semantic invariants for the audited example origins: results exist AND
 *     the rendered UI count equals the canonical pipeline count (no catalogue
 *     numbers pinned — expansion must not break this suite).
 *   - Night-only corridors never appear in day-trip bus results.
 *
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  beforeAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  loadLiteIndex,
  loadDestinationsIndex,
} from "@/shared/services/place/PlaceCatalog";
import Destinations from "../Destinations";
import { resolveOriginTransportZone } from "@/shared/services/transport/TransportTopologyService";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import {
  isOriginLocalDestination,
  resolveOriginMunicipalityId,
} from "@/shared/services/recommendation/OriginAreaService";
import allDestinations from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";

const catalogue = allDestinations as unknown as Destination[];

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tripStoreMock = vi.hoisted(() => ({
  homeStationCoords: null as { lat: number; lng: number } | null,
  homeStationTransportZoneId: undefined as string | undefined,
  originSource: "none" as string,
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
        "destination.durationOptions.any": "Any",
        "destination.durationOptions.fullDay": "Day trip",
        "destination.durationOptions.2d1n": "2D1N",
        // KAI-49: Explore page i18n keys — required for getResultCount and
        // empty-state assertions to resolve correctly under the test mock.
        "ui.destinationsMatching": "{{count}} destinations matching",
        "ui.noDestinationsFound": "No destinations match the selected filters.",
        "ui.noDestinationsFoundHint":
          "Try adjusting your search terms or clearing some filters.",
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

// KAI-121: full catalogue is runtime-lazy; preload so
// useFullCatalogue renders full data synchronously in tests.
beforeAll(async () => {
  await loadDestinationsIndex();
  await loadLiteIndex();
});

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

async function renderDestinations(entry: string) {
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

function getResultCount(container: HTMLDivElement): number {
  const summarySpan = container.querySelector("#results-grid span");
  if (!summarySpan) return 0;
  const text = summarySpan.textContent ?? "";
  const match = text.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function setOrigin(coords: { lat: number; lng: number }) {
  tripStoreMock.homeStationCoords = coords;
  tripStoreMock.homeStationTransportZoneId = resolveOriginTransportZone({
    coordinates: coords,
  });
}

/** Card destination ids rendered by the current Explore results. */
function cardIds(hostEl: HTMLDivElement): string[] {
  return [...hostEl.querySelectorAll("a[href^='/destinations/']")].map(
    (a) =>
      (a.getAttribute("href") ?? "")
        .slice("/destinations/".length)
        .split("?")[0],
  );
}

/**
 * The canonical pipeline bus count for an origin — the same gate the Explore
 * UI applies for "Any" duration (mode eligibility / reachability only; the
 * day-trip duration check runs only under an explicit duration or
 * trip-mode selection — KAI-63 D4). Used to assert UI == pipeline without
 * pinning a catalogue number.
 */
function pipelineBusCount(coords: { lat: number; lng: number }): number {
  const originZoneId = resolveOriginTransportZone({ coordinates: coords });
  const originMunicipalityId = resolveOriginMunicipalityId(coords, catalogue);
  let count = 0;
  for (const dest of catalogue) {
    // The Explore filter never returns origin-local destinations as getaways.
    if (isOriginLocalDestination(dest, originMunicipalityId)) continue;
    const modes = getValidModes(
      dest,
      "none",
      ["bus"],
      coords,
      undefined,
      originZoneId,
      undefined,
    );
    if (modes.length === 0) continue;
    // KAI-63 D4: with "Any" duration, Explore applies mode eligibility only
    // (reachability). The day-trip duration gate runs only under an explicit
    // duration/trip-mode selection, so it is not part of this mirror.
    count++;
  }
  return count;
}

const NAHA = { lat: 26.2124, lng: 127.6809 }; // postcode 900-8585
const IWAKUNI = { lat: 34.1758, lng: 132.2251 };
const AOMORI = { lat: 40.8246, lng: 140.7406 };
const YOKOHAMA = { lat: 35.4658, lng: 139.6222 };
const NAKAYAMA = { lat: 35.514745, lng: 139.539692 };
const OSAKA = { lat: 34.7025, lng: 135.4959 };
const HIROSHIMA = { lat: 34.3983, lng: 132.4756 };
const TOKYO = { lat: 35.6812, lng: 139.7671 };

describe("KAI-63 Explore bus eligibility", () => {
  it("Naha postcode 900-8585: Okinawa-local bus results, zero mainland fabrication", async () => {
    setOrigin(NAHA);
    const hostEl = await renderDestinations("/destinations?mode=bus");
    const count = getResultCount(hostEl);
    // >0 = Nago/Motobu/Onna destinations reachable via the verified naha⇔nago
    // highway bus (Naha-city POIs are origin-local; outer islands and the
    // mainland are topology-blocked). No exact count is pinned.
    expect(count).toBeGreaterThan(0);
    // Every rendered card must be an Okinawa destination: no mainland bus
    // connectivity to Okinawa may be invented.
    const cards = cardIds(hostEl);
    expect(cards.length).toBeGreaterThan(0);
    const okinawaIds = new Set([
      "nago-city",
      "motobu-town",
      "nago-pineapple-park",
      "busena-marine-park-nago",
      "churaumi-aquarium-motobu",
      "bise-fukugi-tree-road-motobu",
      "nakijin-castle-ruins-motobu",
      "kouri-island-okinawa",
      "okinawa-kaigan",
      "dmm-kariyushi-aquarium",
      "junglia-okinawa",
    ]);
    for (const id of cards) {
      expect(okinawaIds.has(id)).toBe(true);
    }
  });

  it("Iwakuni: station and postcode origins resolve identically and both yield bus results", async () => {
    // Station-origin path resolves via the label's prefecture; the postcode
    // path resolves from coordinates only. Both must land on mainland-honshu
    // (KAI-63 fix) so bus corridors are reachable either way.
    const fromLabel = resolveOriginTransportZone({
      coordinates: IWAKUNI,
      label: "Iwakuni Station, Yamaguchi",
    });
    const fromCoords = resolveOriginTransportZone({ coordinates: IWAKUNI });
    expect(fromLabel).toBe("mainland-honshu");
    expect(fromCoords).toBe("mainland-honshu");
    setOrigin(IWAKUNI);
    const hostEl = await renderDestinations("/destinations?mode=bus");
    // Pre-fix a coordinate/postcode origin was 0 (shikoku-box mis-resolution).
    // Now the Hiroshima hub (~33 km) is reachable: 32 destinations across its
    // verified corridors (station origins were already 32 via the label).
    expect(getResultCount(hostEl)).toBeGreaterThan(0);
  });

  it("zero-result origins stay zero with the empty state", async () => {
    // Aomori has no bus terminal within 50 km and no corridor row: honest
    // zero, not a fabricated fallback.
    setOrigin(AOMORI);
    const hostEl = await renderDestinations("/destinations?mode=bus");
    expect(getResultCount(hostEl)).toBe(0);
    expect(hostEl.textContent).toContain("No destinations match");
  });

  it.each([
    ["Yokohama", YOKOHAMA],
    ["Nakayama", NAKAYAMA],
    ["Tokyo", TOKYO],
    ["Osaka", OSAKA],
    ["Hiroshima", HIROSHIMA],
  ])(
    "bus results exist for %s and the UI count equals the canonical pipeline count",
    async (_name, coords) => {
      // Semantic invariant, not a pinned number (KAI-63: catalogue/corridor
      // expansion must not break this suite). Two properties hold by design:
      // the Explore filter uses the same gate as the canonical pipeline, so
      // the rendered count must equal the pipeline count for the same origin.
      setOrigin(coords);
      const uiCount = getResultCount(
        await renderDestinations("/destinations?mode=bus"),
      );
      expect(uiCount).toBeGreaterThan(0);
      expect(uiCount).toBe(pipelineBusCount(coords));
    },
  );

  it("a known verified corridor destination is included from Tokyo", () => {
    // kofu-city is reachable from Tokyo via the verified tokyo⇔kofu coach.
    // KAI-89 model pass: kofu's template season was neutralized, which can
    // move it below the first Explore page; the corridor invariant is
    // ELIGIBILITY (bus authorized via the verified corridor), not top-page
    // visibility.
    const kofu = catalogue.find((r) => r.id === "kofu-city")!;
    const originZoneId = resolveOriginTransportZone({ coordinates: TOKYO });
    const modes = getValidModes(
      kofu,
      "none",
      ["bus"],
      TOKYO,
      undefined,
      originZoneId,
      undefined,
    );
    expect(modes).toContain("bus");
  });

  it("a known unsupported destination is excluded from Tokyo", async () => {
    // Abashiri (Hokkaido) has no bus corridor from Tokyo and the topology has
    // no honshu↔hokkaido bus edge: it must never appear.
    setOrigin(TOKYO);
    const hostEl = await renderDestinations("/destinations?mode=bus");
    const ids = cardIds(hostEl);
    expect(ids).not.toContain("abashiri-city");
  });

  it("night-only corridors never appear in day-trip bus results", async () => {
    // From Tokyo, Fukuoka is bus-reachable only by the night-only はかた号 —
    // no Fukuoka destination may appear in a day-trip bus filter. (Under
    // "Any" duration the night coach is legitimate reachability and those
    // destinations ARE bus-eligible — KAI-63 D4; the night gate lives in
    // the full-day envelope, so this test pins the explicit fullDay duration.)
    setOrigin(TOKYO);
    const hostEl = await renderDestinations(
      "/destinations?mode=bus&duration=fullDay",
    );
    const ids = cardIds(hostEl);
    expect(
      ids.some((id) => id.includes("fukuoka") || id.includes("hakata")),
    ).toBe(false);
  });
});
