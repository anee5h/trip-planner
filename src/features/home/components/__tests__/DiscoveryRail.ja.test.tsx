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
import DiscoveryRail, { type DiscoveryRailKind } from "../DiscoveryRail";

vi.mock("../HomeMatchCard", () => ({
  default: () => <div data-testid="home-match-card" />,
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const destination = { id: "ja-destination", name: "旅先" } as Destination;
let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  await i18n.changeLanguage("en");
});

function renderRail(kind: DiscoveryRailKind) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <DiscoveryRail
            kind={kind}
            destinations={[destination]}
            partySize={2}
            carMode="none"
            publicModes={["train"]}
            season="summer"
          />
        </MemoryRouter>
      </I18nextProvider>,
    );
  });
  return host;
}

describe("DiscoveryRail Japanese rendering", () => {
  it("renders localized seasonal and origin-aware rail labels", async () => {
    await i18n.changeLanguage("ja");

    const expected: Record<DiscoveryRailKind, string> = {
      seasonal: "この夏に訪れたい場所",
      under60: "60分以内の小さな旅",
      overnightGetaways: "宿泊旅行のおすすめ",
      longerJourney: "遠くても行く価値のある旅",
    };

    for (const kind of Object.keys(expected) as DiscoveryRailKind[]) {
      const container = renderRail(kind);
      expect(container.querySelector("h2")?.textContent).toBe(expected[kind]);
      expect(container.textContent).not.toMatch(/home\./);
      expect(
        container.querySelector(
          `[role="region"][aria-label="${expected[kind]}"]`,
        ),
      ).not.toBeNull();
      act(() => root!.unmount());
      root = undefined;
      host?.remove();
      host = undefined;
    }
  });
});
