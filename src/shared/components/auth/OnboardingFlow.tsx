import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useLocale } from "@/shared/context/LocaleContext";
import StationInput from "@/shared/components/StationInput";
import { getCityHubsAsDestinations } from "@/shared/services/cityHubs";
import { SearchableDestinationPicker } from "@/shared/components/ui/SearchableDestinationPicker";
import { Button } from "@/shared/components/ui/button";
import { useTranslation } from "react-i18next";
import { Car } from "lucide-react";
import type { CarMode } from "@/shared/utils/carMode";
import {
  DEFAULT_PUBLIC_MODES,
  normalizeTransportPreferences,
  serializeTransportPreferences,
  PUBLIC_TRANSPORT_MODES,
  type PublicTransportMode,
} from "@/shared/utils/transportPreferences";

const ONBOARDING_PREFIX = "meguruto-onboarding-v2";

const PUBLIC_MODE_LABEL_KEYS: Record<
  PublicTransportMode,
  | "home.transportModes.train"
  | "home.transportModes.shinkansen"
  | "home.transportModes.bus"
  | "home.transportModes.flight"
  | "home.transportModes.ferry"
> = {
  train: "home.transportModes.train",
  shinkansen: "home.transportModes.shinkansen",
  bus: "home.transportModes.bus",
  flight: "home.transportModes.flight",
  ferry: "home.transportModes.ferry",
};

function onboardingKey(userId: string): string {
  return `${ONBOARDING_PREFIX}-${userId}`;
}

function isOnboardingNeeded(userId: string): boolean {
  try {
    const stored = localStorage.getItem(onboardingKey(userId));
    if (stored) {
      const data = JSON.parse(stored);
      if (data.completed || data.skipped) return false;
    }
    return true;
  } catch {
    return true;
  }
}

function checkAndMarkConfiguredAccount(
  userId: string,
  userMeta?: Record<string, unknown> | null,
): boolean {
  // Already completed or skipped locally → don't show
  if (!isOnboardingNeeded(userId)) return false;
  // Supabase metadata says preferences already set → mark complete, don't show
  const prefs = userMeta?.preferences as Record<string, unknown> | undefined;
  if (prefs?.preferences_set === true) {
    markOnboardingComplete(userId);
    return false;
  }
  return true;
}

function markOnboardingSkipped(userId: string) {
  localStorage.setItem(
    onboardingKey(userId),
    JSON.stringify({ skipped: true, skippedAt: Date.now() }),
  );
}

function markOnboardingComplete(userId: string) {
  localStorage.setItem(
    onboardingKey(userId),
    JSON.stringify({ completed: true }),
  );
}

