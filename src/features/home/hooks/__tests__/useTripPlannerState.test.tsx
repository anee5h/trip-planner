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
});
