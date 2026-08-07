/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TripCard from "../TripCard";
import type { Trip } from "@/shared/types/trip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockTrip: Trip = {
  id: "trip-1",
  userId: "user-1",
  title: "Kyoto Weekend",
  status: "planned",
  stops: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

let root: Root;
let host: HTMLDivElement;
let onSelect: ReturnType<typeof vi.fn<(id: string) => void>>;
let onDelete: ReturnType<typeof vi.fn<(id: string) => void>>;

function render() {
  act(() =>
    root.render(
      <TripCard trip={mockTrip} onSelect={onSelect} onDelete={onDelete} />,
    ),
  );
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  onSelect = vi.fn<(id: string) => void>();
  onDelete = vi.fn<(id: string) => void>();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("TripCard", () => {
  it("renders trip title and status", () => {
    render();
    expect(host.textContent).toContain("Kyoto Weekend");
    expect(host.textContent).toContain("planned");
  });

  it("calls onSelect when Planner button is clicked", () => {
    render();
    const plannerBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Planner"),
    );
    act(() => plannerBtn?.click());
    expect(onSelect).toHaveBeenCalledWith("trip-1");
  });

  it("shows confirm/cancel after delete click and calls onDelete on confirm", () => {
    render();

    // Click delete icon
    const deleteBtn = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete trip"]',
    );
    act(() => deleteBtn?.click());

    // Should now show confirm button
    expect(host.textContent).toContain("ui.save");
    expect(host.textContent).toContain("ui.cancel");

    // Click confirm
    const confirmBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ui.save"),
    );
    act(() => confirmBtn?.click());
    expect(onDelete).toHaveBeenCalledWith("trip-1");
  });

  it("cancels delete when cancel is clicked", () => {
    render();

    const deleteBtn = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete trip"]',
    );
    act(() => deleteBtn?.click());

    const cancelBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ui.cancel"),
    );
    act(() => cancelBtn?.click());

    // Should not have called onDelete
    expect(onDelete).not.toHaveBeenCalled();
    // Confirm button should be gone
    expect(host.textContent).not.toContain("ui.save");
  });

  it("displays stop count", () => {
    render();
    expect(host.textContent).toContain("0 stops");
  });
});
