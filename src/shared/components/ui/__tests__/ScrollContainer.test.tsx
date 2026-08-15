/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ScrollContainer } from "../ScrollContainer";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderRail(
  labels = {
    ariaLabel: "Seasonal destinations",
    previousLabel: "Scroll left",
    nextLabel: "Scroll right",
  },
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <ScrollContainer
        ariaLabel={labels.ariaLabel}
        previousLabel={labels.previousLabel}
        nextLabel={labels.nextLabel}
      >
        <div style={{ width: "1200px" }}>cards</div>
      </ScrollContainer>,
    );
  });
  const region = host.querySelector<HTMLElement>('[role="region"]')!;
  Object.defineProperties(region, {
    clientWidth: { configurable: true, value: 500 },
    scrollWidth: { configurable: true, value: 1200 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
  });
  return region;
}

function refresh(region: HTMLElement) {
  act(() => region.dispatchEvent(new Event("scroll")));
}

describe("ScrollContainer", () => {
  it("does not show navigation when content fits", () => {
    const region = renderRail();
    Object.defineProperty(region, "scrollWidth", {
      configurable: true,
      value: 500,
    });
    refresh(region);

    expect(host!.querySelector('button[aria-label="Scroll left"]')).toBeNull();
    expect(host!.querySelector('button[aria-label="Scroll right"]')).toBeNull();
  });

  it("shows the right arrow, then both arrows after scrolling", () => {
    const region = renderRail();
    refresh(region);

    expect(host!.querySelector('button[aria-label="Scroll left"]')).toBeNull();
    expect(
      host!.querySelector('button[aria-label="Scroll right"]'),
    ).not.toBeNull();

    Object.defineProperty(region, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 200,
    });
    refresh(region);
    expect(
      host!.querySelector('button[aria-label="Scroll left"]'),
    ).not.toBeNull();
  });

  it("removes the right arrow at the end and stays swipe-scrollable", () => {
    const region = renderRail();
    Object.defineProperty(region, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 700,
    });
    refresh(region);

    expect(host!.querySelector('button[aria-label="Scroll right"]')).toBeNull();
    expect(region.className).toContain("overflow-x-auto");
    expect(region.className).toContain("snap-x");
    expect(region.className).toContain("scrollbar-hide");
    expect(region.className).not.toContain("overflow-x-hidden");
  });

  it("preserves Japanese caller-provided region and control labels", () => {
    const region = renderRail({
      ariaLabel: "季節の旅先",
      previousLabel: "左へスクロール",
      nextLabel: "右へスクロール",
    });
    refresh(region);

    expect(region.getAttribute("aria-label")).toBe("季節の旅先");
    expect(
      host!.querySelector('button[aria-label="右へスクロール"]'),
    ).not.toBeNull();

    Object.defineProperty(region, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 200,
    });
    refresh(region);
    expect(
      host!.querySelector('button[aria-label="左へスクロール"]'),
    ).not.toBeNull();
  });
});
