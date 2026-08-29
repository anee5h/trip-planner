import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { buildPrerenderOutputs } from "@/seo/prerender";
import type { Destination } from "@/shared/types/destination";

const ROOT = process.cwd();
const INDEX_HTML = readFileSync(path.join(ROOT, "index.html"), "utf8");
const GA4_URL = "https://www.googletagmanager.com/gtag/js?id=G-5QKWZM9190";
const GA4_INLINE_MARKER = "window.dataLayer = window.dataLayer || [];";
const GA4_CONFIG_CALL = "gtag('config', 'G-5QKWZM9190')";

function count(text: string, pattern: string): number {
  return text.split(pattern).length - 1;
}

function extractInlineInitializers(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? "")
    .filter((body) => body.includes(GA4_INLINE_MARKER));
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

type TestWindow = {
  location: { hostname: string; pathname: string };
  localStorage: { getItem: (key: string) => string | null };
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: string]: unknown;
};

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
  const context = {
    location: { hostname, pathname },
    localStorage: { getItem: () => preference },
    document: { cookie: "" },
    navigator: { language },
  } as Record<string, unknown>;
  context.window = context;
  vm.runInNewContext(extractInlineInitializers(INDEX_HTML)[0] ?? "", context);
  return context as unknown as TestWindow;
}

function entries(runtime: TestWindow): unknown[][] {
  return (runtime.dataLayer ?? []).map((entry) =>
    Array.from(entry as ArrayLike<unknown>),
  );
}

function expectShellHasOneGoogleInstallation(html: string): void {
  expect(count(html, GA4_URL)).toBe(1);
  expect(extractInlineInitializers(html)).toHaveLength(1);
  expect(html).not.toContain("/ga4-init.js");
}

describe("KAI-245 inline GA4 document-shell installation", () => {
  it("puts one discoverable loader and one inline initializer in the source head", () => {
    expectShellHasOneGoogleInstallation(INDEX_HTML);
    expect(INDEX_HTML.indexOf(GA4_URL)).toBeGreaterThan(
      INDEX_HTML.indexOf("<head>"),
    );
    expect(INDEX_HTML.indexOf(GA4_URL)).toBeLessThan(
      INDEX_HTML.indexOf("</head>"),
    );
    expect(INDEX_HTML.indexOf(GA4_INLINE_MARKER)).toBeGreaterThan(
      INDEX_HTML.indexOf(GA4_URL),
    );
    expect(INDEX_HTML.indexOf(GA4_INLINE_MARKER)).toBeLessThan(
      INDEX_HTML.indexOf("</head>"),
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

  it("uses Google's standard inline queue shape with the exact production gate", () => {
    const [source] = extractInlineInitializers(INDEX_HTML);
    expect(source).toContain("function gtag(){dataLayer.push(arguments);}");
    expect(count(source, "gtag('js', new Date())")).toBe(1);
    expect(count(source, GA4_CONFIG_CALL)).toBe(1);
    expect(source).toContain('window.location.hostname === "meguruto.app"');
    expect(source).not.toContain("unsafe-inline");
  });

  it("removes the application-bootstrap and external initializer architectures", () => {
    const main = readFileSync(path.join(ROOT, "src/main.tsx"), "utf8");
    expect(main).not.toContain("initializeGoogleAnalytics");
    expect(
      existsSync(
        path.join(ROOT, "src/shared/services/analytics/GoogleAnalytics.ts"),
      ),
    ).toBe(false);
    expect(existsSync(path.join(ROOT, "public/ga4-init.js"))).toBe(false);
    const routes = JSON.parse(
      readFileSync(path.join(ROOT, "public/_routes.json"), "utf8"),
    ) as { exclude?: string[] };
    expect(routes.exclude ?? []).not.toContain("/ga4-init.js");
  });

  it("queues one js initialization and one config call on the production host", () => {
    const runtime = runInit({ hostname: "meguruto.app" });
    const queued = entries(runtime);

    expect(queued).toHaveLength(2);
    expect(queued[0]?.[0]).toBe("js");
    expect(Object.prototype.toString.call(queued[0]?.[1])).toBe(
      "[object Date]",
    );
    expect(queued[1]).toEqual(["config", "G-5QKWZM9190"]);
  });

  it("does not queue production config on localhost or preview hosts", () => {
    for (const hostname of ["localhost", "127.0.0.1", "meguruto.pages.dev"]) {
      const runtime = runInit({ hostname });
      expect(entries(runtime)).toHaveLength(1);
      expect(entries(runtime).some(([name]) => name === "config")).toBe(false);
    }
  });

  it("does not create a transient English page view before the Japanese locale redirect", () => {
    expect(
      runInit({ hostname: "meguruto.app", language: "ja-JP" }).dataLayer,
    ).toHaveLength(1);
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

  it("keeps the inline initializer CSP-safe and synchronized with both policies", () => {
    const [source] = extractInlineInitializers(INDEX_HTML);
    expect(source).toBeDefined();
    if (source === undefined) return;

    const hash = createHash("sha256").update(source, "utf8").digest("base64");
    const hashSource = `'sha256-${hash}'`;
    const headers = readFileSync(path.join(ROOT, "public/_headers"), "utf8");
    const meta = readFileSync(path.join(ROOT, "src/seo/meta.ts"), "utf8");
    const headerCsp = headers
      .match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1]
      ?.replace(/;$/, "");
    const metaCsp = meta.match(/"Content-Security-Policy":\s*"([^"]+)"/s)?.[1];

    expect(headerCsp).toBeDefined();
    expect(metaCsp).toBe(headerCsp);
    expect(headerCsp).toContain(hashSource);
    expect(headerCsp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("does not add an explicit page_view event", () => {
    const [source] = extractInlineInitializers(INDEX_HTML);
    expect(source).not.toContain("page_view");
  });
});
