/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import { HomePlanner } from "../HomePlanner";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "home.tripModes.day_trip": "Day trip",
        "home.tripModes.weekend_2d1n": "Weekend · 2 days / 1 night",
        "home.tripMode": "Trip type",
        "home.accommodation": "Stay allowance (1 night)",
        "home.accommodationHelp":
          "Total one-night allowance for the whole party",
        "home.accommodationPresets.economy": "Economy · ¥8,000",
        "home.accommodationPresets.standard": "Standard · ¥15,000",
        "home.accommodationPresets.comfortable": "Comfortable · ¥25,000",
        "home.accommodationPresets.custom": "Custom",
        "home.customStayAllowance": "Custom stay allowance",
        "home.weekendBadge": "2 days / 1 night",
        "home.duration": "Duration",
        "home.timeAvailable": "Time available",
        "home.durations.shortOuting": "Short outing",
        "home.durations.halfDay": "Half day",
        "home.durations.fullDay": "Full day",
        "home.durationHints.shortOuting": "≤ 4h total",
        "home.durationHints.halfDay": "≤ 7.5h total",
        "home.durationHints.fullDay": "≤ 14h total",
        "home.vibe": "Vibe",
        "home.vibes.any": "Anything goes",
        "home.party": "Travel party",
        "home.budget": "Budget",
        "home.budgets.standard": "Standard",
        "home.transport": "Getting around",
        "home.transportOptions.public": "Public transit",
        "home.find": "Find matches",
        "home.surprise": "Surprise me",
        "home.planner": "Trip Planner",
        "home.plannerHint": "Find your match in 30s",
        "home.decreaseParty": "Decrease party size",
        "home.increaseParty": "Increase party size",
        "home.budgetHints.standard": "Balanced spending",
      })[key] ?? key,
    i18n: { language: "en" },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
  document.body.innerHTML = "";
});

function renderHomePlanner(
  props: Partial<React.ComponentProps<typeof HomePlanner>> = {},
) {
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  act(() => {
    root!.render(
      <HomePlanner
        vibe="any"
        onVibeChange={vi.fn()}
        tripDuration="fullDay"
        onTripDurationChange={vi.fn()}
        partySize={2}
        onPartySizeChange={vi.fn()}
        budgetTier="standard"
        onBudgetTierChange={vi.fn()}
        transportPreference="public"
        onTransportPreferenceChange={vi.fn()}
        tripMode="day_trip"
        onTripModeChange={vi.fn()}
        accommodationAllowance={15000}
        onAccommodationAllowanceChange={vi.fn()}
        hasUserApplied={false}
        isDirty={false}
        onApplyMatches={vi.fn()}
        onSurpriseMe={vi.fn()}
        {...props}
      />,
    );
  });
  return host;
}

