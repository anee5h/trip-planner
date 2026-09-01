/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePlanner } from "../HomePlanner";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "ui.close": "Close",
        "home.vibe": "Interest",
        "home.duration": "Duration",
        "home.party": "Travel party",
        "home.budget": "Budget",
        "home.transport": "Getting around",
        "home.vibes.any": "Anything goes",
        "home.durations.shortOuting": "Short outing",
        "home.durations.halfDay": "Half day",
        "home.durations.fullDay": "Full day",
        "home.durations.2d1n": "2 days / 1 night",
        "home.durations.3d2n": "3 days / 2 nights",
        "home.durationHints.shortOuting": "≤ 4h total",
        "home.durationHints.halfDay": "≤ 7.5h total",
        "home.durationHints.fullDay": "≤ 14h total",
        "home.durationHints.2d1n": "1 night",
        "home.durationHints.3d2n": "2 nights",
        "home.budgets.standard": "Standard",
        "home.budgetHints.standard": "Balanced spending",
        "home.transportOptions.public": "Public transit",
        "home.transportOptions.rentalCar": "Rental car",
        "home.transportOptions.myCar": "Personal car",
        "home.find": "Find matches",
        "home.surprise": "Surprise me",
        "home.planner": "Trip Planner",
        "home.plannerHint": "Find your match in 30s",
        "home.decreaseParty": "Decrease party size",
        "home.increaseParty": "Increase party size",
      })[key] ?? key,
  }),
}));

let host: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderPlanner(
  overrides: Partial<React.ComponentProps<typeof HomePlanner>> = {},
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const props: React.ComponentProps<typeof HomePlanner> = {
    vibe: "any",
    onVibeChange: vi.fn(),
    tripDuration: "fullDay",
    onTripDurationChange: vi.fn(),
    partySize: 2,
    onPartySizeChange: vi.fn(),
    budgetTier: "standard",
    onBudgetTierChange: vi.fn(),
    publicTransport: true,
    onPublicTransportChange: vi.fn(),
    carMode: "none",
    onCarModeChange: vi.fn(),
    hasUserApplied: false,
    isDirty: false,
    onApplyMatches: vi.fn(),
    onSurpriseMe: vi.fn(),
    ...overrides,
  };
  act(() => root?.render(<HomePlanner {...props} />));
  return { container: host, props };
}

describe("HomePlanner terminology", () => {
  it("uses Interest as the selector label without the old Vibe label", () => {
    const { container } = renderPlanner();
    expect(container.textContent).toContain("Interest");
    expect(container.textContent).not.toContain("Vibe");
  });
});

describe("HomePlanner duration", () => {
  it("has only the five canonical duration values in the mobile sheet", () => {
    const { container } = renderPlanner();
    const trigger = [...container.querySelectorAll("button")]
      .reverse()
      .find((button) => button.textContent?.includes("Full day")) as
      HTMLButtonElement | undefined;
    expect(trigger).toBeTruthy();
    act(() => trigger?.click());

    const sheet = container.querySelector('[role="dialog"]');
    expect(sheet?.textContent).toContain("Short outing");
    expect(sheet?.textContent).toContain("Half day");
    expect(sheet?.textContent).toContain("Full day");
    expect(sheet?.textContent).toContain("2 days / 1 night");
    expect(sheet?.textContent).toContain("3 days / 2 nights");
    expect(sheet?.textContent).not.toContain("Weekend");
    expect(sheet?.querySelectorAll("button").length).toBe(7); // backdrop + close + five choices
  });

  it.each([
    ["shortOuting", "Short outing", "≤ 4h total"],
    ["halfDay", "Half day", "≤ 7.5h total"],
    ["fullDay", "Full day", "≤ 14h total"],
    ["2d1n", "2 days / 1 night", "1 night"],
    ["3d2n", "3 days / 2 nights", "2 nights"],
  ] as const)("selects and reopens %s", (value, label, hint) => {
    const onChange = vi.fn();
    const { container } = renderPlanner({ onTripDurationChange: onChange });
    const trigger = [...container.querySelectorAll("button")]
      .reverse()
      .find((button) => button.textContent?.includes("Full day")) as
      HTMLButtonElement | undefined;
    act(() => trigger?.click());
    const option = [
      ...container.querySelectorAll('[role="dialog"] button'),
    ].find((button) => button.textContent?.includes(label));
    expect(option?.textContent).toContain(hint);
    act(() => (option as HTMLButtonElement | undefined)?.click());
    expect(onChange).toHaveBeenCalledWith(value);
  });

  it("keeps the selected duration marked when the sheet is reopened", () => {
    const { container } = renderPlanner({ tripDuration: "3d2n" });
    const trigger = [...container.querySelectorAll("button")]
      .reverse()
      .find((button) => button.textContent?.includes("3 days / 2 nights")) as
      HTMLButtonElement | undefined;
    act(() => trigger?.click());
    const selected = [
      ...container.querySelectorAll('[role="dialog"] button'),
    ].find((button) => button.textContent?.includes("3 days / 2 nights"));
    expect(selected?.textContent).toContain("2 nights");
    expect(selected?.querySelector("svg")).toBeTruthy();
  });

  it("supports Escape and Tab focus handling in the duration sheet", () => {
    const { container } = renderPlanner();
    const trigger = [...container.querySelectorAll("button")]
      .reverse()
      .find((button) => button.textContent?.includes("Full day")) as
      HTMLButtonElement | undefined;
    act(() => trigger?.click());
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    const close = dialog?.querySelector('button[aria-label="Close"]');
    expect(close).toBeTruthy();
    act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
