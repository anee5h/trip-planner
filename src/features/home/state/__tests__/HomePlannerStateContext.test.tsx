/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  HomePlannerStateProvider,
  useHomePlannerState,
} from "../HomePlannerStateContext";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderState(user: User | null = null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  let current!: ReturnType<typeof useHomePlannerState>;
  act(() => {
    root!.render(
      <HomePlannerStateProvider user={user}>
        <Harness onState={(value) => (current = value)} />
      </HomePlannerStateProvider>,
    );
  });
  return () => current;
}

describe("HomePlannerStateProvider", () => {
  it("owns one clean draft/applied state with lightweight actions", () => {
    const getState = renderState();
    expect(getState().draftState).toEqual(getState().appliedState);
    expect(getState().tripMode).toBe("day_trip");
    expect(getState().partySize).toBe(2);
    expect(getState().isDirty).toBe(false);

    act(() => getState().setTripMode("weekend_2d1n"));
    expect(getState().draftState.tripMode).toBe("weekend_2d1n");
    expect(getState().appliedState.tripMode).toBe("day_trip");
    expect(getState().isDirty).toBe(true);

    act(() => getState().applyPlannerState());
    expect(getState().appliedState.tripMode).toBe("weekend_2d1n");
    expect(getState().isDirty).toBe(false);
  });

  it("hydrates party size and car mode into both draft and applied state", () => {
    const user = {
      id: "user-1",
      user_metadata: { preferences: { partySize: 4, carMode: "my_car" } },
    } as unknown as User;
    const getState = renderState(user);

    act(() => {});
    expect(getState().partySize).toBe(4);
    expect(getState().draftState.partySize).toBe(4);
    expect(getState().appliedState.partySize).toBe(4);
  });
});
