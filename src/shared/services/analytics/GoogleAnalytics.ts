const GOOGLE_TAG_SCRIPT_SELECTOR =
  'script[data-meguruto-google-analytics="true"], script[src*="googletagmanager.com/gtag/js"], script[src*="googletagmanager.com/gtm.js"]';
const INITIALIZED_KEY = "__megurutoGoogleAnalyticsInitialized" as const;

export const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-5QKWZM9190";
const GOOGLE_TAG_SCRIPT_URL = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}`;

type Gtag = (...args: unknown[]) => void;

type GoogleAnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
  [INITIALIZED_KEY]?: boolean;
};

export interface GoogleAnalyticsRuntime {
  productionBuild: boolean;
  hostname: string;
  document: Document;
  window: GoogleAnalyticsWindow;
}

export function shouldInitializeGoogleAnalytics(
  productionBuild: boolean,
  hostname: string,
): boolean {
  return productionBuild && hostname === "meguruto.app";
}

function getBrowserRuntime(): GoogleAnalyticsRuntime | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  return {
    productionBuild: import.meta.env.PROD,
    hostname: window.location.hostname,
    document,
    window: window as GoogleAnalyticsWindow,
  };
}

/**
 * Installs the direct Google tag once on the production hostname.
 * Enhanced Measurement owns browser-history page views; do not add a second
 * React Router page-view listener here.
 */
export function initializeGoogleAnalytics(
  runtime: GoogleAnalyticsRuntime | null = getBrowserRuntime(),
): void {
  if (
    !runtime ||
    !shouldInitializeGoogleAnalytics(runtime.productionBuild, runtime.hostname)
  ) {
    return;
  }

  try {
    if (
      runtime.window[INITIALIZED_KEY] ||
      runtime.window.gtag ||
      runtime.document.querySelector(GOOGLE_TAG_SCRIPT_SELECTOR)
    ) {
      return;
    }

    if (!runtime.document.head) return;
    runtime.window[INITIALIZED_KEY] = true;

    const dataLayer = Array.isArray(runtime.window.dataLayer)
      ? runtime.window.dataLayer
      : [];
    runtime.window.dataLayer = dataLayer;
    runtime.window.gtag = (...args: unknown[]) => dataLayer.push(args);
    runtime.window.gtag("js", new Date());
    runtime.window.gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID);

    const script = runtime.document.createElement("script");
    script.async = true;
    script.src = GOOGLE_TAG_SCRIPT_URL;
    script.dataset.megurutoGoogleAnalytics = "true";
    runtime.document.head.appendChild(script);
  } catch {
    // Analytics is best-effort and must never affect app startup.
  }
}
