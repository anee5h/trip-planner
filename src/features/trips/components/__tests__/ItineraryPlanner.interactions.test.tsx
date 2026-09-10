/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ItineraryPlanner from "../ItineraryPlanner";
import type { Trip } from "@/shared/types/trip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, fallback?: string) =>
      ({ "ui.addStopShort": "Add stop" })[key] ?? fallback ?? key,
  }),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({ favorites: [] }),
}));

vi.mock("@/shared/hooks/useRecentlyViewedDestinations", () => ({
  useRecentlyViewedDestinations: () => [],
}));

vi.mock("@/shared/hooks/useCatalogue", () => ({
  useCatalogue: () => ({
    places: [{ id: "ginza", name: "Ginza" }],
    error: null,
    retry: vi.fn(),
  }),
}));

vi.mock("@/shared/components/ui/SearchableDestinationPicker", () => ({
  SearchableDestinationPicker: () => <div data-testid="destination-picker" />,
}));

const baseTrip: Trip = {
  id: "trip-1",
  userId: "user-1",
  title: "Tokyo Day",
  status: "draft",
  startDate: "2026-08-08",
  endDate: "2026-08-09",
  stops: [
    {
      id: "stop-1",
      type: "destination",
      destinationId: "ginza",
      name: "Ginza",
      date: "2026-08-08",
    },
    {
      id: "stop-2",
      type: "custom",
      name: "A very long manual stop title that must remain readable without a canonical link",
      notes:
        "A long manual note that must occupy its own visible line instead of being clipped.",
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const sameDayTrip: Trip = {
  ...baseTrip,
  stops: baseTrip.stops.map((stop) => ({ ...stop, date: "2026-08-08" })),
};

const fourStopTrip: Trip = {
  ...sameDayTrip,
  stops: [
    { id: "a", type: "custom", name: "A", date: "2026-08-08" },
    { id: "b", type: "custom", name: "B", date: "2026-08-08" },
    { id: "c", type: "custom", name: "C", date: "2026-08-08" },
    { id: "d", type: "custom", name: "D", date: "2026-08-08" },
  ],
};

let root: Root;
let host: HTMLDivElement;
let onReorderStops: ReturnType<
  typeof vi.fn<(startIndex: number, endIndex: number) => void>
>;

function renderPlanner(trip = baseTrip) {
  act(() => {
    root.render(
      <MemoryRouter>
        <ItineraryPlanner
          trip={trip}
          onAddStop={vi.fn()}
          onRemoveStop={vi.fn()}
          onReorderStops={onReorderStops}
        />
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  onReorderStops = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function pointerDown(element: Element) {
  act(() => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "touch",
        button: 0,
      }),
    );
  });
}

describe("ItineraryPlanner stop interactions", () => {
  it("links canonical stops and leaves custom note-only stops unlinked", () => {
    renderPlanner();

    expect(
      host
        .querySelector<HTMLAnchorElement>("[data-stop-link]")
        ?.getAttribute("href"),
    ).toBe("/destinations/ginza");
    expect(host.querySelectorAll("[data-stop-link]")).toHaveLength(1);
    expect(host.textContent).toContain("A very long manual stop title");
    expect(host.textContent).toContain("A long manual note that must occupy");
    expect(host.querySelector("[data-stop-link]")?.className).toContain(
      "focus-visible:ring-2",
    );
  });

  it("renders a legacy itinerary beginning with several unscheduled stops", () => {
    const legacyTrip: Trip = {
      ...baseTrip,
      stops: [
        { id: "legacy-1", type: "custom", name: "Legacy hotel" },
        { id: "legacy-2", type: "custom", name: "Legacy dinner" },
        {
          id: "dated-1",
          type: "custom",
          name: "Dated museum",
          date: "2026-08-08",
        },
        { id: "legacy-3", type: "custom", name: "Legacy walk" },
      ],
    };

    expect(() => renderPlanner(legacyTrip)).not.toThrow();
    expect(host.textContent).toContain("Unscheduled");
  });

  it("derives canonical day choices and removes the competing date input", () => {
    renderPlanner();

    expect(host.textContent).toContain("Day 1 · Aug 8, 2026");
    expect(host.textContent).toContain("Day 2 · Aug 9, 2026");
    expect(host.textContent).toContain("Unscheduled");
    expect(host.textContent).not.toContain("Day 3");
    expect(host.querySelector('input[type="date"]')).toBeNull();
  });

  it("labels legacy stop dates outside the canonical trip range explicitly", () => {
    renderPlanner({
      ...baseTrip,
      endDate: "2026-08-09",
      stops: [
        {
          ...baseTrip.stops[0],
          date: "2026-08-12",
        },
      ],
    });

    expect(host.textContent).toContain("Outside trip dates · Aug 12, 2026");
    expect(host.textContent).not.toContain("Day 5");
  });

  it("treats a missing canonical end date as a single-day trip", () => {
    renderPlanner({
      ...baseTrip,
      endDate: undefined,
      stops: [
        {
          ...baseTrip.stops[0],
          date: "2026-08-12",
        },
      ],
    });

    expect(host.textContent).toContain("Outside trip dates · Aug 12, 2026");
    expect(host.textContent).not.toContain("Day 5");
  });

  it("uses a bounded date input instead of rendering unbounded date presets", () => {
    renderPlanner({
      ...baseTrip,
      endDate: "2036-08-08",
      stops: [],
    });

    const dateInput =
      host.querySelector<HTMLInputElement>('input[type="date"]');
    expect(dateInput).not.toBeNull();
    expect(host.querySelector('label[for="stop-date"]')).not.toBeNull();
    expect(host.querySelector('input[type="date"]#stop-date')).not.toBeNull();
    expect(dateInput?.min).toBe("2026-08-08");
    expect(dateInput?.max).toBe("2036-08-08");
    expect(host.textContent).not.toContain("Day 365");
  });

  it("keeps first and last accessible move actions disabled at the boundaries", () => {
    renderPlanner(sameDayTrip);
    const menus = host.querySelectorAll('[role="menu"]');
    expect(menus).toHaveLength(0);

    const actionButtons = host.querySelectorAll<HTMLButtonElement>(
      "[data-stop-actions]",
    );
    act(() => actionButtons[0]?.click());
    const firstMenuItems = host.querySelectorAll<HTMLButtonElement>(
      '[role="menu"] [role="menuitem"]',
    );
    expect(firstMenuItems[0].disabled).toBe(true);
    expect(firstMenuItems[1].disabled).toBe(false);

    act(() => actionButtons[1]?.click());
    const lastMenuItems = host.querySelectorAll<HTMLButtonElement>(
      '[role="menu"] [role="menuitem"]',
    );
    expect(lastMenuItems[0].disabled).toBe(false);
    expect(lastMenuItems[1].disabled).toBe(true);
  });

  it("keeps remove inside the overflow menu instead of a permanent row action", () => {
    renderPlanner();
    expect(
      host.querySelector('[aria-label="Remove stop from itinerary"]'),
    ).toBeNull();

    const actionButtons = host.querySelectorAll<HTMLButtonElement>(
      "[data-stop-actions]",
    );
    act(() => actionButtons[0]?.click());

    expect(
      host.querySelector('[role="menuitem"]:last-child')?.textContent,
    ).toContain("Remove stop from itinerary");
  });

  it("commits a touch drag through the canonical reorder callback", () => {
    renderPlanner(sameDayTrip);
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>("[data-stop-id]"),
    );
    Object.defineProperty(rows[0], "getBoundingClientRect", {
      value: () => ({ top: 0, height: 50 }),
    });
    Object.defineProperty(rows[1], "getBoundingClientRect", {
      value: () => ({ top: 50, height: 50 }),
    });
    const handle = host.querySelector<HTMLElement>("[data-drag-handle]")!;

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 3,
          pointerType: "touch",
          button: 0,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 3,
          pointerType: "touch",
          clientY: 90,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 3,
          pointerType: "touch",
          clientY: 90,
        }),
      );
    });

    expect(onReorderStops).toHaveBeenCalledWith(0, 1);
  });

  it("does not drag across a repeated date group separated by another date", () => {
    renderPlanner({
      ...sameDayTrip,
      stops: [
        { id: "a", type: "custom", name: "A", date: "2026-08-08" },
        { id: "x", type: "custom", name: "X", date: "2026-08-09" },
        { id: "b", type: "custom", name: "B", date: "2026-08-08" },
      ],
    });
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>("[data-stop-id]"),
    );
    rows.forEach((row, index) => {
      Object.defineProperty(row, "getBoundingClientRect", {
        value: () => ({ top: index * 50, height: 50 }),
      });
    });
    const handle = host.querySelector<HTMLElement>("[data-drag-handle]")!;

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 4,
          pointerType: "mouse",
          button: 0,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 4,
          pointerType: "mouse",
          clientY: 125,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 4,
          pointerType: "mouse",
          clientY: 125,
        }),
      );
    });

    expect(onReorderStops).not.toHaveBeenCalled();
  });

  it("uses the overflow menu as the accessible move fallback", () => {
    renderPlanner(sameDayTrip);
    const actionButton = host.querySelector<HTMLButtonElement>(
      "[data-stop-actions]",
    );
    act(() => actionButton?.click());

    const moveDown = host.querySelectorAll<HTMLButtonElement>(
      '[role="menu"] [role="menuitem"]',
    )[1];
    act(() => moveDown?.click());

    expect(onReorderStops).toHaveBeenCalledWith(0, 1);
  });

  it("exposes clear handle, drag target, scroll, and menu-dismissal affordances", () => {
    renderPlanner(sameDayTrip);
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>("[data-stop-id]"),
    );
    Object.defineProperty(rows[0], "getBoundingClientRect", {
      value: () => ({ top: 0, height: 50 }),
    });
    Object.defineProperty(rows[1], "getBoundingClientRect", {
      value: () => ({ top: 50, height: 50 }),
    });

    const handle = host.querySelector<HTMLElement>("[data-drag-handle]")!;
    expect(handle.className).toContain("touch-none");
    expect(handle.className).toContain("min-h-11");
    expect(rows[0].className).toContain("touch-pan-y");
    expect(rows[0].className).not.toMatch(/(?:^|:)h-/);

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 31,
          pointerType: "touch",
          button: 0,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 31,
          pointerType: "touch",
          clientY: 90,
        }),
      );
    });

    expect(rows[0].getAttribute("data-drag-state")).toBe("dragging");
    expect(rows[1].getAttribute("data-drag-target")).toBe("true");

    act(() => {
      host.querySelector<HTMLButtonElement>("[data-stop-actions]")?.click();
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it("collapses the add-stop panel for existing itineraries and reopens it on demand", () => {
    renderPlanner(baseTrip);
    const panel = () =>
      host.querySelector<HTMLElement>("[data-add-stop-panel]");
    const toggle = host.querySelector<HTMLButtonElement>(
      "[data-add-stop-toggle]",
    );

    expect(panel()?.dataset.state).toBe("collapsed");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    act(() => toggle?.click());
    expect(panel()?.dataset.state).toBe("expanded");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    act(() =>
      host.querySelector<HTMLButtonElement>("[data-add-stop-cancel]")?.click(),
    );
    expect(panel()?.dataset.state).toBe("collapsed");
  });

  it("keeps add-stop expanded for an empty itinerary", () => {
    renderPlanner({ ...baseTrip, stops: [] });

    expect(
      host.querySelector<HTMLElement>("[data-add-stop-panel]")?.dataset.state,
    ).toBe("expanded");
  });

  it("uses one concise collapsed add-stop affordance", () => {
    renderPlanner(baseTrip);

    const form = host.querySelector("[data-add-stop-form]")!;
    const toggle = host.querySelector<HTMLButtonElement>(
      "[data-add-stop-toggle]",
    )!;

    expect(form.getAttribute("data-add-stop-collapsed")).toBe("true");
    expect(toggle.textContent).toContain("Add stop");
    expect(form.textContent).not.toMatch(
      /Add itinerary stop[\s\S]*Add itinerary stop/,
    );
  });

  it("keeps stop controls in a quiet aligned action cluster", () => {
    renderPlanner(sameDayTrip);

    const rows = host.querySelectorAll("[data-stop-id]");
    const clusters = host.querySelectorAll("[data-stop-action-cluster]");
    const handles = host.querySelectorAll("[data-drag-handle]");
    const actionButtons = host.querySelectorAll("[data-stop-actions]");

    expect(clusters).toHaveLength(rows.length);
    expect(clusters[0]?.querySelector("[data-drag-handle]")).toBe(handles[0]);
    expect(clusters[0]?.querySelector("[data-stop-actions]")).toBe(
      actionButtons[0],
    );
    expect(handles[0]?.className).not.toContain("border-dashed");
    expect(handles[0]?.className).not.toContain("bg-slate-50");
  });
  it("starts pointer drag from the handle, not from the title link", () => {
    renderPlanner();
    const handle = host.querySelector<HTMLElement>("[data-drag-handle]");
    const link = host.querySelector<HTMLElement>("[data-stop-link]");
    expect(handle).not.toBeNull();
    expect(link).not.toBeNull();

    pointerDown(link!);
    expect(handle?.getAttribute("aria-grabbed")).toBe("false");

    pointerDown(handle!);
    expect(handle?.getAttribute("aria-grabbed")).toBe("true");
    expect(onReorderStops).not.toHaveBeenCalled();
  });

  it("commits a handle drag through the canonical reorder callback", () => {
    renderPlanner(sameDayTrip);
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>("[data-stop-id]"),
    );
    Object.defineProperty(rows[0], "getBoundingClientRect", {
      value: () => ({ top: 0, height: 50 }),
    });
    Object.defineProperty(rows[1], "getBoundingClientRect", {
      value: () => ({ top: 50, height: 50 }),
    });
    const handle = host.querySelector<HTMLElement>("[data-drag-handle]")!;

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 2,
          pointerType: "mouse",
          button: 0,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 2,
          pointerType: "mouse",
          clientY: 90,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 2,
          pointerType: "mouse",
          clientY: 90,
        }),
      );
    });

    expect(onReorderStops).toHaveBeenCalledWith(0, 1);
  });

  it("maps four-stop pointer drops to post-removal insertion positions", () => {
    renderPlanner(fourStopTrip);
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>("[data-stop-id]"),
    );
    rows.forEach((row, index) => {
      Object.defineProperty(row, "getBoundingClientRect", {
        value: () => ({ top: index * 50, height: 50 }),
      });
    });

    const drag = (startIndex: number, clientY: number, pointerId: number) => {
      const handle =
        host.querySelectorAll<HTMLElement>("[data-drag-handle]")[startIndex];
      act(() => {
        handle.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerId,
            pointerType: "mouse",
            button: 0,
          }),
        );
        handle.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId,
            pointerType: "mouse",
            clientY,
          }),
        );
        handle.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            pointerId,
            pointerType: "mouse",
            clientY,
          }),
        );
      });
    };

    drag(0, 120, 10); // first -> middle, before C
    drag(1, 220, 11); // middle -> later, after D
    drag(3, 120, 12); // last -> middle, before C
    drag(0, 300, 13); // first -> last
    drag(2, 10, 14); // upward reorder, before A

    expect(onReorderStops.mock.calls).toEqual([
      [0, 1],
      [1, 3],
      [3, 2],
      [0, 3],
      [2, 0],
    ]);
  });

  it("does not allow fallback or drag reorder to cross a day group", () => {
    renderPlanner();
    const actionButton = host.querySelector<HTMLButtonElement>(
      "[data-stop-actions]",
    );
    act(() => actionButton?.click());
    const moveDown = host.querySelectorAll<HTMLButtonElement>(
      '[role="menu"] [role="menuitem"]',
    )[1];
    expect(moveDown.disabled).toBe(true);

    const rows = Array.from(
      host.querySelectorAll<HTMLElement>("[data-stop-id]"),
    );
    Object.defineProperty(rows[0], "getBoundingClientRect", {
      value: () => ({ top: 0, height: 50 }),
    });
    Object.defineProperty(rows[1], "getBoundingClientRect", {
      value: () => ({ top: 50, height: 50 }),
    });
    const handle = host.querySelector<HTMLElement>("[data-drag-handle]")!;
    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 15,
          pointerType: "touch",
          button: 0,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 15,
          pointerType: "touch",
          clientY: 100,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 15,
          pointerType: "touch",
          clientY: 100,
        }),
      );
    });
    expect(onReorderStops).not.toHaveBeenCalled();
  });

  it("aborts a pointercancel instead of committing the current drag target", () => {
    renderPlanner(sameDayTrip);
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>("[data-stop-id]"),
    );
    Object.defineProperty(rows[0], "getBoundingClientRect", {
      value: () => ({ top: 0, height: 50 }),
    });
    Object.defineProperty(rows[1], "getBoundingClientRect", {
      value: () => ({ top: 50, height: 50 }),
    });
    const handle = host.querySelector<HTMLElement>("[data-drag-handle]")!;

    act(() => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 16,
          pointerType: "touch",
          button: 0,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 16,
          pointerType: "touch",
          clientY: 90,
        }),
      );
      handle.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          pointerId: 16,
          pointerType: "touch",
          clientY: 90,
        }),
      );
    });

    expect(onReorderStops).not.toHaveBeenCalled();
  });
});
