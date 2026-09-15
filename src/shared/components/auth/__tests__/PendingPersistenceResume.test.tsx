import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingPersistenceResume } from "../PendingPersistenceResume";
import {
  clearPendingPersistenceIntent,
  setPendingPersistenceIntent,
} from "@/shared/services/auth/PendingPersistenceIntent";

const authState = vi.hoisted(() => ({
  user: { id: "user-1", user_metadata: { preferences: {} } } as unknown,
  loading: false,
  updateUserProfile: vi.fn(),
}));
const storeState = vi.hoisted(() => ({
  profileSyncStatus: "ready" as const,
  isFavorite: vi.fn(() => false),
  toggleFavorite: vi.fn(),
  addVisitedDate: vi.fn(),
}));

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => authState,
}));
vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => storeState,
}));

afterEach(() => {
  clearPendingPersistenceIntent();
  authState.updateUserProfile.mockReset();
  storeState.isFavorite.mockReset().mockReturnValue(false);
  storeState.toggleFavorite.mockReset();
  storeState.addVisitedDate.mockReset();
});

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function renderResume(path = "/") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <PendingPersistenceResume />
      </MemoryRouter>,
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("KAI-259 authenticated pending-action resume", () => {
  it("completes bucket and Passport intents once", async () => {
    setPendingPersistenceIntent({
      type: "bucket_list_save",
      destinationId: "ueno-zoo",
      sourceSurface: "bucket_list_save",
    });
    renderResume();
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect(storeState.toggleFavorite).toHaveBeenCalledTimes(1);

    act(() => root?.unmount());
    root = undefined;
    setPendingPersistenceIntent({
      type: "passport",
      destinationId: "ueno-zoo",
      visitDate: "2026-09-15",
      sourceSurface: "passport",
    });
    renderResume();
    await act(async () => Promise.resolve());
    expect(storeState.addVisitedDate).toHaveBeenCalledWith(
      "ueno-zoo",
      "2026-09-15",
    );
  });

  it("persists preferences and clears the intent only after success", async () => {
    authState.updateUserProfile.mockResolvedValue({ error: null });
    setPendingPersistenceIntent({
      type: "preferences",
      preferences: {
        carMode: "none",
        publicModes: ["train"],
        tripDuration: "halfDay",
        partySize: 2,
      },
      sourceSurface: "preferences",
    });
    renderResume();
    await act(async () => Promise.resolve());

    expect(authState.updateUserProfile).toHaveBeenCalledWith({
      preferences: expect.objectContaining({
        carMode: "none",
        publicModes: ["train"],
        preferences_set: true,
      }),
    });
  });
});
