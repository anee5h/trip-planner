import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Footer from "../Footer";

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

function renderFooter() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
  });
  return host;
}

describe("Footer", () => {
  it("uses the canonical public contact mailto", () => {
    const node = renderFooter();
    const link = node.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    expect(link?.getAttribute("href")).toBe("mailto:info@meguruto.app");
  });

  it("does not surface the stale developer address", () => {
    const node = renderFooter();
    expect(node.textContent).not.toContain("kaihatsu.studio");
    expect(node.textContent).not.toContain("gmail");
  });
});
