/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { isValidWalkability } from "@/shared/utils/ratings";

// --------------- mocks (same pattern as DestinationCardResponsive.test.tsx) ---------------

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/shared/context/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));

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

vi.mock("lucide-react", () => ({
  Footprints: () => null,
  Heart: () => null,
  Camera: () => null,
  Utensils: () => null,
  JapaneseYen: () => null,
  Users: () => null,
  Train: () => null,
  Leaf: () => null,
  Landmark: () => null,
  House: () => null,
  Flower2: () => null,
  Snowflake: () => null,
  Ticket: () => null,
  Timer: () => null,
  CalendarDays: () => null,
  Building2: () => null,
  ArrowLeft: () => null,
  MapPin: () => null,
  Clock: () => null,
  ThermometerSun: () => null,
  Umbrella: () => null,
  Coffee: () => null,
  Info: () => null,
  Cloud: () => null,
  CloudRain: () => null,
  CloudSnow: () => null,
  CloudLightning: () => null,
  Sun: () => null,
  TrainFront: () => null,
  Bus: () => null,
  Car: () => null,
  CheckCircle2: () => null,
  Share2: () => null,
  ExternalLink: () => null,
  Plus: () => null,
  Navigation: () => null,
  Scale: () => null,
  Sparkles: () => null,
  BookOpen: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  Plane: () => null,
}));

// --------------- extracted miniature of the walkability row ---------------

function WalkabilityRating({
  walkability,
}: {
  walkability: number | undefined | null;
}) {
  if (!isValidWalkability(walkability)) return null;
  return (
    <div data-testid="walkability-rating">Walkability {walkability}/10</div>
  );
}

function WalkingIntensityRow({ intensity }: { intensity: number | undefined }) {
  if (intensity === undefined) return null;
  return (
    <div data-testid="walking-intensity-row">
      Walking intensity {intensity}/10
    </div>
  );
}

// --------------- tests ---------------

describe("isValidWalkability guard", () => {
  it("accepts 1–10", () => {
    for (let i = 1; i <= 10; i++) expect(isValidWalkability(i)).toBe(true);
  });

  it("rejects 0", () => {
    expect(isValidWalkability(0)).toBe(false);
  });

  it("rejects 11", () => {
    expect(isValidWalkability(11)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidWalkability(undefined)).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidWalkability(null)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isValidWalkability(NaN)).toBe(false);
  });

  it("rejects non-number", () => {
    expect(isValidWalkability("7" as any)).toBe(false);
  });
});

describe("WalkabilityRating component", () => {
  it("renders walkability=7", () => {
    const container = document.createElement("div");
    act(() => {
      createRoot(container).render(
        <MemoryRouter>
          <WalkabilityRating walkability={7} />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toContain("Walkability");
    expect(container.textContent).toContain("7/10");
    expect(container.textContent).not.toContain("0/10");
  });

  it("does not render when walkability is missing", () => {
    const container = document.createElement("div");
    act(() => {
      createRoot(container).render(
        <MemoryRouter>
          <WalkabilityRating walkability={undefined} />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toBeFalsy();
  });

  it("does not render walkability=0", () => {
    const container = document.createElement("div");
    act(() => {
      createRoot(container).render(
        <MemoryRouter>
          <WalkabilityRating walkability={0} />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toBeFalsy();
  });

  it("does not render walkability=11", () => {
    const container = document.createElement("div");
    act(() => {
      createRoot(container).render(
        <MemoryRouter>
          <WalkabilityRating walkability={11} />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toBeFalsy();
  });

  it("does not render walkability=NaN", () => {
    const container = document.createElement("div");
    act(() => {
      createRoot(container).render(
        <MemoryRouter>
          <WalkabilityRating walkability={NaN} />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toBeFalsy();
  });

  it("walkingIntensity=3 does not render as walkability", () => {
    const container = document.createElement("div");
    act(() => {
      createRoot(container).render(
        <MemoryRouter>
          <WalkingIntensityRow intensity={3} />
        </MemoryRouter>,
      );
    });
    // Walking intensity renders with its own label, not walkability
    expect(container.textContent).toContain("Walking intensity");
    expect(container.textContent).not.toContain("Walkability");
  });
});
