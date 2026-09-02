/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  HomePlannerStateProvider,
  useHomePlannerState,
} from "../HomePlannerStateContext";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement | undefined;

function Harness({
  onState,
}: {
  onState: (value: ReturnType<typeof useHomePlannerState>) => void;
}) {
  const state = useHomePlannerState();
  onState(state);
  return <div data-party-size={state.partySize} />;
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  window.history.replaceState({}, "", "/");
  root = undefined;
  host = undefined;
});

function renderState(
  user: User | null = null,
  onPlannerPreferencesPersist?: (preferences: unknown) => void,
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  let current!: ReturnType<typeof useHomePlannerState>;
  act(() => {
    root?.render(
      <HomePlannerStateProvider
        user={user}
        onPlannerPreferencesPersist={onPlannerPreferencesPersist}
      >
        <Harness onState={(value) => (current = value)} />
      </HomePlannerStateProvider>,
    );
  });
  return () => current;
}

function renderStateWithUser(initialUser: User) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  let current!: ReturnType<typeof useHomePlannerState>;
  let user = initialUser;

  const render = () => {
    root?.render(
      <HomePlannerStateProvider user={user}>
        <Harness onState={(value) => (current = value)} />
      </HomePlannerStateProvider>,
    );
  };

  act(render);
  return {
    getState: () => current,
    setUser: (nextUser: User) => {
      act(() => {
        user = nextUser;
        render();
      });
    },
  };
}

