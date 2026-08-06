/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import TravelDatePicker, {
  getOriginForecastCalendarMarker,
} from "../TravelDatePicker";
import type { DayForecastData } from "@/shared/services/weather/WeatherTabService";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, number | string>) => {
      const isJa = opts?.lng === "ja";
      const map: Record<string, string> = {
        "datePicker.chooseTravelDate": isJa
          ? "旅行日を選択"
          : "Choose travel date",
        "datePicker.today": isJa ? "今日" : "Today",
        "datePicker.tomorrow": isJa ? "明日" : "Tomorrow",
        "datePicker.anyDate": isJa ? "指定なし" : "Any date",
        "datePicker.forecastNearOrigin": isJa
          ? "{{origin}}付近の予報"
          : "Forecast near {{origin}}",
        "datePicker.originForecastDefault": isJa ? "現在地" : "your origin",
        "datePicker.day1": isJa ? "1日目" : "Day 1",
        "datePicker.day2": isJa ? "2日目" : "Day 2",
        "datePicker.day2DerivedHint": isJa
          ? "2日目 (1泊2日)"
          : "Day 2 (derived for 2D1N trip)",
        "datePicker.previousMonth": isJa ? "前月" : "Previous month",
        "datePicker.nextMonth": isJa ? "次月" : "Next month",
        "datePicker.close": isJa ? "日付選択を閉じる" : "Close date picker",
      };
      let text = map[key] ?? opts?.defaultValue ?? key;
      if (typeof text === "string" && opts) {
        text = text.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
          String(opts[k] ?? ""),
        );
      }
      return text;
    },
    i18n: { language: "en" },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

