import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_DESCRIPTION,
  DEFAULT_PAGE_TITLE,
  restorePageMeta,
  setPageMeta,
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
