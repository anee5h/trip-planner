import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { WalkingIntensityLevel } from "@/shared/utils/walking";
import { WalkingIntensityBadge } from "../WalkingIntensityBadge";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const levels: Array<[WalkingIntensityLevel, string, string]> = [
  ["low", "Low", "emerald"],
  ["medium", "Moderate", "amber"],
  ["high", "High", "rose"],
];

describe("WalkingIntensityBadge", () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    root?.unmount();
    root = null;
    host?.remove();
    host = null;
  });

  it.each(levels)(
    "%s renders its semantic label without an emoji indicator",
    async (level, label, color) => {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);

      await act(async () => {
        root!.render(<WalkingIntensityBadge level={level} locale="en" />);
      });

      const badge = host.querySelector(
        '[data-testid="walking-intensity-badge"]',
      );
      expect(badge?.textContent).toBe(label);
      expect(badge?.textContent).not.toMatch(/[🟢🟡🔴]/u);
      expect(badge?.className).toContain(`text-${color}-`);
      expect(badge?.className).toContain(`dark:bg-${color}-`);
      expect(badge?.className).toContain(`dark:text-${color}-`);
    },
  );

  it.each([
    ["low" as const, "少なめ"],
    ["medium" as const, "普通"],
    ["high" as const, "多め"],
  ])("keeps the Japanese walking label for %s", async (level, label) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<WalkingIntensityBadge level={level} locale="ja" />);
    });

    const badge = host.querySelector('[data-testid="walking-intensity-badge"]');
    expect(badge?.textContent).toBe(label);
    expect(badge?.textContent).not.toMatch(/[🟢🟡🔴]/u);
  });
});
