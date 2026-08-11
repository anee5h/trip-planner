/**
 * KAI-65: scoped native search-decoration suppression CSS.
 *
 * Unit DOM tests cannot render the browser-native ::-webkit-search-cancel-button
 * pseudo-element, so the visual absence of the native X is verified in real
 * browser QA (see qa/kai-65/browser-qa.mjs + screenshots). This test guards the
 * underlying contract: the suppression rule exists in the shipped stylesheet
 * and is narrowly scoped to inputs that opt in via `.no-native-search-cancel` —
 * native search decorations are NOT removed globally.
 *
 * @vitest-environment node
 */
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const cssPath = new URL("../../../index.css", import.meta.url);
const css = readFileSync(cssPath, "utf8");

describe("native search-cancel suppression CSS (KAI-65)", () => {
  it("suppresses the native search cancel button for opted-in inputs", () => {
    expect(css).toContain(
      "input.no-native-search-cancel::-webkit-search-cancel-button",
    );
  });

  it("also suppresses the native search decoration (magnifier) for opted-in inputs", () => {
    expect(css).toContain(
      "input.no-native-search-cancel::-webkit-search-decoration",
    );
  });

  it("keeps the rule scoped — no global, unscoped suppression of native search controls", () => {
    // Unscoped selectors like `input::-webkit-search-cancel-button` or
    // `::-webkit-search-cancel-button { ... }` would strip the native X from
    // every search input in the app, including inputs that do not render a
    // custom clear button.
    expect(css).not.toMatch(/input\s*:::-webkit-search-cancel-button/);
    expect(css).not.toMatch(/(^|})\s*:::-webkit-search-cancel-button/);
  });
});
