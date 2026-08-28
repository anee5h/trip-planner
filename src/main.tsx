import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { resolveInitialLanguage } from "./i18n";
import { installGlobalErrorHandlers } from "./shared/utils/errorReporter";
import { initializeGoogleAnalytics } from "./shared/services/analytics/GoogleAnalytics";

// KAI-46: capture unhandled errors and unhandled rejections before the app
// boots so no first-paint crash is lost.
installGlobalErrorHandlers();

// Localized share previews require the locale to be visible in the URL (social
// platforms fetch metadata from the shared URL). Whenever the resolved
// language is Japanese — browser locale OR a stored Japanese preference — an
// unprefixed URL is redirected to the /ja version so shares carry Japanese
// preview metadata; an explicit English preference is respected. Full page
// load keeps crawler output intact (no client-only locale switching).
const shouldRedirectToJapanese =
  !window.location.pathname.startsWith("/ja") &&
  resolveInitialLanguage() === "ja";

if (shouldRedirectToJapanese) {
  window.location.replace(
    `/ja${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
} else {
  // GA4 is production-hostname gated. Skipping initialization on the
  // locale redirect avoids recording the transient pre-redirect URL.
  initializeGoogleAnalytics();
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        console.error("Meguruto service worker registration failed", error);
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
