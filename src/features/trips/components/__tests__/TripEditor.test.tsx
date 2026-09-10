/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TripEditor from "../TripEditor";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "ui.tripTitle": "Trip title",
        "ui.tripTitlePlaceholder": "e.g. Kyoto weekend",
        "ui.startDate": "Start date",
        "ui.endDate": "End date",
        "ui.selectDate": "Select date",
        "ui.invalidDates": "Start date cannot be after end date",
        "ui.cancel": "Cancel",
        "ui.saveTrip": "Save trip",
      })[key] ?? key,
  }),
}));

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderEditor(
  props: Partial<React.ComponentProps<typeof TripEditor>> = {},
) {
  const onSave = vi.fn();
  act(() => {
    root!.render(<TripEditor onSave={onSave} onCancel={vi.fn()} {...props} />);
  });
  return onSave;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("TripEditor", () => {
  it("makes optional title and native date fields understandable when empty", () => {
    renderEditor();

    expect(
      host!.querySelector('input[name="title"]')?.getAttribute("placeholder"),
    ).toBe("e.g. Kyoto weekend");
    expect(host!.querySelectorAll('input[type="date"]')).toHaveLength(2);
    expect(host!.textContent).toContain("Select date");
    expect(host!.querySelector('label[for="trip-start-date"]')).not.toBeNull();
    expect(host!.querySelector('label[for="trip-end-date"]')).not.toBeNull();
  });

  it("passes a blank title through for existing smart-title generation", () => {
    const onSave = renderEditor();
    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(onSave).toHaveBeenCalledWith("", undefined, undefined);
  });

  it("keeps End Date disabled until Start Date exists and bounds it", () => {
    renderEditor();

    const start = host!.querySelector<HTMLInputElement>(
      'input[name="startDate"]',
    )!;
    const end = host!.querySelector<HTMLInputElement>('input[name="endDate"]')!;

    expect(end.disabled).toBe(true);
    expect(end.min).toBe("");

    act(() => {
      setInputValue(start, "2026-08-08");
    });

    expect(end.disabled).toBe(false);
    expect(end.min).toBe("2026-08-08");
  });

  it("clears End Date when Start Date is cleared", () => {
    const onSave = renderEditor({
      initialStartDate: "2026-08-08",
      initialEndDate: "2026-08-09",
    });
    const start = host!.querySelector<HTMLInputElement>(
      'input[name="startDate"]',
    )!;
    const end = host!.querySelector<HTMLInputElement>('input[name="endDate"]')!;

    act(() => {
      setInputValue(start, "");
    });

    expect(end.value).toBe("");
    expect(end.disabled).toBe(true);
    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    expect(onSave).toHaveBeenCalledWith("", undefined, undefined);
  });

  it("clamps End Date when Start Date moves beyond it", () => {
    const onSave = renderEditor({
      initialStartDate: "2026-08-08",
      initialEndDate: "2026-08-09",
    });
    const start = host!.querySelector<HTMLInputElement>(
      'input[name="startDate"]',
    )!;
    const end = host!.querySelector<HTMLInputElement>('input[name="endDate"]')!;

    act(() => {
      setInputValue(start, "2026-08-10");
    });

    expect(end.value).toBe("2026-08-10");
    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    expect(onSave).toHaveBeenCalledWith("", "2026-08-10", "2026-08-10");
  });
});
