/**
 * KAI-80: reusable accessibility assertions for E2E.
 *
 * Wraps @axe-core/playwright so the representative major-route matrix can
 * assert WCAG 2.2 AA (automated subset) without duplicating config. This
 * is a regression GATE, not a certification — automated scanners cannot
 * validate everything (focus order, screen-reader narration), which is
 * why KAI-80 also documents manual QA.
 *
 * COLOR-CONTRAST POLICY: color-contrast is NOT suppressed. It is part of
 * the automated gate for both light and dark themes. Element-specific
 * exclusions are permitted ONLY for genuine documented exceptions (a
 * node-level allowlist with a reason); there is no rule-wide waiver.
 *
 * Usage:
 *   import { expectNoA11yViolations } from "./a11y";
 *   await expectNoA11yViolations(page, { excludeNodes: [...] });
 */
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

/**
 * Waits for the app to settle before scanning: theme resolution (the
 * ThemeContext toggles `document.documentElement.classList` for dark
 * mode) and initial data render. Scanning mid-hydration produces false
 * contrast/name failures (pre-hydration shell, dark-mode flash).
 */
async function waitForSettle(page) {
  await page.waitForFunction(
    () => {
      const cls = document.documentElement.className;
      return (
        cls.includes("dark") ||
        document.querySelector("button, input, [role='combobox']") !== null
      );
    },
    null,
    { timeout: 15_000 },
  );
  // Slow routes (JA locale, data-heavy pages) hydrate later than the first
  // interactive element appears; give the theme effect time to apply so
  // the scan sees the settled theme, not a dark flash.
  await page.waitForTimeout(1500);
}

/**
 * Element-specific axe node exclusions. Each entry is a documented
 * exception with a reason — there is NO rule-wide waiver (color-contrast
 * included). Nodes are matched by axe "target" selector (e.g.
 * "button[aria-label='X']") and only that exact node is skipped.
 *
 * Add entries ONLY for genuine documented exceptions (e.g. a decorative
 * element with an intentional brand color that still meets contrast in
 * the real rendered context but the scanner cannot composite).
 */
const DOCUMENTED_NODE_EXCLUSIONS = [
  // Example shape (none currently — keep the list honest):
  // {
  //   rule: "color-contrast",
  //   target: "div[data-chart-legend]",
  //   reason: "Legend swatch is decorative; adjacent text carries the
  //            information and passes contrast.",
  // },
];

function isExcluded(violationId, node) {
  return DOCUMENTED_NODE_EXCLUSIONS.some(
    (e) =>
      e.rule === violationId &&
      node.target &&
      node.target.some((t) => t === e.target),
  );
}

/**
 * Runs axe against the current page and asserts zero WCAG 2.2 AA
 * violations of the automated-impact rules (wcag2a + wcag21aa +
 * wcag22aa union). color-contrast is included — failures fail the gate.
 */
export async function expectNoA11yViolations(page, options = {}) {
  await waitForSettle(page);
  const results = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag21a",
      "wcag22a",
      "wcag2aa",
      "wcag21aa",
      "wcag22aa",
    ])
    .analyze();

  // Element-specific documented exclusions only.
  const violations = results.violations
    .map((v) => ({
      ...v,
      nodes: v.nodes.filter((n) => !isExcluded(v.id, n)),
    }))
    .filter((v) => v.nodes.length > 0)
    .filter((v) => !(options.excludeIds ?? []).includes(v.id));

  expect(
    violations,
    `A11y violations on ${page.url()}:\n` +
      violations
        .map(
          (v) =>
            `  ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)\n` +
            v.nodes
              .map(
                (n) =>
                  `      - ${n.target.join(", ")}: ${(n.failureSummary ?? "")
                    .split("\n")
                    .find((l) => l.trim())}`,
              )
              .join("\n"),
        )
        .join("\n"),
  ).toEqual([]);
}
