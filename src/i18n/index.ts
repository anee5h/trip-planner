import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./resources/en/common.json";
import enDestination from "./resources/en/destination.json";
import jaCommon from "./resources/ja/common.json";
import jaDestination from "./resources/ja/destination.json";

export const resources = {
  en: { common: enCommon, destination: enDestination },
  ja: { common: jaCommon, destination: jaDestination },
} as const;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: (typeof resources)["en"];
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng:
    typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("ja")
      ? "ja"
      : "en",
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnNull: false,
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (_lngs, _ns, key) => {
    if (import.meta.env.DEV) console.warn(`Missing translation key: ${key}`);
  },
});

export default i18n;
