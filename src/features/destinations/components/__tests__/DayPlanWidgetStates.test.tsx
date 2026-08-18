import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { DayPlanWidget } from "../DayPlanWidget";

/**
 * KAI-121 delayed-loader component test: the DayPlanWidget must render a
 * loading state while the full catalogue is pending, the Est. duration
 * entry after it loads, and an explicit retry/error state on failure.
 * "Catalogue not loaded yet" must never permanently hide the widget or
 * render the ineligible message.
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

function render(ui: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
}

const mockPoi: Destination = {
  id: "poi-1",
  name: "POI One",
  nameJa: "スポット1",
  kind: "landmark",
  role: "anchor",
  placeType: "destination",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["sightseeing"],
  heroImage: "https://example.com/hero.jpg",
  description: "Test landmark",
  areaId: "shinjuku",
  coordinates: { lat: 35.69, lng: 139.7 },
  recommendedVisitHours: { min: 1, max: 3 },
  businessHours: "09:00 - 18:00",
} as unknown as Destination;

describe("KAI-121 DayPlanWidget catalogue states", () => {
  it("pending catalogue shows a loading state, NOT the ineligible message", () => {
    render(
      <DayPlanWidget
        destination={mockPoi}
        eligible={false}
        catalogueLoading={true}
        catalogueError={null}
        onRetryCatalogue={vi.fn()}
      />,
    );
    const text = host!.textContent ?? "";
    expect(text).toContain("Loading destination data");
    expect(text).not.toContain("aren't enough nearby places");
    // The widget is NOT permanently hidden while pending.
    expect(host!.textContent).not.toBe("");
  });

  it("after load, the Est. duration entry appears for an eligible destination", () => {
    render(
      <DayPlanWidget
        destination={mockPoi}
        eligible={true}
        catalogueLoading={false}
        catalogueError={null}
      />,
    );
    const text = host!.textContent ?? "";
    expect(text).toContain("Est. duration:");
  });

  it("load failure presents an explicit retry/error state", () => {
    render(
      <DayPlanWidget
        destination={mockPoi}
        eligible={false}
        catalogueLoading={false}
        catalogueError="network down"
        onRetryCatalogue={vi.fn()}
      />,
    );
    const text = host!.textContent ?? "";
    expect(text).toContain("Could not load destination data");
    expect(text).toContain("Retry");
  });

  it("a genuinely ineligible destination (loaded, no candidates) still renders the honest message", () => {
    render(
      <DayPlanWidget
        destination={mockPoi}
        eligible={false}
        catalogueLoading={false}
        catalogueError={null}
      />,
    );
    const text = host!.textContent ?? "";
    expect(text).toContain("aren't enough nearby places");
  });
});
