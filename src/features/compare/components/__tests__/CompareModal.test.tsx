import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import * as PlaceCatalog from "@/shared/services/place/PlaceCatalog";
import CompareModal from "../CompareModal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const compareState = vi.hoisted(() => ({
  compareList: ["kyoto-city", "osaka-city"],
  toggleCompare: vi.fn(),
  clearCompare: vi.fn(),
}));

vi.mock("@/shared/hooks/useTripStore", () => ({
  useTripStore: () => ({
    compareList: compareState.compareList,
    toggleCompare: compareState.toggleCompare,
    clearCompare: compareState.clearCompare,
  }),
}));

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  compareState.compareList = ["kyoto-city", "osaka-city"];
  compareState.toggleCompare.mockClear();
  compareState.clearCompare.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderCompareModal(isOpen = true) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <CompareModal isOpen={isOpen} onClose={vi.fn()} />
      </MemoryRouter>,
    );
  });
  return host;
}

describe("CompareModal Component", () => {
  it("does not render when isOpen is false", () => {
    const node = renderCompareModal(false);
    expect(node.children.length).toBe(0);
  });

  it("does not load the summary catalogue while mounted closed", async () => {
    const loadSpy = vi.spyOn(PlaceCatalog, "loadCatalogue");
    loadSpy.mockClear();
    const node = renderCompareModal(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(node.children.length).toBe(0);
    expect(loadSpy).not.toHaveBeenCalled();

    act(() => {
      root!.render(
        <MemoryRouter>
          <CompareModal isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadSpy).toHaveBeenCalledWith("summary");
    expect(node.textContent).toContain("Kyoto");

    act(() => {
      root!.render(
        <MemoryRouter>
          <CompareModal isOpen={false} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });
    expect(node.children.length).toBe(0);

    act(() => {
      root!.render(
        <MemoryRouter>
          <CompareModal isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(node.textContent).toContain("Kyoto");
    loadSpy.mockRestore();
  });
  it("renders both fixture destinations and their view links", () => {
    const node = renderCompareModal(true);

    // Both fixture destinations render
    expect(node.textContent).toContain("Kyoto");
    expect(node.textContent).toContain("Osaka");

    // Each destination exposes its View action link
    const links = Array.from(node.querySelectorAll("a"));
    const kyotoLink = links.find((a) =>
      a.getAttribute("href")?.endsWith("/kyoto-city"),
    );
    const osakaLink = links.find((a) =>
      a.getAttribute("href")?.endsWith("/osaka-city"),
    );

    expect(kyotoLink).not.toBeUndefined();
    expect(osakaLink).not.toBeUndefined();

    // Empty-state message is absent while compared destinations exist
    expect(node.textContent).not.toContain("ui.nothingToCompare");
  });

  it("triggers toggleCompare with correct destination ID when remove button is clicked", () => {
    const node = renderCompareModal(true);

    const removeButtons = Array.from(
      node.querySelectorAll("button[aria-label*='compare.removeFromCompare']"),
    );
    expect(removeButtons.length).toBeGreaterThan(0);

    act(() => {
      (removeButtons[0] as HTMLButtonElement).click();
    });

    expect(compareState.toggleCompare).toHaveBeenCalledWith("kyoto-city");
  });

  it("triggers clearCompare when Clear All is clicked", () => {
    const node = renderCompareModal(true);

    const clearButton = Array.from(node.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ui.clearAll"),
    );
    expect(clearButton).not.toBeUndefined();

    act(() => {
      clearButton?.click();
    });

    expect(compareState.clearCompare).toHaveBeenCalledTimes(1);
  });

  it("displays empty state when compareList is empty", () => {
    compareState.compareList = [];
    const node = renderCompareModal(true);

    expect(node.textContent).toContain("ui.nothingToCompare");
  });
});
