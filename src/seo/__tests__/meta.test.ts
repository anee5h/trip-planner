import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_DESCRIPTION,
  DEFAULT_PAGE_TITLE,
  HOME_TITLE,
  MAX_META_DESCRIPTION_LENGTH,
  SHARE_COPY,
  restorePageMeta,
  setPageMeta,
  websiteJsonLd,
} from "@/seo/meta";

describe("KAI-68 page meta ownership", () => {
  it("setPageMeta writes title and description", () => {
    document.title = DEFAULT_PAGE_TITLE;
    const meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);

    setPageMeta("Himeji Castle | Meguruto", "A castle description.");

    expect(document.title).toBe("Himeji Castle | Meguruto");
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe("A castle description.");
  });

  it("restorePageMeta returns the shell defaults (unmount cleanup)", () => {
    setPageMeta("Himeji Castle | Meguruto", "A castle description.");
    restorePageMeta();
    expect(document.title).toBe(DEFAULT_PAGE_TITLE);
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe(DEFAULT_PAGE_DESCRIPTION);
  });

  it("setPageMeta creates the meta element if absent", () => {
    document.head
      .querySelectorAll('meta[name="description"]')
      .forEach((m) => m.remove());
    setPageMeta("Title", "Desc");
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe("Desc");
  });
});

describe("KAI-114 Japanese brand SEO", () => {
  it("keeps the English home title as the canonical default", () => {
    expect(HOME_TITLE.en).toBe(DEFAULT_PAGE_TITLE);
  });

  it("Japanese home title carries both メグルト and Meguruto", () => {
    expect(HOME_TITLE.ja).toContain("メグルト");
    expect(HOME_TITLE.ja).toContain("Meguruto");
  });

  it("Japanese share copy carries the Katakana brand naturally", () => {
    expect(SHARE_COPY.ja.title).toContain("メグルト");
    expect(SHARE_COPY.ja.title).toContain("Meguruto");
    expect(SHARE_COPY.ja.description).toContain("メグルト");
    expect(SHARE_COPY.ja.description.length).toBeLessThanOrEqual(
      MAX_META_DESCRIPTION_LENGTH,
    );
  });

  it("websiteJsonLd declares the canonical WebSite entity", () => {
    const parsed = JSON.parse(websiteJsonLd());
    expect(parsed).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Meguruto",
      url: "https://meguruto.app",
    });
    expect(parsed.alternateName).toEqual(["メグルト", "meguruto.app"]);
  });

  it("the static EN shell carries the byte-identical WebSite entity", () => {
    const shell = readFileSync(
      path.resolve(process.cwd(), "index.html"),
      "utf8",
    );
    expect(shell).toContain(
      `<script type="application/ld+json">${websiteJsonLd()}</script>`,
    );
  });
});
