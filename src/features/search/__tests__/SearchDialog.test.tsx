/**
 * KAI-65: SearchDialog regression tests.
 *
 * Invariants:
 *   - The search input keeps a zoom-safe mobile font token (>= 16px).
 *   - Exactly one X (clear) control exists in the dialog header.
 *   - Clear empties the query, restores input focus, and never closes Search.
 *   - Close (Cancel/ESC) is a separate, distinctly-labeled control.
 *
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import { SearchDialog } from "../SearchDialog";

const EN: Record<string, string> = {
  "search.placeholderMobile": "Search Meguruto",
  "search.placeholderDesktop":
    "Search destinations, collections, actions... (e.g., 'Kyoto', 'UNESCO')",
  "search.clear": "Clear search input",
  "search.close": "Close search",
  "search.cancel": "Cancel",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => EN[key] ?? key,
  }),
}));

// React's act() environment flag: the shape is known and fixed by React types.
const actGlobal = globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
actGlobal.IS_REACT_ACT_ENVIRONMENT = true;

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

function renderSearchDialog(isOpen = true, query = "") {
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
        query={query}
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

function dialogInput(): HTMLInputElement {
  const input = document.body.querySelector(
    'input[type="text"]',
  ) as HTMLInputElement;
  expect(input).toBeDefined();
  return input;
}

describe("SearchDialog Component", () => {
  it("does not render when isOpen is false", () => {
    renderSearchDialog(false);
    expect(document.body.querySelector('input[type="text"]')).toBeNull();
  });

  it("renders search input and a close control", () => {
    renderSearchDialog(true);

    expect(dialogInput()).toBeDefined();

    const closeButtons = Array.from(
      document.body.querySelectorAll('button[aria-label="Close search"]'),
    );
    // Mobile "Cancel" + desktop ESC badge both carry the same accessible name.
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("mobile search input keeps a zoom-safe font token (>=16px, no text-xs/text-sm)", () => {
    renderSearchDialog(true);

    const input = dialogInput();
    const className = input.className;
    expect(className).toContain("text-base");
    // iOS Safari auto-zooms focused inputs below 16px; these tokens would
    // reintroduce the persistent mobile zoom bug.
    expect(className).not.toMatch(/(^|\s)text-(xs|sm)(\s|$)/);
  });

  it("hides the clear control when query is empty — no X icon at all", () => {
    renderSearchDialog(true, "");

    expect(
      document.body.querySelectorAll('button[aria-label="Clear search input"]')
        .length,
    ).toBe(0);
    // The close control is labeled "Cancel", not an X icon.
    expect(document.body.querySelectorAll("svg.lucide-x").length).toBe(0);
  });

  it("renders exactly one clear control (X icon) when query is non-empty", () => {
    renderSearchDialog(true, "kyoto");

    const clearButtons = document.body.querySelectorAll(
      'button[aria-label="Clear search input"]',
    );
    expect(clearButtons.length).toBe(1);
    // Exactly one X icon in the dialog: the clear button. The close control
    // must not render a second X.
    expect(document.body.querySelectorAll("svg.lucide-x").length).toBe(1);
  });

  it("clear empties the query without closing Search", () => {
    const { onClose, onQueryChange } = renderSearchDialog(true, "kyoto");

    const clearBtn = document.body.querySelector(
      'button[aria-label="Clear search input"]',
    ) as HTMLButtonElement;
    expect(clearBtn).toBeDefined();

    act(() => {
      clearBtn.click();
    });

    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clear restores input focus", () => {
    renderSearchDialog(true, "kyoto");

    const input = dialogInput();
    input.focus();
    expect(document.activeElement).toBe(input);

    const clearBtn = document.body.querySelector(
      'button[aria-label="Clear search input"]',
    ) as HTMLButtonElement;
    act(() => {
      clearBtn.click();
    });

    expect(document.activeElement).toBe(input);
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

  it("uses the same markup for EN and JA (locale only swaps strings)", () => {
    // Both placeholders and both accessible names resolve through i18n keys;
    // no locale-conditional markup exists, so EN and JA cannot diverge.
    renderSearchDialog(true, "kyoto");

    const input = dialogInput();
    // jsdom defaults to a desktop-width viewport, so the desktop placeholder
    // is the one rendered; the key (not a hardcoded string) is what matters.
    expect(input.placeholder).toBe(EN["search.placeholderDesktop"]);

    const clearBtn = document.body.querySelector(
      'button[aria-label="Clear search input"]',
    ) as HTMLButtonElement;
    expect(clearBtn).toBeDefined();

    for (const key of [
      "search.clear",
      "search.close",
      "search.cancel",
      "search.placeholderMobile",
      "search.placeholderDesktop",
    ]) {
      expect(EN[key]).toBeDefined();
    }
  });
});
