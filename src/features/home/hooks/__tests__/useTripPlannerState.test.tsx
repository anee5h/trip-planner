/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useTripPlannerState } from "../useTripPlannerState";
import { HomePlannerStateProvider } from "@/features/home/state/HomePlannerStateContext";
import type { TransportSelection } from "@/features/home/services/TransportResolver";

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

function TestHarnessContent({
  mockUser,
  onHookResult,
}: {
  mockUser: Parameters<typeof useTripPlannerState>[0];
  onHookResult: (state: ReturnType<typeof useTripPlannerState>) => void;
}) {
  const plannerState = useTripPlannerState(mockUser);
  onHookResult(plannerState);
  return <div id="test-harness" />;
}

function TestHarness({
  mockUser,
  onHookResult,
  onTransportPreferencesPersist,
}: {
  mockUser: Parameters<typeof useTripPlannerState>[0];
  onHookResult: (state: ReturnType<typeof useTripPlannerState>) => void;
  onTransportPreferencesPersist?: (selection: TransportSelection) => void;
}) {
  return (
    <HomePlannerStateProvider
      user={mockUser}
      onTransportPreferencesPersist={onTransportPreferencesPersist}
    >
      <TestHarnessContent mockUser={mockUser} onHookResult={onHookResult} />
    </HomePlannerStateProvider>
  );
}

function setupHook(
  mockUser: Parameters<typeof useTripPlannerState>[0] = null,
  onTransportPreferencesPersist?: (selection: TransportSelection) => void,
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  let currentResult: ReturnType<typeof useTripPlannerState> | undefined;

  act(() => {
    root!.render(
      <TestHarness
        mockUser={mockUser}
        onHookResult={(state) => {
          currentResult = state;
        }}
        onTransportPreferencesPersist={onTransportPreferencesPersist}
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
    expect(result.publicTransport).toBe(true);
    expect(result.carMode).toBe("none");
  });

  it("defaults to the canonical half-day duration", () => {
    const result = setupHook()();
    expect(result.tripDuration).toBe("halfDay");
    expect(result.resolvedApplied.tripDuration).toBe("halfDay");
  });

  it("updates duration in draft state and derives overnight budget", () => {
    const getResult = setupHook();

    act(() => {
      getResult().setTripDuration("3d2n");
    });

    expect(getResult().tripDuration).toBe("3d2n");
    expect(getResult().resolvedDraft.tripDuration).toBe("3d2n");
    expect(getResult().resolvedDraft.budget).toBeGreaterThan(
      getResult().resolvedDraft.budget - 1,
    );
    expect(getResult().isDirty).toBe(true);
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

  it("uses applied party size for the downstream party-aware budget", () => {
    const getResult = setupHook();
    const twoPersonBudget = getResult().resolvedApplied.budget;

    act(() => {
      getResult().setPartySize(4);
    });

    expect(getResult().resolvedDraft.partySize).toBe(4);
    expect(getResult().resolvedDraft.budget).toBe(twoPersonBudget * 2);
    expect(getResult().resolvedApplied.partySize).toBe(2);

    act(() => {
      getResult().applyPlannerState();
    });

    expect(getResult().resolvedApplied.partySize).toBe(4);
    expect(getResult().resolvedApplied.budget).toBe(twoPersonBudget * 2);
  });

  describe("transport selection with mock user", () => {
    it("hydrates persisted split preferences and keeps public + personal car available", () => {
      const mockUser = {
        id: "user-a",
        user_metadata: {
          preferences: {
            carMode: "own",
            publicModes: ["train", "bus"],
            partySize: 2,
          },
        },
      } as unknown as Parameters<typeof useTripPlannerState>[0];

      const getResult = setupHook(mockUser);

      expect(getResult().publicTransport).toBe(true);
      expect(getResult().carMode).toBe("my_car");
      expect(getResult().resolvedDraft.carMode).toBe("my_car");
      expect(getResult().resolvedDraft.publicModes).toEqual(["train", "bus"]);
    });

    it("persists the combined canonical capabilities on apply", () => {
      const persisted = vi.fn();
      const mockUser = {
        id: "user-c",
        user_metadata: {
          preferences: {
            carMode: "none",
            publicModes: ["train", "bus"],
          },
        },
      } as unknown as Parameters<typeof useTripPlannerState>[0];
      const getResult = setupHook(mockUser, persisted);

      act(() => {
        getResult().setCarMode("rental");
      });
      act(() => {
        getResult().applyPlannerState();
      });

      expect(persisted).toHaveBeenCalledWith({
        carMode: "rental",
        publicModes: ["train", "bus"],
      });
    });

    it("hydrates a persisted rental-only preference without restoring public transport", () => {
      const mockUser = {
        id: "user-b",
        user_metadata: {
          preferences: {
            carMode: "rental",
            publicModes: [],
          },
        },
      } as unknown as Parameters<typeof useTripPlannerState>[0];

      const getResult = setupHook(mockUser);
      expect(getResult().publicTransport).toBe(false);
      expect(getResult().carMode).toBe("rental");
      expect(getResult().resolvedDraft).toMatchObject({
        carMode: "rental",
        publicModes: [],
      });
    });
  });
});
