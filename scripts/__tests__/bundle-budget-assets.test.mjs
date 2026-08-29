import { describe, expect, it } from "vitest";
import { readAssetsIndex } from "../bundle-budget-assets.mjs";

describe("bundle budget document-shell asset parser", () => {
  it("collects Vite assets and ignores legitimate non-bundle scripts", () => {
    const html = `
      <script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-5QKWZM9190"
      ></script>
      <script>
        window.dataLayer = window.dataLayer || [];
      </script>
      <script type="module" src="/assets/index-entry.js"></script>
      <link rel="modulepreload" href="/assets/shared.js" />
    `;

    expect(readAssetsIndex(html)).toEqual([
      "/assets/index-entry.js",
      "/assets/shared.js",
    ]);
  });

  it("fails closed when the document has no Vite assets", () => {
    expect(() =>
      readAssetsIndex(`
        <script src="https://www.googletagmanager.com/gtag/js?id=G-5QKWZM9190"></script>
        <script>
        window.dataLayer = window.dataLayer || [];
      </script>
      `),
    ).toThrow("no entry script or modulepreload assets found");
  });

  it("fails closed for an unexpected local application reference", () => {
    expect(() =>
      readAssetsIndex('<script type="module" src="/app.js"></script>'),
    ).toThrow("invalid non-assets reference: /app.js");
  });
});