describe("HomePlanner", () => {
  it("labels day-trip duration as total available time", () => {
    const container = renderHomePlanner();

    expect(container.textContent).toContain("Time available");
    expect(container.textContent).not.toContain("Time at destination");

    const durationButton = Array.from(
      container.querySelectorAll("button"),
    ).find(
      (button) =>
        button.textContent?.includes("Time available") &&
        button.textContent.includes("Full day"),
    );
    expect(durationButton).toBeDefined();

    act(() => durationButton?.click());
    expect(container.textContent).toContain("≤ 14h total");
  });

  it("renders day trip as default mode", () => {
    const container = renderHomePlanner();

    const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Day trip",
    );
    expect(dayTripBtn).toBeDefined();
    expect(dayTripBtn?.getAttribute("aria-checked")).toBe("true");

    const weekendBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Weekend"),
    );
    expect(weekendBtn?.getAttribute("aria-checked")).toBe("false");
  });

  it("uses a distinct dark-theme treatment for the selected trip mode", () => {
    const container = renderHomePlanner();

    const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Day trip",
    );
    const weekendBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Weekend"),
    );

    expect(dayTripBtn?.className).toContain("dark:bg-emerald-500/20");
    expect(dayTripBtn?.className).toContain("dark:ring-emerald-400/50");
    expect(weekendBtn?.className).not.toContain("dark:bg-emerald-500/20");
  });

  it("does not show allowance control in day trip mode", () => {
    const container = renderHomePlanner({ tripMode: "day_trip" });
    expect(container.textContent).not.toContain("Stay allowance");
    expect(container.textContent).not.toContain("Custom stay allowance");
  });

  it("shows allowance control when weekend mode is selected", () => {
    const container = renderHomePlanner({ tripMode: "weekend_2d1n" });

    expect(container.textContent).toContain("Stay allowance");
    expect(container.textContent).toContain("Standard · ¥15,000");
  });

  it("shows weekend badge instead of duration select in weekend mode (desktop)", () => {
    const container = renderHomePlanner({ tripMode: "weekend_2d1n" });

    expect(container.textContent).toContain("2 days / 1 night");
    // Day trip mode buttons should not be present as select options
    expect(
      Array.from(container.querySelectorAll('[role="listbox"]')).length,
    ).toBe(0);
  });

  it("hides allowance control when switching back to day trip", () => {
    const container = renderHomePlanner({ tripMode: "day_trip" });
    expect(container.textContent).not.toContain("Stay allowance");
  });

  it("calls onTripModeChange when toggle is clicked", () => {
    const onTripModeChange = vi.fn();
    const container = renderHomePlanner({ onTripModeChange });

    const weekendBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Weekend"),
    );
    act(() => weekendBtn?.click());
    expect(onTripModeChange).toHaveBeenCalledWith("weekend_2d1n");
  });

  describe("2D1N accommodation allowance controls", () => {
    const setInputValue = (input: HTMLInputElement, value: string) => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        input.constructor.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const triggerBlur = (input: HTMLInputElement) => {
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    };

    it("in day-trip mode, the accommodation control remains hidden", () => {
      const container = renderHomePlanner({ tripMode: "day_trip" });
      const trigger = container.querySelector(
        '[aria-describedby="accommodation-help"]',
      );
      const customInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      );
      expect(trigger).toBeNull();
      expect(customInput).toBeNull();
    });

    it("in 2D1N mode with Standard preset, shows selector and initially hides Custom input", () => {
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 15000,
      });
      const trigger = container.querySelector(
        '[aria-describedby="accommodation-help"]',
      );
      expect(trigger).toBeDefined();
      expect(trigger?.textContent).toContain("Standard · ¥15,000");

      const customInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      );
      expect(customInput).toBeNull();
    });

    it("selecting Custom immediately renders the input with current allowance without altering allowance", () => {
      const onAccommodationAllowanceChange = vi.fn();
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 15000,
        onAccommodationAllowanceChange,
      });

      const trigger = container.querySelector(
        '[aria-describedby="accommodation-help"]',
      ) as HTMLButtonElement;
      expect(trigger).toBeDefined();

      act(() => {
        trigger.click();
      });

      const customOption = Array.from(
        document.body.querySelectorAll('[role="option"]'),
      ).find((el) => el.textContent?.includes("Custom")) as HTMLElement;
      expect(customOption).toBeDefined();

      act(() => {
        customOption.click();
      });

      // Does not alter the allowance callback merely by selecting Custom
      expect(onAccommodationAllowanceChange).not.toHaveBeenCalled();

      // Custom input appears immediately
      const customInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;
      expect(customInput).toBeDefined();
      expect(customInput.value).toBe("15000");
    });

    it("entering a representative value calls onAccommodationAllowanceChange and stays in Custom mode", () => {
      const onAccommodationAllowanceChange = vi.fn();
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 15000,
        onAccommodationAllowanceChange,
      });

      const trigger = container.querySelector(
        '[aria-describedby="accommodation-help"]',
      ) as HTMLButtonElement;
      act(() => {
        trigger.click();
      });

      const customOption = Array.from(
        document.body.querySelectorAll('[role="option"]'),
      ).find((el) => el.textContent?.includes("Custom")) as HTMLElement;
      act(() => {
        customOption.click();
      });

      const customInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;

      act(() => {
        setInputValue(customInput, "32000");
      });

      expect(onAccommodationAllowanceChange).toHaveBeenCalledWith(32000);

      // Controlled rerender with the updated allowance
      renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 32000,
        onAccommodationAllowanceChange,
      });

      const rerenderedInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;
      expect(rerenderedInput).toBeDefined();
      expect(rerenderedInput.value).toBe("32000");
    });

    it("keeps Custom input visible when user deliberately enters a value equal to a preset amount", () => {
      const onAccommodationAllowanceChange = vi.fn();
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 15000,
        onAccommodationAllowanceChange,
      });

      const trigger = container.querySelector(
        '[aria-describedby="accommodation-help"]',
      ) as HTMLButtonElement;
      act(() => {
        trigger.click();
      });

      const customOption = Array.from(
        document.body.querySelectorAll('[role="option"]'),
      ).find((el) => el.textContent?.includes("Custom")) as HTMLElement;
      act(() => {
        customOption.click();
      });

      const customInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;

      // Enter 8000 (which happens to match the economy preset amount)
      act(() => {
        setInputValue(customInput, "8000");
      });

      expect(onAccommodationAllowanceChange).toHaveBeenCalledWith(8000);

      // Controlled rerender with 8000 while staying in Custom mode
      renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 8000,
        onAccommodationAllowanceChange,
      });

      const rerenderedInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;
      expect(rerenderedInput).toBeDefined();
      expect(rerenderedInput.value).toBe("8000");
    });

    it("selecting a preset after Custom exits Custom mode, applies preset, and hides input", () => {
      const onAccommodationAllowanceChange = vi.fn();
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 32000,
        onAccommodationAllowanceChange,
      });

      // 32000 is a custom allowance, input is present
      const initialInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      );
      expect(initialInput).toBeDefined();

      const trigger = container.querySelector(
        '[aria-describedby="accommodation-help"]',
      ) as HTMLButtonElement;
      act(() => {
        trigger.click();
      });

      const economyOption = Array.from(
        document.body.querySelectorAll('[role="option"]'),
      ).find((el) =>
        el.textContent?.includes("Economy · ¥8,000"),
      ) as HTMLElement;
      expect(economyOption).toBeDefined();

      act(() => {
        economyOption.click();
      });

      expect(onAccommodationAllowanceChange).toHaveBeenCalledWith(8000);

      // Controlled rerender with preset amount
      renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 8000,
        onAccommodationAllowanceChange,
      });

      const hiddenInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      );
      expect(hiddenInput).toBeNull();
    });

    it("recognizes an initially supplied non-preset allowance as Custom", () => {
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 45000,
      });

      const trigger = container.querySelector(
        '[aria-describedby="accommodation-help"]',
      );
      expect(trigger?.textContent).toContain("Custom");

      const customInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;
      expect(customInput).toBeDefined();
      expect(customInput.value).toBe("45000");
    });

    it("handles invalid/blank values on blur by falling back to standard preset and exiting custom mode", () => {
      const onAccommodationAllowanceChange = vi.fn();
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 32000,
        onAccommodationAllowanceChange,
      });

      const customInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;

      // Blur with NaN/empty value -> resets to Standard (15000) and exits custom mode
      act(() => {
        customInput.value = "";
        triggerBlur(customInput);
      });
      expect(onAccommodationAllowanceChange).toHaveBeenCalledWith(15000);

      // Controlled rerender with the standard allowance
      renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 15000,
        onAccommodationAllowanceChange,
      });

      const trigger = container.querySelector(
        '[aria-describedby="accommodation-help"]',
      );
      expect(trigger?.textContent).toContain("Standard · ¥15,000");
      expect(
        container.querySelector('input[aria-label="Custom stay allowance"]'),
      ).toBeNull();
    });

    it("clamps out-of-range values on blur while remaining in custom mode", () => {
      const onAccommodationAllowanceChange = vi.fn();
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 32000,
        onAccommodationAllowanceChange,
      });

      const customInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;

      // Blur with clamped max
      act(() => {
        customInput.value = "9999999";
        triggerBlur(customInput);
      });
      expect(onAccommodationAllowanceChange).toHaveBeenCalledWith(500000);

      renderHomePlanner({
        tripMode: "weekend_2d1n",
        accommodationAllowance: 500000,
        onAccommodationAllowanceChange,
      });

      const rerenderedInput = container.querySelector(
        'input[aria-label="Custom stay allowance"]',
      ) as HTMLInputElement;
      expect(rerenderedInput).toBeDefined();
      expect(rerenderedInput.value).toBe("500000");
    });
  });

  it("toggle buttons are focusable keyboard buttons", () => {
    const container = renderHomePlanner();

    const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Day trip",
    );
    expect(dayTripBtn).toBeDefined();
    expect(dayTripBtn?.tagName).toBe("BUTTON");
    expect(dayTripBtn?.getAttribute("type")).toBe("button");

    const weekendBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Weekend"),
    );
    expect(weekendBtn?.tagName).toBe("BUTTON");
    expect(weekendBtn?.getAttribute("type")).toBe("button");
  });

  it("click fires onTripModeChange handler (day trip → weekend)", () => {
    const onTripModeChange = vi.fn();
    const container = renderHomePlanner({ onTripModeChange });

    const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Day trip",
    );
    act(() => dayTripBtn?.click());
    expect(onTripModeChange).toHaveBeenCalledWith("day_trip");
  });

  describe("keyboard accessibility", () => {
    it("toggle buttons have role=radio and correct aria-checked state", () => {
      const container = renderHomePlanner();

      const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Day trip",
      );
      expect(dayTripBtn?.getAttribute("role")).toBe("radio");
      expect(dayTripBtn?.getAttribute("aria-checked")).toBe("true");

      const weekendBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Weekend"),
      );
      expect(weekendBtn?.getAttribute("role")).toBe("radio");
      expect(weekendBtn?.getAttribute("aria-checked")).toBe("false");
    });

    it("both toggle buttons are in natural tab order as native buttons", () => {
      const container = renderHomePlanner();

      const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Day trip",
      ) as HTMLButtonElement | undefined;
      const weekendBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Weekend"),
      ) as HTMLButtonElement | undefined;

      // Native buttons without tabIndex="-1" are focusable in natural tab order
      expect(dayTripBtn).toBeDefined();
      expect(dayTripBtn?.tagName).toBe("BUTTON");
      expect(dayTripBtn?.getAttribute("tabIndex")).toBeNull();

      expect(weekendBtn).toBeDefined();
      expect(weekendBtn?.tagName).toBe("BUTTON");
      expect(weekendBtn?.getAttribute("tabIndex")).toBeNull();
    });

    it("click on focused weekend button fires onTripModeChange (keyboard activation proxy)", () => {
      // In real browsers, Enter/Space on a focused <button> fires click.
      // jsdom does not synthesize click from keydown, so we use click()
      // as a faithful proxy for keyboard activation of native buttons.
      const onTripModeChange = vi.fn();
      const container = renderHomePlanner({ onTripModeChange });

      const weekendBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Weekend"),
      ) as HTMLButtonElement | undefined;

      act(() => {
        weekendBtn?.focus();
        weekendBtn?.click();
      });
      expect(onTripModeChange).toHaveBeenCalledWith("weekend_2d1n");
      expect(document.activeElement).toBe(weekendBtn);
    });

    it("click on focused day trip button fires onTripModeChange (keyboard activation proxy)", () => {
      const onTripModeChange = vi.fn();
      const container = renderHomePlanner({
        tripMode: "weekend_2d1n",
        onTripModeChange,
      });

      const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Day trip",
      ) as HTMLButtonElement | undefined;

      act(() => {
        dayTripBtn?.focus();
        dayTripBtn?.click();
      });
      expect(onTripModeChange).toHaveBeenCalledWith("day_trip");
      expect(document.activeElement).toBe(dayTripBtn);
    });
  });

  describe("aria state reflects tripMode", () => {
    it("weekend button is aria-checked=true when tripMode is weekend_2d1n", () => {
      const container = renderHomePlanner({ tripMode: "weekend_2d1n" });

      const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Day trip",
      );
      expect(dayTripBtn?.getAttribute("aria-checked")).toBe("false");

      const weekendBtn = Array.from(container.querySelectorAll("button")).find(
        (btn) => btn.textContent?.includes("Weekend"),
      );
      expect(weekendBtn?.getAttribute("aria-checked")).toBe("true");
    });
  });
});
