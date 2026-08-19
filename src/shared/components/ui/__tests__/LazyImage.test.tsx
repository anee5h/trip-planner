/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LazyImage } from "@/shared/components/ui/LazyImage";

const W = "https://upload.wikimedia.org";

/** Mock IntersectionObserver: call callback with isIntersecting=false initially. */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  elements = new Set<Element>();
  constructor(
    cb: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = cb;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.elements.add(el);
  }
  unobserve(el: Element) {
    this.elements.delete(el);
  }
  disconnect() {
    this.elements.clear();
  }
  /** Simulate the rail bringing the element into view. */
  fireIntersect() {
    this.callback(
      [...this.elements].map(
        (target) =>
          ({ target, isIntersecting: true }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  MockIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

function renderLazy(props: React.ComponentProps<typeof LazyImage>) {
  act(() => {
    root!.render(<LazyImage {...props} />);
  });
  return container!.querySelector("img") as HTMLImageElement;
}

describe("LazyImage responsive", () => {
  it("emits a Wikimedia srcSet when responsive", () => {
    const img = renderLazy({
      src: `${W}/wikipedia/commons/a/ae/Lake_Saroma.jpg`,
      alt: "Lake Saroma",
      responsive: true,
      sizes: "190px",
    });
    const srcset = img.getAttribute("srcset") ?? "";
    expect(srcset).toContain("250px-Lake_Saroma.jpg 250w");
    expect(srcset).toContain("500px-Lake_Saroma.jpg 500w");
    expect(img.src).toContain("Lake_Saroma.jpg");
  });

  it("does not emit srcSet when not responsive", () => {
    const img = renderLazy({
      src: `${W}/wikipedia/commons/a/ae/Lake_Saroma.jpg`,
      alt: "Lake Saroma",
    });
    expect(img.getAttribute("srcset")).toBeNull();
  });

  it("passes through non-Wikimedia srcs (no srcSet, original src kept)", () => {
    const img = renderLazy({
      src: "https://images.unsplash.com/photo-1?w=1200",
      alt: "Unsplash",
      responsive: true,
    });
    expect(img.getAttribute("srcset")).toBeNull();
    expect(img.src).toContain("images.unsplash.com");
  });
});

describe("LazyImage rail gating (deferUntilVisible)", () => {
  it("renders the real src when there is no rail ancestor (no gating)", () => {
    const img = renderLazy({
      src: `${W}/wikipedia/commons/a/ae/Lake_Saroma.jpg`,
      alt: "Lake Saroma",
      deferUntilVisible: true,
    });
    expect(img.src).toContain("Lake_Saroma.jpg");
  });

  it("withholds src until the rail brings the card into view", () => {
    act(() => {
      root!.render(
        <div data-rail style={{ overflowX: "auto" }}>
          <LazyImage
            src={`${W}/wikipedia/commons/a/ae/Lake_Saroma.jpg`}
            alt="Lake Saroma"
            deferUntilVisible
          />
        </div>,
      );
    });
    const img = container!.querySelector("img") as HTMLImageElement;
    // Initially not in rail view → src withheld (blank placeholder).
    expect(img.getAttribute("src")).toBeNull();

    // Rail scrolls the card into view → src applied.
    const io = MockIntersectionObserver.instances[0];
    expect(io).toBeTruthy();
    act(() => {
      io.fireIntersect();
    });
    expect(img.getAttribute("src")).toContain("Lake_Saroma.jpg");
  });
});
