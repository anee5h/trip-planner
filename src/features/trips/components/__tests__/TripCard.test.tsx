/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TripCard from "../TripCard";
import type { Trip } from "@/shared/types/trip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) =>
      ({
        "ui.moreActions": "More actions",
        "ui.rename": "Rename",
        "ui.setDates": "Set dates",
        "ui.editDates": "Edit dates",
        "ui.editItinerary": "Edit itinerary",
        "ui.noDatesSet": "No dates set",
        "ui.stop": "stop",
        "ui.stops": "stops",
        "trips.status": "Status",
        "trips.statusLabels.planned": "Planned",
        "trips.statusLabels.completed": "Completed",
        "trips.statusLabels.cancelled": "Cancelled",
      })[key] ?? key,
  }),
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
let onRename: ReturnType<typeof vi.fn<(id: string) => void>>;
let onEditDates: ReturnType<typeof vi.fn<(id: string) => void>>;

function render() {
  act(() =>
    root.render(
      <TripCard
        trip={mockTrip}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onEditDates={onEditDates}
      />,
    ),
  );
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  onSelect = vi.fn<(id: string) => void>();
  onDelete = vi.fn<(id: string) => void>();
  onRename = vi.fn<(id: string) => void>();
  onEditDates = vi.fn<(id: string) => void>();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("TripCard", () => {
  it("renders non-draft statuses while hiding only the permanent draft state", () => {
    render();
    expect(host.textContent).toContain("Kyoto Weekend");
    expect(host.textContent).toContain("Status: Planned");

    for (const [status, label] of [
      ["completed", "Completed"],
      ["cancelled", "Cancelled"],
    ] as const) {
      act(() =>
        root.render(
          <TripCard
            trip={{ ...mockTrip, status }}
            onSelect={onSelect}
            onDelete={onDelete}
          />,
        ),
      );
      expect(host.textContent).toContain(`Status: ${label}`);
    }

    act(() =>
      root.render(
        <TripCard
          trip={{ ...mockTrip, status: "draft" }}
          onSelect={onSelect}
          onDelete={onDelete}
        />,
      ),
    );
    expect(host.textContent).not.toContain("Status:");
  });

  it("calls onSelect from the Edit itinerary action", () => {
    render();
    const editButton = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Edit itinerary"),
    );
    act(() => editButton?.click());
    expect(onSelect).toHaveBeenCalledWith("trip-1");
  });

  it("uses the canonical trip date range, never a stop date", () => {
    const datedTrip = {
      ...mockTrip,
      startDate: "2026-08-08",
      endDate: "2026-08-10",
      stops: [
        {
          id: "stop-1",
          type: "destination" as const,
          destinationId: "shibuya-city",
          name: "Shibuya City",
          date: "2026-08-12",
        },
      ],
    };
    act(() =>
      root.render(
        <TripCard trip={datedTrip} onSelect={onSelect} onDelete={onDelete} />,
      ),
    );
    expect(host.textContent).toContain("Aug 8–10, 2026");
    expect(host.textContent).not.toContain("Aug 12, 2026");
  });

  it("puts destructive actions behind an overflow menu", () => {
    render();
    expect(
      host.querySelector('button[aria-label="More actions"]'),
    ).not.toBeNull();
  });

  it("offers rename and set/edit dates from the overflow menu", () => {
    act(() =>
      root.render(
        <TripCard
          trip={mockTrip}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
          onEditDates={onEditDates}
        />,
      ),
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
        ?.click(),
    );

    expect(host.textContent).toContain("Rename");
    expect(host.textContent).toContain("Set dates");

    const rename = Array.from(host.querySelectorAll('[role="menuitem"]')).find(
      (item) => item.textContent?.includes("Rename"),
    );
    act(() => (rename as HTMLElement).click());
    expect(onRename).toHaveBeenCalledWith("trip-1");

    act(() =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
        ?.click(),
    );
    const setDates = Array.from(
      host.querySelectorAll('[role="menuitem"]'),
    ).find((item) => item.textContent?.includes("Set dates"));
    act(() => (setDates as HTMLElement).click());
    expect(onEditDates).toHaveBeenCalledWith("trip-1");

    act(() =>
      root.render(
        <TripCard
          trip={{ ...mockTrip, startDate: "2026-08-08" }}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
          onEditDates={onEditDates}
        />,
      ),
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="More actions"]')
        ?.click(),
    );
    expect(host.textContent).toContain("Edit dates");
  });

  it("shows confirm/cancel after delete click and calls onDelete on confirm", () => {
    render();

    const moreBtn = host.querySelector<HTMLButtonElement>(
      'button[aria-label="More actions"]',
    );
    act(() => moreBtn?.click());

    const deleteBtn = Array.from(
      host.querySelectorAll('[role="menuitem"]'),
    ).find((item) => item.textContent?.includes("ui.delete"));
    act(() => (deleteBtn as HTMLElement | undefined)?.click());

    // Should now show delete button
    expect(host.textContent).toContain("ui.delete");
    expect(host.textContent).toContain("ui.cancel");

    // Click confirm
    const confirmBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ui.delete"),
    );
    act(() => confirmBtn?.click());
    expect(onDelete).toHaveBeenCalledWith("trip-1");
  });

  it("cancels delete when cancel is clicked", () => {
    render();

    const moreBtn = host.querySelector<HTMLButtonElement>(
      'button[aria-label="More actions"]',
    );
    act(() => moreBtn?.click());

    const deleteBtn = Array.from(
      host.querySelectorAll('[role="menuitem"]'),
    ).find((item) => item.textContent?.includes("ui.delete"));
    act(() => (deleteBtn as HTMLElement | undefined)?.click());

    const cancelBtn = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ui.cancel"),
    );
    act(() => cancelBtn?.click());

    // Should not have called onDelete
    expect(onDelete).not.toHaveBeenCalled();
    // Confirm button should be gone
    expect(host.textContent).not.toContain("ui.delete");
  });

  it("displays stop count", () => {
    render();
    expect(host.textContent).toContain("0 stops");
  });
});
