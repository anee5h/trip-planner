(() => {
  "use strict";

  const MEASUREMENT_ID = "G-5QKWZM9190";
  const INITIALIZED_KEY = "__megurutoGa4Initialized";
  const LANGUAGE_PREF_KEY = "meguruto-lang";

  // The loader is intentionally present in every HTML shell for production
  // tag detection, but only the canonical production host may queue GA data.
  if (window.location.hostname !== "meguruto.app") return;

  // Mirror resolveInitialLanguage() in src/i18n/index.ts. The unprefixed
  // shell is immediately redirected to /ja when Japanese is selected; wait
  // for that locale URL so the redirect does not create a transient EN view.
  const readLanguagePreference = () => {
    try {
      const preference = window.localStorage.getItem(LANGUAGE_PREF_KEY);
      if (preference === "ja" || preference === "en") return preference;
    } catch {
      // Fall through to the cookie and browser locale.
    }

    try {
      const cookie = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${LANGUAGE_PREF_KEY}=`));
      const preference = cookie?.slice(`${LANGUAGE_PREF_KEY}=`.length);
      if (preference === "ja" || preference === "en") return preference;
    } catch {
      // Cookie access can be unavailable in privacy-restricted contexts.
    }

    return null;
  };

  const shouldSkipInitialPageView = () => {
    if (window.location.pathname.startsWith("/ja")) return false;

    const preference = readLanguagePreference();
    if (preference) return preference === "ja";

    return (
      typeof navigator !== "undefined" &&
      navigator.language.toLowerCase().startsWith("ja")
    );
  };

  if (shouldSkipInitialPageView() || window[INITIALIZED_KEY]) return;

  // At-most-once initialization protects against accidental duplicate static
  // execution while keeping the tag best-effort and non-blocking for startup.
  window[INITIALIZED_KEY] = true;
  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID);
  } catch {
    // Analytics must never prevent the application from loading.
  }
})();