export function OnboardingFlow() {
  const { t } = useTranslation();
  const { user, updateUserProfile } = useAuth();
  const { locale, setLocale } = useLocale();
  const { savedHomeStation } = useTripStore();

  const [step, setStep] = useState<"account" | "preferences" | "done">(
    "account",
  );
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Account fields
  const [fullName, setFullName] = useState("");
  const [homeCityId, setHomeCityId] = useState("");
  const [baseLocation, setBaseLocation] = useState("Tokyo Station");
  const [defaultLocale, setDefaultLocale] = useState<"en" | "ja">(locale);

  // Preference fields
  const [publicTransport, setPublicTransport] = useState(true);
  const [carMode, setCarMode] = useState<CarMode>("none");
  const [publicModes, setPublicModes] = useState<string[]>([
    ...DEFAULT_PUBLIC_MODES,
  ]);
  const [partySize, setPartySize] = useState(2);
  const [budget, setBudget] = useState("standard");

  // Reset all transient state and form fields when user changes
  useEffect(() => {
    setVisible(false);
    setStep("account");
    setSaveError("");
    setSaving(false);
    setFullName("");
    setHomeCityId("");
    setBaseLocation("Tokyo Station");
    setDefaultLocale(locale);
    setPublicTransport(true);
    setCarMode("none");
    setPublicModes([...DEFAULT_PUBLIC_MODES]);
    setPartySize(2);
    setBudget("standard");
  }, [user?.id]);

  // Show onboarding if needed for current user
  useEffect(() => {
    if (!user?.id) return;
    if (!checkAndMarkConfiguredAccount(user.id, user.user_metadata)) return;
    if (isOnboardingNeeded(user.id)) {
      // Populate from existing metadata if available
      setFullName(user.user_metadata?.full_name || "");
      setHomeCityId(user.user_metadata?.home_city || "");
      setBaseLocation(
        savedHomeStation ||
          user.user_metadata?.base_location ||
          "Tokyo Station",
      );
      setDefaultLocale(
        user.user_metadata?.default_locale === "ja" ? "ja" : locale,
      );
      if (user.user_metadata?.preferences) {
        const transportPreferences = normalizeTransportPreferences(
          user.user_metadata.preferences,
        );
        setPublicTransport(transportPreferences.publicTransport);
        setCarMode(transportPreferences.carMode);
        setPublicModes(transportPreferences.publicModes);
        setPartySize(user.user_metadata.preferences.partySize || 2);
        setBudget(user.user_metadata.preferences.budget || "standard");
      }
      setVisible(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (savedHomeStation) setBaseLocation(savedHomeStation);
  }, [savedHomeStation]);

  // KAI-132: city-hub options come from the dedicated lightweight
  // metadata source (no lite-catalogue dependency — onboarding/account
  // never fetches destinations-index.lite.json).
  const cityHubs = useMemo(() => getCityHubsAsDestinations(), []);

  const togglePublicMode = (mode: string) => {
    if (!publicTransport) return;
    setPublicModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const togglePublicTransport = () => {
    // Keep the saved preference set valid: a car must be selected before
    // public transit can be switched off.
    if (publicTransport && carMode === "none") return;
    setPublicTransport((enabled) => !enabled);
  };

  const handleSkip = () => {
    if (!user?.id) return;
    markOnboardingSkipped(user.id);
    setVisible(false);
  };

  const handleSaveAccount = async () => {
    if (!user?.id) return;
    setSaving(true);
    setSaveError("");
    const { error } = await updateUserProfile({
      full_name: fullName.trim(),
      base_location: baseLocation,
      home_city: homeCityId,
      default_locale: defaultLocale,
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message || t("ui.failedSave"));
      return;
    }
    setLocale(defaultLocale);
    setStep("preferences");
  };

  const handleSavePreferences = async () => {
    if (!user?.id) return;
    setSaving(true);
    setSaveError("");
    const transportPreferences = serializeTransportPreferences(
      normalizeTransportPreferences({
        publicTransport,
        carMode,
        publicModes,
      }),
    );
    const { error } = await updateUserProfile({
      preferences: {
        ...transportPreferences,
        partySize,
        budget,
        preferences_set: true,
      },
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message || t("ui.failedSave"));
      return;
    }
    markOnboardingComplete(user.id);
    setStep("done");
    setTimeout(() => setVisible(false), 1500);
  };

  if (!visible || !user) return null;

  const btn =
    "p-2 sm:p-3 rounded-xl text-[11px] sm:text-xs font-bold border transition-all text-center";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950 sm:p-6">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {step === "done" ? (
            <div className="text-center py-6 space-y-3">
              <div className="text-emerald-700" aria-hidden="true">
                ✓
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t("onboarding.doneTitle")}
              </h3>
              <p className="text-xs text-slate-500">
                {t("onboarding.doneHelp")}
              </p>
            </div>
          ) : (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${step === "account" ? "bg-emerald-700" : "bg-slate-300 dark:bg-slate-700"}`}
                />
                <div
                  className={`w-2.5 h-2.5 rounded-full ${step === "preferences" ? "bg-emerald-700" : "bg-slate-300 dark:bg-slate-700"}`}
                />
              </div>

              {step === "account" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {t("onboarding.accountTitle")}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {t("onboarding.accountHelp")}
                    </p>
                  </div>
                  {saveError && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold">
                      {saveError}
                    </div>
                  )}
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    {t("settings.fullName")}
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t("settings.fullNamePlaceholder")}
                      className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-white"
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    {t("ui.defaultLanguage")}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {[
                        { id: "en", label: t("settings.languageEn") },
                        { id: "ja", label: t("settings.languageJa") },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setDefaultLocale(opt.id as "en" | "ja")
                          }
                          className={`${btn} ${
                            defaultLocale === opt.id
                              ? "bg-emerald-700 text-white border-emerald-700"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    {t("ui.chooseCity")}
                    <SearchableDestinationPicker
                      value={homeCityId}
                      onSelect={(d) => setHomeCityId(d.id)}
                      placeholder={t("ui.chooseCity")}
                      locale={locale}
                      destinations={cityHubs}
                      savedDestinations={[]}
                      recentDestinations={[]}
                      className="mt-2"
                    />
                  </label>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                      {t("ui.baseLocation")}
                    </label>
                    <StationInput
                      embedded={true}
                      allowCurrentLocation={false}
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSkip}
                      disabled={saving}
                      className="flex-1 rounded-xl text-xs font-bold"
                    >
                      {t("onboarding.skip")}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveAccount}
                      disabled={saving}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold"
                    >
                      {t("onboarding.continue")}
                    </Button>
                  </div>
                </div>
              )}

              {step === "preferences" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {t("onboarding.preferencesTitle")}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {t("onboarding.preferencesHelp")}
                    </p>
                  </div>
                  {saveError && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold">
                      {saveError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                      {t("home.budget")}
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: "economy", label: t("home.budgets.economy") },
                        { id: "standard", label: t("home.budgets.standard") },
                        {
                          id: "comfortable",
                          label: t("home.budgets.comfortable"),
                        },
                        { id: "luxury", label: t("home.budgets.luxury") },
                      ].map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBudget(b.id)}
                          className={`${btn} ${
                            budget === b.id
                              ? "bg-emerald-700 text-white border-emerald-700"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                      {t("onboarding.transportOptions")}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        aria-pressed={publicTransport}
                        onClick={togglePublicTransport}
                        className={`${btn} min-h-11 ${
                          publicTransport
                            ? "bg-emerald-700 text-white border-emerald-700"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {t("home.transportOptions.public")}
                      </button>
                      {[
                        {
                          id: "rental" as const,
                          label: t("home.transportOptions.rentalCar"),
                        },
                        {
                          id: "my_car" as const,
                          label: t("home.transportOptions.myCar"),
                        },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setCarMode(m.id)}
                          aria-pressed={carMode === m.id}
                          className={`${btn} min-h-11 ${
                            carMode === m.id
                              ? "bg-emerald-700 text-white border-emerald-700"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <Car
                            className="mx-auto mb-1 h-4 w-4"
                            aria-hidden="true"
                          />
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {publicTransport && (
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                        {t("settings.publicTransportModes")}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {PUBLIC_TRANSPORT_MODES.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => togglePublicMode(id)}
                            aria-pressed={publicModes.includes(id)}
                            className={`${btn} min-h-11 ${
                              publicModes.includes(id)
                                ? "bg-emerald-700 text-white border-emerald-700"
                                : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {t(PUBLIC_MODE_LABEL_KEYS[id])}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                      {t("home.party")}:{" "}
                      {t("home.people_other", { count: partySize })}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={partySize}
                      onChange={(e) => setPartySize(parseInt(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSkip}
                      disabled={saving}
                      className="flex-1 rounded-xl text-xs font-bold"
                    >
                      {t("onboarding.skip")}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSavePreferences}
                      disabled={saving}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold"
                    >
                      {t("ui.save")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
