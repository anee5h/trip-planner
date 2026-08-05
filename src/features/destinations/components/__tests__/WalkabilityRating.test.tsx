/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { isValidWalkability } from "@/shared/utils/ratings";

// --------------- mocks ---------------

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "ui.walkability": "Walkability",
        "ui.walkingIntensity": "Walking intensity",
      };
      return map[key] || key;
    },
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// lucide Footprints is rendered inside WalkabilityRatingItem
vi.mock("lucide-react", () => ({
  Footprints: () => null,
}));

// --------------- production imports ---------------

import {
  WalkingIntensityRow,
  WalkabilityRatingItem,
} from "../DestinationWalkingRatings";

// --------------- guard unit tests ---------------

describe("isValidWalkability guard", () => {
  it("accepts 1–10", () => {
    for (let i = 1; i <= 10; i++) expect(isValidWalkability(i)).toBe(true);
  });
  it("rejects 0", () => expect(isValidWalkability(0)).toBe(false));
  it("rejects 11", () => expect(isValidWalkability(11)).toBe(false));
  it("rejects undefined", () =>
    expect(isValidWalkability(undefined)).toBe(false));
  it("rejects null", () => expect(isValidWalkability(null)).toBe(false));
  it("rejects NaN", () => expect(isValidWalkability(NaN)).toBe(false));
  it("rejects non-number", () =>
    expect(isValidWalkability("7" as any)).toBe(false));
});

// --------------- WalkabilityRatingItem rendering tests ---------------

describe("WalkabilityRatingItem", () => {
  const render = (walkability: number | undefined | null) => {
    const container = document.createElement("div");
    act(() => {
      createRoot(container).render(
        <WalkabilityRatingItem walkability={walkability} />,
      );
    });
    return container;
  };

  it("renders walkability=7 with label and score", () => {
    const c = render(7);
    expect(c.textContent).toContain("Walkability");
    expect(c.textContent).toContain("7");
    expect(c.textContent).not.toContain("0/10");
  });

  it("does not render when missing", () => {
    expect(render(undefined).textContent).toBeFalsy();
  });

  it("does not render walkability=0", () => {
    expect(render(0).textContent).toBeFalsy();
  });

  it("does not render walkability=11", () => {
    expect(render(11).textContent).toBeFalsy();
  });

  it("does not render walkability=NaN", () => {
    expect(render(NaN).textContent).toBeFalsy();
  });
});

// --------------- WalkingIntensityRow rendering tests ---------------

describe("WalkingIntensityRow", () => {
  const render = (intensity: number | undefined) => {
    const container = document.createElement("div");
    act(() => {
      createRoot(container).render(
        <WalkingIntensityRow intensity={intensity} />,
      );
    });
    return container;
  };

  it("renders walkingIntensity=3 with correct label", () => {
    const c = render(3);
    expect(c.textContent).toContain("Walking intensity");
    expect(c.textContent).not.toContain("Walkability");
  });

  it("does not render when missing", () => {
    expect(render(undefined).textContent).toBeFalsy();
  });
});
