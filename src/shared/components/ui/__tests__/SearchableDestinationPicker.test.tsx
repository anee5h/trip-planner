import { act } from "react";
import type { Destination } from "@/shared/types/destination";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  loadLiteIndex,
  loadDestinationsIndex,
} from "@/shared/services/place/PlaceCatalog";
import * as PlaceCatalog from "@/shared/services/place/PlaceCatalog";
import { SearchableDestinationPicker } from "../SearchableDestinationPicker";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function renderPicker(onSelect = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<SearchableDestinationPicker onSelect={onSelect} />);
    // Flush the lite-catalogue microtask.
    await Promise.resolve();
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
    await loadLiteIndex();
  });

  it("keeps the desktop combobox separate from its controlled listbox", async () => {
    setViewport(1024);
    await renderPicker();

    const trigger = host!.querySelector("button")!;
    act(() => trigger.click());

    const input = host!.querySelector('[role="combobox"]')!;
    const listbox = host!.querySelector('[role="listbox"]')!;
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(input.parentElement).not.toBe(listbox);
  });

  it("moves once and selects once from the mobile combobox", async () => {
    setViewport(375);
    const onSelect = await renderPicker();

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

  it("does not load the summary catalogue when destinations are parent-owned", async () => {
    const loadSpy = vi.spyOn(PlaceCatalog, "loadCatalogue");
    loadSpy.mockClear();
    const parentDestination = {
      id: "parent-destination",
      name: "Parent destination",
      prefecture: "Kyoto",
    } as Destination;

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <SearchableDestinationPicker
          destinations={[parentDestination]}
          onSelect={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(loadSpy).not.toHaveBeenCalled();
    loadSpy.mockRestore();
  });
});
