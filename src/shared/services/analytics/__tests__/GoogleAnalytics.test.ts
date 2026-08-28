import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
  initializeGoogleAnalytics,
  shouldInitializeGoogleAnalytics,
} from "../GoogleAnalytics";
import type { GoogleAnalyticsRuntime } from "../GoogleAnalytics";

function makeRuntime(
  productionBuild = true,
  hostname = "meguruto.app",
): GoogleAnalyticsRuntime {
  return {
    productionBuild,
    hostname,
    document,
    window: window as GoogleAnalyticsRuntime["window"],
  };
}

beforeEach(() => {
  document.head.innerHTML = "";
  const analyticsWindow = window as GoogleAnalyticsRuntime["window"];
  delete analyticsWindow.dataLayer;
  delete analyticsWindow.gtag;
  delete analyticsWindow.__megurutoGoogleAnalyticsInitialized;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Google Analytics production gate", () => {
  it("only enables the exact production hostname in production builds", () => {
    expect(shouldInitializeGoogleAnalytics(true, "meguruto.app")).toBe(true);
    expect(shouldInitializeGoogleAnalytics(false, "meguruto.app")).toBe(false);
    expect(shouldInitializeGoogleAnalytics(true, "localhost")).toBe(false);
    expect(shouldInitializeGoogleAnalytics(true, "meguruto.pages.dev")).toBe(
      false,
    );
  });

  it("does not add a tag outside the production environment", () => {
    initializeGoogleAnalytics(makeRuntime(false));
    initializeGoogleAnalytics(makeRuntime(true, "localhost"));

    expect(
      document.querySelectorAll(
        'script[data-meguruto-google-analytics="true"]',
      ),
    ).toHaveLength(0);
  });
});

describe("Google Analytics initialization", () => {
  it("queues one config and appends one async tag across repeated calls", () => {
    const runtime = makeRuntime();

    initializeGoogleAnalytics(runtime);
    initializeGoogleAnalytics(runtime);

    const scripts = document.querySelectorAll(
      'script[data-meguruto-google-analytics="true"]',
    );
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).async).toBe(true);
    expect((scripts[0] as HTMLScriptElement).src).toBe(
      `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}`,
    );

    const dataLayer = runtime.window.dataLayer ?? [];
    expect(dataLayer).toHaveLength(2);
    expect(dataLayer[0]).toEqual(["js", expect.any(Date)]);
    expect(dataLayer[1]).toEqual(["config", GOOGLE_ANALYTICS_MEASUREMENT_ID]);
    expect(dataLayer).not.toContainEqual(["event", "page_view"]);
  });

  it("does not add a direct tag when a Google tag already exists", () => {
    const existing = document.createElement("script");
    existing.src = "https://www.googletagmanager.com/gtag/js?id=G-existing";
    document.head.appendChild(existing);

    initializeGoogleAnalytics(makeRuntime());

    expect(document.querySelectorAll("script")).toHaveLength(1);
    expect(
      (window as GoogleAnalyticsRuntime["window"]).dataLayer,
    ).toBeUndefined();
  });

  it("swallows script insertion failures", () => {
    vi.spyOn(document.head, "appendChild").mockImplementation(() => {
      throw new Error("CSP blocked script");
    });

    expect(() => initializeGoogleAnalytics(makeRuntime())).not.toThrow();
  });
});
