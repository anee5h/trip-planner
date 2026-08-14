/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import i18n from "@/i18n";
import RecentlyViewedRail from "../RecentlyViewedRail";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const getRecent = vi.hoisted(() => vi.fn());

vi.mock("@/shared/hooks/useRecentlyViewedDestinations", () => ({
  useRecentlyViewedDestinations: getRecent,
}));

vi.mock("../HomeMatchCard", () => ({
  default: ({ destination }: { destination: Destination }) => (
    <a href={`/destinations/${destination.id}`}>{destination.name}</a>
  ),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  getRecent.mockReset();
  await i18n.changeLanguage("en");
});

describe("RecentlyViewedRail Japanese rendering", () => {
  it("renders the real Japanese title and rail labels", async () => {
    await i18n.changeLanguage("ja");
    getRecent.mockReturnValue([
      { id: "himeji-castle", name: "姫路城" } as unknown as Destination,
    ]);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root!.render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <RecentlyViewedRail
              partySize={2}
              carMode="none"
              publicModes={["train"]}
            />
          </MemoryRouter>
        </I18nextProvider>,
      );
    });

    expect(host.querySelector("h2")?.textContent).toBe("続きを見る");
    expect(host.textContent).not.toMatch(/home\./);
    expect(
      host.querySelector('[role="region"][aria-label="続きを見る"]'),
    ).not.toBeNull();
  });
});
