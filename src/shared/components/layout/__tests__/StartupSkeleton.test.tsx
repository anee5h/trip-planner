/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { StartupSkeleton } from "../StartupSkeleton";

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  host?.remove();
  root = null;
  host = null;
});

function renderSkeleton() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(<StartupSkeleton />));
  return host.querySelector("[data-startup-skeleton]") as HTMLElement;
}

describe("StartupSkeleton", () => {
  it("renders a decorative first-viewport shell without interactive semantics", () => {
    const skeleton = renderSkeleton();

    expect(skeleton).not.toBeNull();
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(
      skeleton.querySelectorAll("a, button, input, select, textarea"),
    ).toHaveLength(0);
    expect(
      skeleton.querySelector("[data-startup-weather-shell]"),
    ).not.toBeNull();
    expect(
      skeleton.querySelector("[data-startup-planner-mobile]"),
    ).not.toBeNull();
    expect(
      skeleton.querySelector("[data-startup-planner-desktop]"),
    ).not.toBeNull();
    expect(skeleton.querySelector("[data-startup-rail]")).not.toBeNull();
  });

  it("uses one motion-safe pulse treatment for all placeholder blocks", () => {
    const skeleton = renderSkeleton();

    expect(skeleton.firstElementChild?.className).toContain(
      "motion-safe:animate-pulse",
    );
  });
});