describe("HomePlannerStateProvider", () => {
  it("keeps canonical duration as the only trip-length state", () => {
    const getState = renderState();
    expect(getState().draftState).toEqual(getState().appliedState);
    expect(getState().draftState.tripDuration).toBe("halfDay");
    expect("tripMode" in getState().draftState).toBe(false);
    expect("accommodationAllowance" in getState().draftState).toBe(false);

    act(() => getState().setTripDuration("3d2n"));
    expect(getState().draftState.tripDuration).toBe("3d2n");
    expect(getState().appliedState.tripDuration).toBe("halfDay");
    expect(getState().isDirty).toBe(true);
    act(() => getState().applyPlannerState());
    expect(getState().appliedState.tripDuration).toBe("3d2n");
    expect(getState().isDirty).toBe(false);
  });

  it("hydrates canonical duration from the homepage URL", () => {
    window.history.replaceState({}, "", "/?duration=3d2n");
    const getState = renderState();
    expect(getState().draftState.tripDuration).toBe("3d2n");
    expect(getState().appliedState.tripDuration).toBe("3d2n");
  });

  it("migrates a legacy homepage duration URL to canonical duration", () => {
    window.history.replaceState({}, "", "/?tripMode=weekend_2d1n");
    const getState = renderState();
    expect(getState().draftState.tripDuration).toBe("2d1n");
    expect(new URLSearchParams(window.location.search).get("duration")).toBe(
      "2d1n",
    );
    expect(new URLSearchParams(window.location.search).has("tripMode")).toBe(
      false,
    );
  });

  it("rejects unsupported generic durations from the homepage URL", () => {
    window.history.replaceState({}, "", "/?duration=4d3n");
    const getState = renderState();
    expect(getState().draftState.tripDuration).toBe("halfDay");
    expect(getState().appliedState.tripDuration).toBe("halfDay");
    expect(new URLSearchParams(window.location.search).has("duration")).toBe(
      false,
    );
  });

  it("rejects unsupported generic durations from persisted homepage state", () => {
    const user = {
      id: "user-unsupported-duration",
      user_metadata: { preferences: { tripDuration: "4d3n" } },
    } as unknown as User;
    const getState = renderState(user);
    expect(getState().draftState.tripDuration).toBe("halfDay");
    expect(getState().appliedState.tripDuration).toBe("halfDay");
  });

  it("migrates legacy weekend state to canonical 2d1n", () => {
    const user = {
      id: "user-1",
      user_metadata: { preferences: { tripMode: "weekend_2d1n" } },
    } as unknown as User;
    const getState = renderState(user);
    expect(getState().draftState.tripDuration).toBe("2d1n");
    expect(getState().appliedState.tripDuration).toBe("2d1n");
  });

  it("hydrates party size and car mode into both draft and applied state", () => {
    const user = {
      id: "user-2",
      user_metadata: { preferences: { partySize: 4, carMode: "my_car" } },
    } as unknown as User;
    const getState = renderState(user);
    expect(getState().partySize).toBe(4);
    expect(getState().draftState.partySize).toBe(4);
    expect(getState().appliedState.partySize).toBe(4);
  });

  it.each([
    [0, 1],
    [9, 8],
    ["6", 6],
  ])(
    "keeps persisted party size in the 1–8 range (%s → %s)",
    (stored, expected) => {
      const user = {
        id: `party-range-${String(stored)}`,
        user_metadata: { preferences: { partySize: stored } },
      } as unknown as User;
      const getState = renderState(user);

      expect(getState().draftState.partySize).toBe(expected);
      expect(getState().appliedState.partySize).toBe(expected);
    },
  );

  it("persists the selected party size with the applied planner state", () => {
    const persisted = vi.fn();
    const getState = renderState(
      {
        id: "user-persist-party",
        user_metadata: { preferences: { partySize: 2 } },
      } as unknown as User,
      persisted,
    );

    act(() => getState().setPartySize(4));
    act(() => getState().applyPlannerState());

    expect(persisted).toHaveBeenCalledWith(
      expect.objectContaining({ partySize: 4 }),
    );
    expect(getState().draftState.partySize).toBe(4);
    expect(getState().appliedState.partySize).toBe(4);
  });

  it("keeps current draft and applied state through a same-user metadata refresh", () => {
    const user = {
      id: "same-user",
      user_metadata: { preferences: { partySize: 2, carMode: "none" } },
    } as unknown as User;
    const harness = renderStateWithUser(user);

    act(() => {
      harness.getState().setPartySize(4);
      harness.getState().setVibe("nature");
    });
    act(() => harness.getState().applyPlannerState());
    act(() => harness.getState().setBudgetTier("luxury"));

    harness.setUser({
      ...user,
      user_metadata: {
        preferences: { partySize: 2, carMode: "none" },
      },
    } as unknown as User);

    expect(harness.getState().draftState).toMatchObject({
      partySize: 4,
      vibe: "nature",
      budgetTier: "luxury",
    });
    expect(harness.getState().appliedState).toMatchObject({
      partySize: 4,
      vibe: "nature",
      budgetTier: "standard",
    });
    expect(harness.getState().isDirty).toBe(true);
  });

  it("does not snap an applied edit back to the default when metadata omitted party size", () => {
    const user = {
      id: "missing-party-user",
      user_metadata: { preferences: {} },
    } as unknown as User;
    const harness = renderStateWithUser(user);

    expect(harness.getState().partySize).toBe(2);
    act(() => harness.getState().setPartySize(3));
    act(() => harness.getState().applyPlannerState());

    harness.setUser({
      ...user,
      user_metadata: { preferences: {} },
    } as unknown as User);

    expect(harness.getState().draftState.partySize).toBe(3);
    expect(harness.getState().appliedState.partySize).toBe(3);
  });

  it("protects an unapplied party edit from a same-user metadata refresh", () => {
    const user = {
      id: "dirty-party-user",
      user_metadata: { preferences: { partySize: 2 } },
    } as unknown as User;
    const harness = renderStateWithUser(user);

    act(() => harness.getState().setPartySize(3));
    harness.setUser({
      ...user,
      user_metadata: { preferences: { partySize: 2 } },
    } as unknown as User);

    expect(harness.getState().draftState.partySize).toBe(3);
    expect(harness.getState().appliedState.partySize).toBe(2);
    expect(harness.getState().isDirty).toBe(true);
  });

  it("rehydrates both planner states when the authenticated account changes", () => {
    const harness = renderStateWithUser({
      id: "user-a",
      user_metadata: { preferences: { partySize: 2 } },
    } as unknown as User);

    act(() => harness.getState().setPartySize(4));
    act(() => harness.getState().applyPlannerState());

    harness.setUser({
      id: "user-b",
      user_metadata: { preferences: { partySize: 6 } },
    } as unknown as User);

    expect(harness.getState().draftState.partySize).toBe(6);
    expect(harness.getState().appliedState.partySize).toBe(6);
  });
});
