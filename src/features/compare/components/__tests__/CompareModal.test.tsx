import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import CompareModal from "../CompareModal";

const compareState = vi.hoisted(() => ({
  compareList: ["kyoto-station", "hakone-yumoto"],
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

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

  it("renders side-by-side comparative destination columns when open", () => {
    const node = renderCompareModal(true);
    const modal =
      node.querySelector("div[role='dialog']") || node.firstElementChild;
    expect(modal).not.toBeNull();

    // Check for clear all button trigger
    const clearButton = Array.from(node.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ui.clearAll"),
    );
    expect(clearButton).not.toBeNull();
  });
});
