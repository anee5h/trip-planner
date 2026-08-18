import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import { SearchableDestinationPicker } from "../SearchableDestinationPicker";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function renderPicker(onSelect = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<SearchableDestinationPicker onSelect={onSelect} />);
  });
  return onSelect;
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  setViewport(1024);
});

describe("SearchableDestinationPicker", () => {
  // KAI-121: the picker uses the full catalogue (via useFullCatalogue);
  // preload so it renders full data synchronously in tests.
  beforeAll(async () => {
    await loadDestinationsIndex();
  });

  it("keeps the desktop combobox separate from its controlled listbox", () => {
    setViewport(1024);
    renderPicker();

    const trigger = host!.querySelector("button")!;
    act(() => trigger.click());

    const input = host!.querySelector('[role="combobox"]')!;
    const listbox = host!.querySelector('[role="listbox"]')!;
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(input.parentElement).not.toBe(listbox);
  });

  it("moves once and selects once from the mobile combobox", () => {
    setViewport(375);
    const onSelect = renderPicker();

    act(() => host!.querySelector("button")!.click());

    const input = host!.querySelector('[role="combobox"]')!;
    const options = Array.from(
      host!.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
