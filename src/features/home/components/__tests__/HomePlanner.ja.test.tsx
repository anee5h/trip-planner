/**
 * @vitest-environment jsdom
 *
 * Japanese-locale rendered tests for HomePlanner.
 * Replicates the EN test structure but with ja translation mocks.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import { HomePlanner } from "../HomePlanner";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Japanese i18n mock ────────────────────────────────────────────────────────
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "home.tripModes.day_trip": "日帰り",
        "home.tripModes.weekend_2d1n": "週末・2日間1泊",
        "home.tripMode": "旅行タイプ",
        "home.accommodation": "宿泊費目安（1泊）",
        "home.accommodationHelp": "グループ全体の1泊分の目安です",
        "home.accommodationPresets.economy": "節約・¥8,000",
        "home.accommodationPresets.standard": "標準・¥15,000",
        "home.accommodationPresets.comfortable": "ゆったり・¥25,000",
        "home.accommodationPresets.custom": "カスタム",
        "home.customStayAllowance": "カスタム宿泊費目安",
        "home.weekendBadge": "2日間1泊",
        "home.duration": "所要時間",
        "home.durations.shortOuting": "短時間",
        "home.durations.halfDay": "半日",
        "home.durations.fullDay": "1日",
        "home.vibe": "雰囲気",
        "home.vibes.any": "何でも",
        "home.party": "旅行人数",
        "home.budget": "予算",
        "home.budgets.standard": "標準",
        "home.transport": "交通手段",
        "home.transportOptions.public": "公共交通機関",
        "home.find": "検索",
        "home.surprise": "おまかせ",
        "home.planner": "旅のプランナー",
        "home.plannerHint": "30秒でぴったりの旅先を提案",
        "home.decreaseParty": "人数を減らす",
        "home.increaseParty": "人数を増やす",
        "home.budgetHints.standard": "バランスの取れた予算",
      })[key] ?? key,
    i18n: { language: "ja" },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}));

// ── Render helper ─────────────────────────────────────────────────────────────
let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderHomePlanner(
  props: Partial<React.ComponentProps<typeof HomePlanner>> = {},
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
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

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("HomePlanner (ja locale)", () => {
  it("renders day trip toggle in Japanese as default", () => {
    const container = renderHomePlanner();

    const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "日帰り",
    );
    expect(dayTripBtn).toBeDefined();
    expect(dayTripBtn?.getAttribute("aria-checked")).toBe("true");
    expect(dayTripBtn?.getAttribute("role")).toBe("radio");

    const weekendBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("週末"),
    );
    expect(weekendBtn).toBeDefined();
    expect(weekendBtn?.textContent).toContain("週末・2日間1泊");
    expect(weekendBtn?.getAttribute("aria-checked")).toBe("false");
  });

  it("shows allowance control and weekend badge in Japanese when weekend mode is selected", () => {
    const container = renderHomePlanner({ tripMode: "weekend_2d1n" });

    // Allowance label in Japanese
    expect(container.textContent).toContain("宿泊費目安");
    // Currently selected preset (the Select shows the active value)
    expect(container.textContent).toContain("標準・¥15,000");
    // Weekend badge in Japanese
    expect(container.textContent).toContain("2日間1泊");
  });

  it("hides allowance control in day trip mode (ja)", () => {
    const container = renderHomePlanner({ tripMode: "day_trip" });
    expect(container.textContent).not.toContain("宿泊費目安");
    expect(container.textContent).not.toContain("カスタム宿泊費目安");
  });

  it("switches aria-checked between 日帰り and 週末・2日間1泊", () => {
    const container = renderHomePlanner({ tripMode: "weekend_2d1n" });

    const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "日帰り",
    );
    expect(dayTripBtn?.getAttribute("aria-checked")).toBe("false");

    const weekendBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("週末"),
    );
    expect(weekendBtn?.getAttribute("aria-checked")).toBe("true");
  });

  it("calls onTripModeChange when Japanese toggle is clicked", () => {
    const onTripModeChange = vi.fn();
    const container = renderHomePlanner({ onTripModeChange });

    const weekendBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("週末"),
    );
    act(() => weekendBtn?.click());
    expect(onTripModeChange).toHaveBeenCalledWith("weekend_2d1n");

    const dayTripBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "日帰り",
    );
    act(() => dayTripBtn?.click());
    expect(onTripModeChange).toHaveBeenCalledWith("day_trip");
  });

  it("renders trip type group label in Japanese", () => {
    const container = renderHomePlanner();
    const group = container.querySelector('[aria-label="旅行タイプ"]');
    expect(group).toBeDefined();
    expect(group?.getAttribute("role")).toBe("group");
  });
});
