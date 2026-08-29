import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { buildPrerenderOutputs } from "@/seo/prerender";
import type { Destination } from "@/shared/types/destination";

const ROOT = process.cwd();
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const INIT_SOURCE = fs.readFileSync(
  path.join(ROOT, "public/ga4-init.js"),
  "utf8",
);
const GA4_URL = "https://www.googletagmanager.com/gtag/js?id=G-5QKWZM9190";
const GA4_INIT_REFERENCE = '<script src="/ga4-init.js"></script>';

type TestWindow = {
  location: { hostname: string; pathname: string };
  localStorage: { getItem: (key: string) => string | null };
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: string]: unknown;
};

function count(text: string, pattern: string): number {
  return text.split(pattern).length - 1;
}

function makeDestination(): Destination {
  return {
    id: "test-destination",
    name: "Test Destination",
    nameJa: "テスト目的地",
    description: "A canonical English description for the test destination.",
    heroImage: "/images/hero.jpg",
    prefecture: "Tokyo",
    region: "Kanto",
    categories: [],
    status: "published",
    collections: [],
    highlights: [],
  } as unknown as Destination;
}

function runInit({
  hostname,
  pathname = "/",
  language = "en-US",
  preference = null,
}: {
  hostname: string;
  pathname?: string;
  language?: string;
  preference?: "en" | "ja" | null;
}) {
  const storage = {
    getItem: () => preference,
  };
  const context: {
    window: TestWindow;
    document: { cookie: string };
    navigator: { language: string };
  } = {
    window: {
      location: { hostname, pathname },
      localStorage: storage,
    },
    document: { cookie: "" },
    navigator: { language },
  };
  vm.runInNewContext(INIT_SOURCE, context);
  return context.window;
}

function expectShellHasOneGoogleInstallation(html: string): void {
  expect(count(html, GA4_URL)).toBe(1);
  expect(count(html, GA4_INIT_REFERENCE)).toBe(1);
}

describe("KAI-245 static GA4 document-shell installation", () => {
  it("puts one discoverable loader and one same-origin init reference in the source head", () => {
    expectShellHasOneGoogleInstallation(INDEX_HTML);
    expect(INDEX_HTML.indexOf(GA4_URL)).toBeGreaterThan(
      INDEX_HTML.indexOf("<head>"),
    );
    expect(INDEX_HTML.indexOf(GA4_URL)).toBeLessThan(
      INDEX_HTML.indexOf("</head>"),
    );
    expect(INDEX_HTML.indexOf(GA4_INIT_REFERENCE)).toBeGreaterThan(
      INDEX_HTML.indexOf(GA4_URL),
    );
  });

  it("keeps exactly one installation in every generated public HTML shell", () => {
    const outputs = buildPrerenderOutputs(INDEX_HTML, [makeDestination()]);
    const htmlOutputs = [...outputs.entries()].filter(([outputPath]) =>
      outputPath.endsWith(".html"),
    );

    expect(htmlOutputs.map(([outputPath]) => outputPath)).toEqual([
      "/index.html",
      "/ja/index.html",
      "/destinations/test-destination/index.html",
      "/ja/destinations/test-destination/index.html",
    ]);
    for (const [, html] of htmlOutputs) {
      expectShellHasOneGoogleInstallation(html);
    }
  });

  it("removes the application-bootstrap loader architecture", () => {
    const main = fs.readFileSync(path.join(ROOT, "src/main.tsx"), "utf8");
    expect(main).not.toContain("initializeGoogleAnalytics");
    expect(
      fs.existsSync(
        path.join(ROOT, "src/shared/services/analytics/GoogleAnalytics.ts"),
      ),
    ).toBe(false);
  });

  it("queues one js initialization and one config call on the production host", () => {
    const runtime = runInit({ hostname: "meguruto.app" });
    const dataLayer = runtime.dataLayer ?? [];
    const entries: unknown[][] = dataLayer.map((entry) =>
      Array.from(entry as ArrayLike<unknown>),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]?.[0]).toBe("js");
    expect(Object.prototype.toString.call(entries[0]?.[1])).toBe(
      "[object Date]",
    );
    expect(entries[1]).toEqual(["config", "G-5QKWZM9190"]);
  });

  it("does not queue production config on localhost or preview hosts", () => {
    for (const hostname of ["localhost", "127.0.0.1", "meguruto.pages.dev"]) {
      const runtime = runInit({ hostname });
      expect(runtime.dataLayer).toBeUndefined();
      expect(runtime.gtag).toBeUndefined();
    }
  });

  it("does not create a transient English page view before the Japanese locale redirect", () => {
    expect(
      runInit({ hostname: "meguruto.app", language: "ja-JP" }).dataLayer,
    ).toBeUndefined();
    expect(
      runInit({ hostname: "meguruto.app", pathname: "/ja/", language: "ja-JP" })
        .dataLayer,
    ).toHaveLength(2);
    expect(
      runInit({
        hostname: "meguruto.app",
        language: "ja-JP",
        preference: "en",
      }).dataLayer,
    ).toHaveLength(2);
  });

  it("is idempotent when the same static init is executed more than once", () => {
    const runtime = runInit({ hostname: "meguruto.app" });
    vm.runInNewContext(INIT_SOURCE, {
      window: runtime,
      document: { cookie: "" },
      navigator: { language: "en-US" },
    });

    const entries: unknown[][] = (runtime.dataLayer ?? []).map((entry) =>
      Array.from(entry as ArrayLike<unknown>),
    );
    expect(entries).toHaveLength(2);
    expect(entries.filter(([name]) => name === "js")).toHaveLength(1);
    expect(entries.filter(([name]) => name === "config")).toHaveLength(1);
  });

  it("keeps the script CSP-safe and synchronized with the Function policy", () => {
    const headers = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf8");
    const meta = fs.readFileSync(path.join(ROOT, "src/seo/meta.ts"), "utf8");
    const scriptSources =
      "script-src 'self' https://static.cloudflareinsights.com https://www.googletagmanager.com";
    expect(headers).toContain(scriptSources);
    expect(meta).toContain(scriptSources);
    expect(headers).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(meta).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(headers).toContain("connect-src 'self'");
    expect(meta).toContain("connect-src 'self'");
  });

  it("keeps the same-origin initializer on the static asset path", () => {
    const routes = JSON.parse(
      fs.readFileSync(path.join(ROOT, "public/_routes.json"), "utf8"),
    ) as { exclude?: string[] };
    expect(routes.exclude).toContain("/ga4-init.js");
  });

  it("does not add an explicit page_view event", () => {
    expect(INIT_SOURCE).not.toContain('"event", "page_view"');
    expect(INIT_SOURCE).not.toContain("'event', 'page_view'");
  });
});
