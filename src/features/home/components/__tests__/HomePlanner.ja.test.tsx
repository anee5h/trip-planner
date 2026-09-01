/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePlanner } from "../HomePlanner";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "ui.close": "閉じる",
        "home.vibe": "旅の雰囲気",
        "home.duration": "期間",
        "home.party": "旅行人数",
        "home.budget": "予算",
        "home.transport": "移動手段",
        "home.vibes.any": "おまかせ",
        "home.durations.shortOuting": "短時間",
        "home.durations.halfDay": "半日",
        "home.durations.fullDay": "一日",
        "home.durations.2d1n": "1泊2日",
        "home.durations.3d2n": "2泊3日",
        "home.durationHints.shortOuting": "合計4時間以内",
        "home.durationHints.halfDay": "合計7.5時間以内",
        "home.durationHints.fullDay": "合計14時間以内",
        "home.durationHints.2d1n": "1泊2日",
        "home.durationHints.3d2n": "2泊3日",
        "home.budgets.standard": "スタンダード",
        "home.budgetHints.standard": "バランス重視",
        "home.transportOptions.public": "公共交通",
        "home.transportOptions.rentalCar": "レンタカー",
        "home.transportOptions.myCar": "自家用車",
        "home.find": "候補を見る",
        "home.surprise": "おまかせ検索",
        "home.planner": "旅のプランナー",
        "home.plannerHint": "30秒でぴったりの旅先を提案",
        "home.decreaseParty": "人数を減らす",
        "home.increaseParty": "人数を増やす",
      })[key] ?? key,
  }),
}));

let host: HTMLDivElement | undefined;
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function renderPlanner(
  overrides: Partial<React.ComponentProps<typeof HomePlanner>> = {},
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const props: React.ComponentProps<typeof HomePlanner> = {
    vibe: "any",
    onVibeChange: vi.fn(),
    tripDuration: "fullDay",
    onTripDurationChange: vi.fn(),
    partySize: 2,
    onPartySizeChange: vi.fn(),
    budgetTier: "standard",
    onBudgetTierChange: vi.fn(),
    publicTransport: true,
    onPublicTransportChange: vi.fn(),
    carMode: "none",
    onCarModeChange: vi.fn(),
    hasUserApplied: false,
    isDirty: false,
    onApplyMatches: vi.fn(),
    onSurpriseMe: vi.fn(),
    ...overrides,
  };
  act(() => root?.render(<HomePlanner {...props} />));
  return { container: host, props };
}

describe("HomePlanner 期間 / Japanese", () => {
  it("shows the five duration choices without the old trip-mode toggle", () => {
    const { container } = renderPlanner();
    const trigger = [...container.querySelectorAll("button")]
      .reverse()
      .find((button) => button.textContent?.includes("一日")) as
      HTMLButtonElement | undefined;
    act(() => trigger?.click());
    const sheet = container.querySelector('[role="dialog"]');
    expect(sheet?.textContent).toContain("短時間");
    expect(sheet?.textContent).toContain("半日");
    expect(sheet?.textContent).toContain("一日");
    expect(sheet?.textContent).toContain("1泊2日");
    expect(sheet?.textContent).toContain("2泊3日");
    expect(sheet?.textContent).not.toContain("週末");
  });

  it("selects 2泊3日 and preserves it as selected", () => {
    const onChange = vi.fn();
    const { container } = renderPlanner({ onTripDurationChange: onChange });
    const trigger = [...container.querySelectorAll("button")]
      .reverse()
      .find((button) => button.textContent?.includes("一日")) as
      HTMLButtonElement | undefined;
    act(() => trigger?.click());
    const option = [
      ...container.querySelectorAll('[role="dialog"] button'),
    ].find((button) => button.textContent?.includes("2泊3日"));
    act(() => (option as HTMLButtonElement | undefined)?.click());
    expect(onChange).toHaveBeenCalledWith("3d2n");
  });
});
