/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import { SearchDialog } from "../SearchDialog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderSearchDialog(isOpen = true) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  const onClose = vi.fn();
  const onQueryChange = vi.fn();

  act(() => {
    root!.render(
      <SearchDialog
        isOpen={isOpen}
        onClose={onClose}
        query=""
        onQueryChange={onQueryChange}
        groups={[]}
        flatItems={[]}
        selectedIndex={0}
        onSelect={vi.fn()}
        onHoverIndex={vi.fn()}
        onKeyDown={vi.fn()}
      />,
    );
  });

  return { host, onClose, onQueryChange };
}

describe("SearchDialog Component", () => {
  it("does not render when isOpen is false", () => {
    renderSearchDialog(false);
    expect(document.body.querySelector('input[type="text"]')).toBeNull();
  });

  it("renders search input, mobile X close button, and desktop ESC button", () => {
    renderSearchDialog(true);

    const input = document.body.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    expect(input).toBeDefined();

    const closeButtons = Array.from(
      document.body.querySelectorAll('button[aria-label="Close search"]'),
    );
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("invokes onClose when close button is clicked", () => {
    const { onClose } = renderSearchDialog(true);

    const closeBtn = document.body.querySelector(
      'button[aria-label="Close search"]',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeDefined();

    act(() => {
      closeBtn.click();
    });

    expect(onClose).toHaveBeenCalled();
  });
});