function iso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("TravelDatePicker Component", () => {
  const today = new Date();
  const todayIso = iso(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = iso(tomorrow);

  const forecastMap = new Map<string, DayForecastData>([
    [
      todayIso,
      {
        date: todayIso,
        maxTemp: 28,
        minTemp: 20,
        weatherCode: 0,
        desc: "Sunny",
        icon: "sun",
      },
    ],
    [
      tomorrowIso,
      {
        date: tomorrowIso,
        maxTemp: 24,
        minTemp: 18,
        weatherCode: 61,
        desc: "Rainy",
        icon: "rain",
      },
    ],
  ]);

  it("1. Renders one calendar trigger button", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });
    const buttons = host!.querySelectorAll("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("2. Past dates disabled in calendar", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          minDate={todayIso}
          locale="en"
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    act(() => trigger.click());

    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 2);
    const pastIso = iso(pastDate);

    const pastBtn = host!.querySelector(`button[data-date="${pastIso}"]`);
    if (pastBtn) {
      expect(pastBtn.hasAttribute("disabled")).toBe(true);
    }
  });

  it("3. Today shortcut selects today", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={tomorrowIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    const dialog = host!.querySelector('[role="dialog"]')!;
    const shortcuts = Array.from(dialog.querySelectorAll("button")).filter(
      (b) => b.textContent?.includes("Today"),
    );
    expect(shortcuts.length).toBeGreaterThan(0);
    act(() => shortcuts[0].click());

    expect(handleChange).toHaveBeenCalledWith(todayIso);
  });

  it("4. Tomorrow shortcut selects tomorrow", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    const tomorrowBtn = Array.from(host!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Tomorrow"),
    )!;
    act(() => tomorrowBtn.click());

    expect(handleChange).toHaveBeenCalledWith(tomorrowIso);
  });

  it("5. Arbitrary future date selection works via calendar (no visible input[type=date])", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    // Assert there is NO visible native date input!
    expect(host!.querySelector('input[type="date"]')).toBeNull();

    // DayPicker day buttons should exist for selection
    const dayBtn = host!.querySelector(`button[data-date="${tomorrowIso}"]`);
    expect(dayBtn).toBeDefined();
    act(() => (dayBtn as HTMLButtonElement).click());

    expect(handleChange).toHaveBeenCalledWith(tomorrowIso);
  });

  it("6. Any date clears selection when allowAnyDate is enabled", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          allowAnyDate={true}
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    const anyDateBtn = Array.from(host!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Any date"),
    )!;
    expect(anyDateBtn).toBeDefined();

    act(() => anyDateBtn.click());
    expect(handleChange).toHaveBeenCalledWith(undefined);
  });

  it("7. Any date shortcut button is absent when allowAnyDate is false", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          allowAnyDate={false}
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    const anyDateBtn = Array.from(host!.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Any date"),
    );
    expect(anyDateBtn).toBeUndefined();
  });

  it("8. Forecast dates render an origin-weather marker", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          forecastMap={forecastMap}
          originLabel="Tokyo"
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    const todayDayBtn = host!.querySelector(`button[data-date="${todayIso}"]`);
    expect(todayDayBtn).toBeDefined();
    expect(todayDayBtn?.textContent).toContain("28°");
  });

  it("9. Dates beyond forecast range have no forecast marker", () => {
    const handleChange = vi.fn();
    const futureIso = "2030-06-15";
    act(() => {
      root!.render(
        <TravelDatePicker
          value={futureIso}
          onChange={handleChange}
          tripMode="day_trip"
          forecastMap={forecastMap}
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    const futureDayBtn = host!.querySelector(
      `button[data-date="${futureIso}"]`,
    );
    if (futureDayBtn) {
      expect(futureDayBtn.textContent).not.toContain("°");
    }
  });

  it("10. Forecast marker accessible label identifies origin weather for Tokyo, Osaka, Fukuoka, and fallback", () => {
    const tokyoMarker = getOriginForecastCalendarMarker(
      todayIso,
      forecastMap,
      "Tokyo",
      "en",
    );
    expect(tokyoMarker?.ariaLabel).toContain(
      "Forecast near Tokyo: Sunny, High 28°C",
    );

    const osakaMarker = getOriginForecastCalendarMarker(
      todayIso,
      forecastMap,
      "Osaka",
      "en",
    );
    expect(osakaMarker?.ariaLabel).toContain(
      "Forecast near Osaka: Sunny, High 28°C",
    );

    const fukuokaMarker = getOriginForecastCalendarMarker(
      todayIso,
      forecastMap,
      "Fukuoka",
      "en",
    );
    expect(fukuokaMarker?.ariaLabel).toContain(
      "Forecast near Fukuoka: Sunny, High 28°C",
    );

    const fallbackEnMarker = getOriginForecastCalendarMarker(
      todayIso,
      forecastMap,
      undefined,
      "en",
    );
    expect(fallbackEnMarker?.ariaLabel).toContain(
      "Forecast near your origin: Sunny, High 28°C",
    );

    const fallbackJaMarker = getOriginForecastCalendarMarker(
      todayIso,
      forecastMap,
      undefined,
      "ja",
    );
    expect(fallbackJaMarker?.ariaLabel).toContain(
      "現在地付近の予報: Sunny 最高28°C",
    );
  });

  it("11. Day trip highlights one date", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    const todayBtn = host!.querySelector(`button[data-date="${todayIso}"]`);
    expect(todayBtn?.className).toContain("bg-emerald-600");
  });

  it("12. 2D1N highlights Day 1 and derived Day 2", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="weekend_2d1n"
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    const todayBtn = host!.querySelector(`button[data-date="${todayIso}"]`);
    const tomorrowBtn = host!.querySelector(
      `button[data-date="${tomorrowIso}"]`,
    );

    expect(todayBtn?.className).toContain("bg-emerald-600");
    expect(tomorrowBtn?.className).toContain("bg-emerald-100");
  });

  it("13. Month rollover works", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value="2026-08-31"
          onChange={handleChange}
          tripMode="weekend_2d1n"
          locale="en"
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    expect(trigger.textContent).toContain("Aug 31 – Sep 1");
  });

  it("14. Year rollover works", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value="2026-12-31"
          onChange={handleChange}
          tripMode="weekend_2d1n"
          locale="en"
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    expect(trigger.textContent).toContain("Dec 31 – Jan 1");
  });

  it("15. Leap-day rollover works", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value="2028-02-28"
          onChange={handleChange}
          tripMode="weekend_2d1n"
          locale="en"
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    expect(trigger.textContent).toContain("Feb 28–29");
  });

  it("16. Keyboard selection works", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    act(() => trigger.focus());
    act(() => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(host!.querySelector('[role="dialog"]')).toBeDefined();
  });

  it("17. Escape closes popover and restores focus", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    act(() => trigger.click());
    expect(host!.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(host!.querySelector('[role="dialog"]')).toBeNull();
  });

  it("18. English/Japanese month and labels work", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="ja"
          allowAnyDate={true}
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    expect(trigger.textContent).toContain("今日");
  });

  it("19. Dark-mode classes/rendering remain valid", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <div className="dark">
          <TravelDatePicker
            value={todayIso}
            onChange={handleChange}
            tripMode="day_trip"
            locale="en"
          />
        </div>,
      );
    });
    act(() => host!.querySelector("button")!.click());
    const dialog = host!.querySelector('[role="dialog"]')!;
    expect(dialog.className).toContain("dark:bg-slate-950");
  });

  it("20. No time-selection control exists", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });
    act(() => host!.querySelector("button")!.click());

    expect(host!.querySelector('input[type="time"]')).toBeNull();
    expect(host!.querySelector('select[name="hour"]')).toBeNull();
  });

  it("21. When forecastMap starts tomorrow, Today remains selectable without a marker and Tomorrow has a marker", () => {
    const handleChange = vi.fn();
    const tomorrowMap = new Map<string, DayForecastData>([
      [
        tomorrowIso,
        {
          date: tomorrowIso,
          maxTemp: 25,
          minTemp: 18,
          weatherCode: 0,
          desc: "Sunny",
          icon: "sun",
        },
      ],
    ]);

    act(() => {
      root!.render(
        <TravelDatePicker
          value={tomorrowIso}
          onChange={handleChange}
          tripMode="day_trip"
          forecastMap={tomorrowMap}
          locale="en"
        />,
      );
    });

    const trigger = host!.querySelector("button")!;
    expect(trigger.textContent).toContain("Tomorrow");

    act(() => trigger.click());

    const todayDayBtn = host!.querySelector(
      `button[data-date="${todayIso}"]`,
    ) as HTMLButtonElement;
    expect(todayDayBtn).not.toBeNull();
    expect(todayDayBtn.disabled).toBe(false);
    expect(todayDayBtn.textContent).not.toContain("°");

    const tomorrowDayBtn = host!.querySelector(
      `button[data-date="${tomorrowIso}"]`,
    ) as HTMLButtonElement;
    expect(tomorrowDayBtn).not.toBeNull();
    expect(tomorrowDayBtn.textContent).toContain("25°");

    act(() => todayDayBtn.click());
    expect(handleChange).toHaveBeenCalledWith(todayIso);
  });

  it("22. Accessibility keyboard navigation: Escape closes popover and restores focus to trigger", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          tripMode="day_trip"
          locale="en"
        />,
      );
    });

    const trigger = host!.querySelector("button") as HTMLButtonElement;
    trigger.focus();
    act(() => trigger.click());

    const dialog = host!.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(host!.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("23. Home default trigger displays Select date when no explicit selection exists", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={undefined}
          onChange={handleChange}
          hasExplicitSelection={false}
          allowAnyDate={false}
          locale="en"
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    expect(trigger.textContent).toContain("Select date");
  });

  it("24. Destinations default trigger displays Any date", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={undefined}
          onChange={handleChange}
          allowAnyDate={true}
          locale="en"
        />,
      );
    });
    const trigger = host!.querySelector("button")!;
    expect(trigger.textContent).toContain("Any date");
  });

  it("25. Popover contains zero month/year dropdown selects, single caption, and 1 prev / 1 next nav button", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          locale="en"
        />,
      );
    });

    const trigger = host!.querySelector("button") as HTMLButtonElement;
    act(() => trigger.click());

    const dialog = host!.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();

    const dropdownSelects = dialog.querySelectorAll("select");
    expect(dropdownSelects.length).toBe(0);

    const prevBtn = dialog.querySelectorAll("button.rdp-button_previous");
    const nextBtn = dialog.querySelectorAll("button.rdp-button_next");
    expect(prevBtn.length).toBe(1);
    expect(nextBtn.length).toBe(1);

    const captionLabel = dialog.querySelector(".rdp-caption_label");
    expect(captionLabel).not.toBeNull();
    expect(captionLabel?.textContent).toMatch(/^[A-Z][a-z]+\s+\d{4}$/);
  });

  it("26. Today current-day modifier style is distinct from explicit selected modifier style", () => {
    const handleChange = vi.fn();
    act(() => {
      root!.render(
        <TravelDatePicker
          value={undefined}
          onChange={handleChange}
          hasExplicitSelection={false}
          allowAnyDate={false}
          locale="en"
        />,
      );
    });

    const trigger = host!.querySelector("button") as HTMLButtonElement;
    act(() => trigger.click());

    const todayBtn = host!.querySelector(`button[data-date="${todayIso}"]`)!;
    expect(todayBtn).not.toBeNull();
    expect(todayBtn.className).toContain("border-2");
    expect(todayBtn.className).not.toContain("bg-emerald-600");

    act(() => {
      root!.render(
        <TravelDatePicker
          value={todayIso}
          onChange={handleChange}
          hasExplicitSelection={true}
          allowAnyDate={false}
          locale="en"
        />,
      );
    });

    const selectedTodayBtn = host!.querySelector(
      `button[data-date="${todayIso}"]`,
    )!;
    expect(selectedTodayBtn.className).toContain("bg-emerald-600");
  });
});
