/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TripDatesEditor from "../TripDatesEditor";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) =>
      ({
        "ui.startDate": "Start date",
        "ui.endDate": "End date",
        "ui.selectDate": "Select date",
        "ui.invalidDates": "Start date cannot be after end date",
        "ui.cancel": "Cancel",
        "ui.save": "Save",
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
  props: Partial<React.ComponentProps<typeof TripDatesEditor>> = {},
) {
  const onSave = props.onSave ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  act(() => {
    root!.render(
      <TripDatesEditor onSave={onSave} onCancel={onCancel} {...props} />,
    );
  });
  return { onSave, onCancel };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("TripDatesEditor", () => {
  it("renders native date controls with clear labels and state", () => {
    renderEditor({ initialStartDate: "2026-08-08" });

    const start = host!.querySelector<HTMLInputElement>(
      'input[type="date"][name="startDate"]',
    );
    const end = host!.querySelector<HTMLInputElement>(
      'input[type="date"][name="endDate"]',
    );

    expect(start?.value).toBe("2026-08-08");
    expect(end?.value).toBe("");
    expect(end?.className).toContain("text-transparent");
    expect(host!.textContent).toContain("Select date");
    expect(host!.querySelector('label[for="trip-start-date"]')).not.toBeNull();
    expect(host!.querySelector('label[for="trip-end-date"]')).not.toBeNull();
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

  it("emits canonical date values and undefined for cleared fields", () => {
    const { onSave } = renderEditor({
      initialStartDate: "2026-08-08",
      initialEndDate: "2026-08-09",
    });

    const end = host!.querySelector<HTMLInputElement>('input[name="endDate"]')!;
    act(() => {
      setInputValue(end, "");
    });
    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(onSave).toHaveBeenCalledWith("2026-08-08", undefined);
  });

  it("preserves a single-day canonical range", () => {
    const { onSave } = renderEditor({
      initialStartDate: "2026-08-08",
      initialEndDate: "2026-08-08",
    });

    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(onSave).toHaveBeenCalledWith("2026-08-08", "2026-08-08");
  });

  it("preserves a multi-day canonical range", () => {
    const { onSave } = renderEditor({
      initialStartDate: "2026-08-08",
      initialEndDate: "2026-08-12",
    });

    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(onSave).toHaveBeenCalledWith("2026-08-08", "2026-08-12");
  });

  it("clears the end date when the start date is cleared", () => {
    const { onSave } = renderEditor({
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

    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(onSave).toHaveBeenCalledWith(undefined, undefined);
  });

  it("clamps the end date when the start date moves later", () => {
    const { onSave } = renderEditor({
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

    expect(onSave).toHaveBeenCalledWith("2026-08-10", "2026-08-10");
  });

  it("normalizes an orphaned initial end date", () => {
    const { onSave } = renderEditor({
      initialStartDate: "",
      initialEndDate: "2026-08-09",
    });

    const end = host!.querySelector<HTMLInputElement>('input[name="endDate"]')!;
    expect(end.value).toBe("");

    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(onSave).toHaveBeenCalledWith(undefined, undefined);
  });

  it("uses the native minimum to prevent an end date before the start date", () => {
    const { onSave } = renderEditor({
      initialStartDate: "2026-08-10",
      initialEndDate: "2026-08-08",
    });
    const end = host!.querySelector<HTMLInputElement>('input[name="endDate"]')!;

    expect(end.validity.rangeUnderflow).toBe(true);
    act(() => {
      host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });

    expect(onSave).not.toHaveBeenCalled();
  });
});
