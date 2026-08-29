import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { DestinationDetailRail } from "../DestinationDetailRail";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../DestinationCard", () => ({
  default: ({ destination }: { destination: Destination }) => (
    <a href={`/destinations/${destination.id}`}>{destination.name}</a>
  ),
}));

const destination = (id: string, name: string): Destination =>
  ({ id, name, nameJa: name, role: "poi" }) as Destination;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("DestinationDetailRail", () => {
  it("renders relationship data in the shared horizontal ScrollContainer and excludes the current destination", () => {
    act(() => {
      root.render(
        <DestinationDetailRail
          title="Nearby places"
          destinations={[
            destination("current", "Current place"),
            destination("one", "Place one"),
            destination("one", "Duplicate place one"),
            destination("two", "Place two"),
          ]}
          currentDestinationId="current"
          partySize={2}
          previousLabel="Scroll left"
          nextLabel="Scroll right"
        />,
      );
    });

    const region = host.querySelector('[role="region"]');
    const text = host.textContent ?? "";
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-label")).toBe("Nearby places");
    expect(region?.getAttribute("data-rail")).not.toBeNull();
    expect(text).not.toContain("Current place");
    expect(text).toContain("Place one");
    expect(text).not.toContain("Duplicate place one");
    expect(text).toContain("Place two");
  });

  it("omits an empty relationship rail", () => {
    act(() => {
      root.render(
        <DestinationDetailRail
          title="Nearby places"
          destinations={[destination("current", "Current place")]}
          currentDestinationId="current"
          partySize={2}
          previousLabel="Scroll left"
          nextLabel="Scroll right"
        />,
      );
    });

    expect(host.innerHTML).toBe("");
  });
});
