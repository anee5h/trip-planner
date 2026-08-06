/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import RouletteModal from "../RouletteModal";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    homeStationCoords: { lat: 35.6812, lng: 139.7671 },
    homeStationTransportZoneId: "mainland-honshu",
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en" }),
}));

const KEY_LABELS: Record<string, string> = {
  "home.roulette.title": "Destination Roulette",
  "home.roulette.subtitle": "Let fate pick your next escape",
  "home.roulette.selecting": "Selecting...",
  "home.roulette.match": "Your match!",
  "home.roulette.spinAgain": "Spin again",
  "home.roulette.close": "Close",
  "home.roulette.viewDetails": "View details",
  "home.roulette.empty": "No candidates available to spin.",
  "home.roulette.expanded": "Expanded the search slightly",
  "home.weekendBadge": "2 days / 1 night",
  "home.durations.shortOuting": "Short outing",
  "home.durations.halfDay": "Half day",
  "home.durations.fullDay": "Full day",
  "home.transportModes.shinkansen": "Shinkansen",
  "home.transportModes.train": "Train",
  "home.transportModes.travel": "Travel",
  "home.places": "{{count}} places",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      KEY_LABELS[key]?.replace("{{count}}", String(opts?.count ?? "")) ?? key,
  }),
}));

vi.mock("@/shared/components/ui/Button", () => ({
  Button: ({ children, ...rest }: React.ComponentProps<"button">) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock("@/shared/components/ui/LazyImage", () => ({
  LazyImage: () => null,
}));

const baseCandidate: Destination = {
  id: "kyoto-city",
  name: "Kyoto City",
  prefecture: "Kyoto",
  region: "Kansai",
  categories: ["City"],
  heroImage: "",
  description: "",
  highlights: [],
  budgetRecommended: 5000,
  budgetMin: 3000,
  budgetMax: 10000,
  transportOptions: { train: 230 },
  totalTripHours: 8,
  walkingMin: 10,
  walkingSunMin: 5,
  walkingShadeMin: 5,
  indoorPercent: 0,
  ratings: { overall: 5, food: 5, summer: 5, winter: 5 },
} as unknown as Destination;

const weekendCandidate = {
  ...baseCandidate,
  transportEstimate: {
    mode: "shinkansen",
    timeRange: [15, 35] as [number, number],
    source: "verified_ground_route" as const,
  },
  weekend: {
    travelFit: { eligible: true, band: "local" as const, oneWayMinutes: 25 },
    capacity: {
      eligible: true,
      activityMinutes: 720,
      eligiblePlaceCount: 1,
      reason: "sufficient" as const,
    },
    weatherDays: [],
    estimatedCostTransportIncluded: true,
    placeCount: 12,
  },
};

function renderModal(
  props: Partial<React.ComponentProps<typeof RouletteModal>>,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <RouletteModal
        isOpen
        onClose={() => {}}
        candidates={[weekendCandidate as unknown as Destination]}
        {...props}
      />,
    );
  });
  return { host, root };
}

describe("RouletteModal weekend mode", () => {
  it("weekend roulette displays 2 days / 1 night", () => {
    const { host, root } = renderModal({
      tripMode: "weekend_2d1n",
      tripDuration: "fullDay",
    });
    const text = host.textContent ?? "";
    expect(text).toContain("2 days / 1 night");
    act(() => root.unmount());
    host.remove();
  });

  it("weekend roulette never displays Half day", () => {
    const { host, root } = renderModal({
      tripMode: "weekend_2d1n",
      tripDuration: "halfDay",
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Half day");
    act(() => root.unmount());
    host.remove();
  });

  it("day-trip roulette retains its duration label", () => {
    const { host, root } = renderModal({
      tripMode: "day_trip",
      tripDuration: "halfDay",
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Half day");
    expect(text).not.toContain("2 days / 1 night");
    act(() => root.unmount());
    host.remove();
  });

  it("roulette transport equals the pipeline estimate (mode, time, places)", () => {
    const { host, root } = renderModal({ tripMode: "weekend_2d1n" });
    const text = host.textContent ?? "";
    // The candidate's transportEstimate: shinkansen 15–35 min, 12 places.
    expect(text).toContain("Shinkansen");
    expect(text).toContain("15–35 min");
    expect(text).toContain("12 places");
    act(() => root.unmount());
    host.remove();
  });
});
