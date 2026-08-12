/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchDocument, SearchGroup } from "../types";
import { SearchResults } from "../SearchResults";

const testGlobals = globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
testGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function doc(id: string): SearchDocument {
  return {
    id,
    title: id,
    subtitle: "subtitle",
    type: "destination",
    url: `/destinations/${id}`,
    keywords: [],
    category: "City",
  };
}

function popularGroup(count: number, mobileCollapsible = true): SearchGroup {
  return {
    type: "destination",
    label: "Popular Destinations",
    mobileCollapsible,
    items: Array.from({ length: count }, (_, i) => doc(`dest-${i}`)),
  };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function render(groups: SearchGroup[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <SearchResults
        groups={groups}
        flatItems={groups.flatMap((g) => g.items)}
        selectedIndex={0}
        onSelect={() => undefined}
        onHoverIndex={() => undefined}
      />,
    );
  });
  return host;
}

function rowButtons(host: HTMLDivElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => button.className.includes("py-3.5"),
  );
}

describe("SearchResults — mobile collapsible groups (KAI-83)", () => {
  it("collapses a flagged group to the first four rows on mobile", () => {
    const host = render([popularGroup(8)]);

    const rows = rowButtons(host);
    expect(rows).toHaveLength(8);
    expect(
      rows
        .slice(0, 4)
        .every((row) => !row.className.includes("hidden sm:flex")),
    ).toBe(true);
    expect(
      rows.slice(4).every((row) => row.className.includes("hidden sm:flex")),
    ).toBe(true);

    const seeMore = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "ui.seeMore",
    );
    expect(seeMore).toBeTruthy();
    // The toggle itself is mobile-only (hidden at the sm breakpoint).
    expect(seeMore?.className).toContain("sm:hidden");
  });

  it("expands the full list when See more is clicked", () => {
    const host = render([popularGroup(8)]);

    const seeMore = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "ui.seeMore",
    );
    act(() => seeMore?.click());

    const rows = rowButtons(host);
    expect(rows.every((row) => !row.className.includes("hidden sm:flex"))).toBe(
      true,
    );
    expect(
      Array.from(host.querySelectorAll("button")).some(
        (button) => button.textContent === "ui.seeMore",
      ),
    ).toBe(false);
  });

  it("leaves unflagged groups untouched", () => {
    const host = render([popularGroup(8, false)]);

    const rows = rowButtons(host);
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => !row.className.includes("hidden sm:flex"))).toBe(
      true,
    );
    expect(host.textContent).not.toContain("ui.seeMore");
  });
});
