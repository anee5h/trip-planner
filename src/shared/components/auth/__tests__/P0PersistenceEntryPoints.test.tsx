import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import { MarkVisitedModal } from "@/features/destinations/components/MarkVisitedModal";
import {
  clearPendingPersistenceIntent,
  peekPendingPersistenceIntent,
} from "@/shared/services/auth/PendingPersistenceIntent";

const authState = vi.hoisted(() => ({ user: null as unknown }));
const storeState = vi.hoisted(() => ({
  active: false,
  toggleFavorite: vi.fn(),
  addVisitedDate: vi.fn(),
  canMutateProfile: true,
}));
const openAuthModal = vi.hoisted(() => vi.fn());

vi.mock("@/shared/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));
vi.mock("@/shared/hooks/useOptionalAuth", () => ({
  useOptionalAuth: () => ({ user: authState.user }),
}));
vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    isFavorite: () => storeState.active,
    toggleFavorite: storeState.toggleFavorite,
    addVisitedDate: storeState.addVisitedDate,
    canMutateProfile: storeState.canMutateProfile,
  }),
}));
vi.mock("@/shared/context/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal }),
  useOptionalAuthModal: () => ({ openAuthModal }),
}));
vi.mock("@/shared/context/useOptionalAuthModal", () => ({
  useOptionalAuthModal: () => ({ openAuthModal }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  authState.user = null;
  storeState.active = false;
  storeState.toggleFavorite.mockReset();
  storeState.addVisitedDate.mockReset();
  openAuthModal.mockReset();
  clearPendingPersistenceIntent();
});

function render(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

describe("KAI-259 P0 persistence entry points", () => {
  it("uses the shared bucket-list prompt for guests and mutates directly for users", () => {
    const node = render(
      <BucketListButton destinationId="ueno-zoo" destinationName="Ueno Zoo" />,
    );
    act(() => node.querySelector("button")?.click());

    expect(openAuthModal).toHaveBeenCalledWith("signup", "bucket_list_save");
    expect(peekPendingPersistenceIntent()).toMatchObject({
      type: "bucket_list_save",
      destinationId: "ueno-zoo",
      sourceSurface: "bucket_list_save",
    });
    expect(storeState.toggleFavorite).not.toHaveBeenCalled();

    clearPendingPersistenceIntent();
    authState.user = { id: "user-1" };
    act(() => root!.render(<BucketListButton destinationId="ueno-zoo" />));
    act(() => node.querySelector("button")?.click());
    expect(storeState.toggleFavorite).toHaveBeenCalledWith("ueno-zoo");
    expect(openAuthModal).toHaveBeenCalledTimes(1);
  });

  it("preserves a guest Passport date through the shared prompt", () => {
    render(
      <MarkVisitedModal
        isOpen
        onClose={vi.fn()}
        destination={{ id: "ueno-zoo", name: "Ueno Zoo" }}
      />,
    );
    act(() =>
      document.body
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click(),
    );

    expect(openAuthModal).toHaveBeenCalledWith("signup", "passport");
    expect(peekPendingPersistenceIntent()).toMatchObject({
      type: "passport",
      destinationId: "ueno-zoo",
      sourceSurface: "passport",
    });
    expect(storeState.addVisitedDate).not.toHaveBeenCalled();
  });

  it("lets an authenticated Passport action complete without acquisition UI", () => {
    authState.user = { id: "user-1" };
    render(
      <MarkVisitedModal
        isOpen
        onClose={vi.fn()}
        destination={{ id: "ueno-zoo", name: "Ueno Zoo" }}
      />,
    );
    act(() =>
      document.body
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click(),
    );

    expect(storeState.addVisitedDate).toHaveBeenCalledWith(
      "ueno-zoo",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(openAuthModal).not.toHaveBeenCalled();
  });
});
