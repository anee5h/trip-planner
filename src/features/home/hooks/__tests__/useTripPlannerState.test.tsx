/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect } from "vitest";
import { useTripPlannerState } from "../useTripPlannerState";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

function TestHarness({
  onHookResult,
}: {
  onHookResult: (state: ReturnType<typeof useTripPlannerState>) => void;
}) {
  const plannerState = useTripPlannerState(null);
  onHookResult(plannerState);
  return <div id="test-harness" />;
}

function setupHook() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  let currentResult: ReturnType<typeof useTripPlannerState> | undefined;

  act(() => {
    root!.render(
      <TestHarness
        onHookResult={(state) => {
          currentResult = state;
        }}
      />,
    );
  });

  return () => currentResult!;
}

describe("useTripPlannerState", () => {
  it("initializes with default values and clean state", () => {
    const getResult = setupHook();
    const result = getResult();

    expect(result.hasUserApplied).toBe(false);
    expect(result.isDirty).toBe(false);
    expect(result.vibe).toBe("any");
    expect(result.partySize).toBe(2);
    expect(result.budgetTier).toBe("standard");
    expect(result.transportPreference).toBe("public");
  });

  it("updates draft state without mutating applied state until applyPlannerState is called", () => {
    const getResult = setupHook();

    expect(getResult().resolvedApplied.vibe).toBe("any");

    act(() => {
      getResult().setVibe("nature");
    });

    expect(getResult().isDirty).toBe(true);
    expect(getResult().hasUserApplied).toBe(false);
    expect(getResult().draftState.vibe).toBe("nature");
    expect(getResult().resolvedApplied.vibe).toBe("any");

    act(() => {
      getResult().applyPlannerState();
    });

    expect(getResult().hasUserApplied).toBe(true);
    expect(getResult().isDirty).toBe(false);
    expect(getResult().resolvedApplied.vibe).toBe("nature");
  });

  it("clamps party size between 1 and 8", () => {
    const getResult = setupHook();

    act(() => {
      getResult().setPartySize(0);
    });
    expect(getResult().partySize).toBe(1);

    act(() => {
      getResult().setPartySize(10);
    });
    expect(getResult().partySize).toBe(8);
  });

  describe("tripMode and accommodationAllowance", () => {
    it("defaults tripMode to day_trip and accommodationAllowance to 15000", () => {
      const getResult = setupHook();
      const result = getResult();

      expect(result.tripMode).toBe("day_trip");
      expect(result.accommodationAllowance).toBe(15000);
    });

    it("setTripMode updates draft tripMode", () => {
      const getResult = setupHook();

      act(() => {
        getResult().setTripMode("weekend_2d1n");
      });

      expect(getResult().tripMode).toBe("weekend_2d1n");
      expect(getResult().isDirty).toBe(true);
    });

    it("setAccommodationAllowance updates draft value", () => {
      const getResult = setupHook();

      act(() => {
        getResult().setAccommodationAllowance(20000);
      });

      expect(getResult().accommodationAllowance).toBe(20000);
      expect(getResult().isDirty).toBe(true);
    });

    it("setAccommodationAllowance clamps invalid values to nearest bound", () => {
      const getResult = setupHook();

      act(() => {
        getResult().setAccommodationAllowance(-500);
      });
      expect(getResult().accommodationAllowance).toBe(0);

      act(() => {
        getResult().setAccommodationAllowance(1000000);
      });
      expect(getResult().accommodationAllowance).toBe(500000);
    });

    it("weekend budget equals day budget * 2 + accommodationAllowance", () => {
      const getResult = setupHook();

      // Set weekend mode with specific allowance
      act(() => {
        getResult().setTripMode("weekend_2d1n");
        getResult().setAccommodationAllowance(15000);
      });

      const weekendResolved = getResult().resolvedDraft;
      // Day-trip: 20000 * 2 * (1.0 for fullDay) = 40000
      // Weekend: 20000 * 2 * 2 + 15000 = 95000
      // But tripDuration depends on initialDuration which may vary.
      // Instead, compare weekend budget formula directly.
      // For weekend with standard tier, partySize=2, accommodation=15000:
      // dailyLimit = 20000, partySize = 2, multiplier = 2
      // budget = Math.round(20000 * 2 * 2) + 15000 = 80000 + 15000 = 95000
      expect(weekendResolved.budget).toBe(95000);
    });

    it("switching weekend to day removes accommodation from budget", () => {
      const getResult = setupHook();

      act(() => {
        getResult().setTripMode("weekend_2d1n");
        getResult().setAccommodationAllowance(20000);
      });

      const weekendBudget = getResult().resolvedDraft.budget;

      act(() => {
        getResult().setTripMode("day_trip");
      });

      const dayBudget = getResult().resolvedDraft.budget;
      expect(dayBudget).toBeLessThan(weekendBudget);
    });

    it("dirty flag flips on tripMode change", () => {
      const getResult = setupHook();

      expect(getResult().isDirty).toBe(false);

      act(() => {
        getResult().setTripMode("weekend_2d1n");
      });

      expect(getResult().isDirty).toBe(true);

      act(() => {
        getResult().applyPlannerState();
      });

      expect(getResult().isDirty).toBe(false);
    });
  });
});
