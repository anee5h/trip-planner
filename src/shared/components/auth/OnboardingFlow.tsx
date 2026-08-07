import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useLocale } from "@/shared/context/LocaleContext";
import StationInput from "@/shared/components/StationInput";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import { SearchableDestinationPicker } from "@/shared/components/ui/SearchableDestinationPicker";
import { Button } from "@/shared/components/ui/button";
import { useTranslation } from "react-i18next";

const ONBOARDING_KEY = "meguruto-onboarding-v1";

function isOnboardingNeeded(userId: string): boolean {
  try {
    const stored = localStorage.getItem(ONBOARDING_KEY);
    if (!stored) return true;
    const data = JSON.parse(stored);
    return !data.completed && data.userId === userId;
  } catch {
    return true;
  }
}

function markOnboardingSkipped(userId: string) {
  localStorage.setItem(
    ONBOARDING_KEY,
    JSON.stringify({ userId, completed: false, skippedAt: Date.now() }),
  );
}

function markOnboardingComplete(userId: string) {
  localStorage.setItem(
    ONBOARDING_KEY,
    JSON.stringify({ userId, completed: true }),
  );
}

export function OnboardingFlow() {
  const { t } = useTranslation();
  const { user, updateUserProfile } = useAuth();
  const { locale, setLocale } = useLocale();
  const { homeStation } = useTripStore();

  const [step, setStep] = useState<"account" | "preferences" | "done">(
    "account",
  );
  const [visible, setVisible] = useState(false);

  // Account fields
  const [fullName, setFullName] = useState("");
  const [homeCityId, setHomeCityId] = useState("");
  const [baseLocation, setBaseLocation] = useState("Tokyo Station");
  const [defaultLocale, setDefaultLocale] = useState<"en" | "ja">(locale);

  // Preference fields
  const [carMode, setCarMode] = useState("none");
  const [publicModes, setPublicModes] = useState<string[]>([
    "train",
    "shinkansen",
    "bus",
    "flight",
  ]);
  const [partySize, setPartySize] = useState(2);
  const [budget, setBudget] = useState("standard");

  useEffect(() => {
    if (!user?.id) return;
    if (isOnboardingNeeded(user.id)) {
      // Populate from existing metadata if available
      setFullName(user.user_metadata?.full_name || "");
      setHomeCityId(user.user_metadata?.home_city || "");
      setBaseLocation(
        homeStation || user.user_metadata?.base_location || "Tokyo Station",
      );
      setDefaultLocale(
        user.user_metadata?.default_locale === "ja" ? "ja" : locale,
      );
      if (user.user_metadata?.preferences) {
        setCarMode(user.user_metadata.preferences.carMode || "none");
        setPublicModes(
          user.user_metadata.preferences.publicModes || [
            "train",
            "shinkansen",
            "bus",
            "flight",
          ],
        );
        setPartySize(user.user_metadata.preferences.partySize || 2);
        setBudget(user.user_metadata.preferences.budget || "standard");
      }
      setVisible(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (homeStation) setBaseLocation(homeStation);
  }, [homeStation]);

  const cityHubs = useMemo(
    () =>
      (getDestinationList(locale) as Destination[])
        .filter((d) => d.role === "hub")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [locale],
  );

  const togglePublicMode = (mode: string) => {
    setPublicModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  };

  const handleSkip = () => {
    if (!user?.id) return;
    markOnboardingSkipped(user.id);
    setVisible(false);
  };

  const handleSaveAccount = async () => {
    if (!user?.id) return;
    await updateUserProfile({
      full_name: fullName.trim(),
      base_location: baseLocation,
      home_city: homeCityId,
      default_locale: defaultLocale,
    });
    setLocale(defaultLocale);
    setStep("preferences");
  };

  const handleSavePreferences = async () => {
    if (!user?.id) return;
    await updateUserProfile({
      preferences: {
        carMode,
        publicModes,
        partySize,
        budget,
        preferences_set: true,
      },
    });
    markOnboardingComplete(user.id);
    setStep("done");
    setTimeout(() => setVisible(false), 1500);
  };

  if (!visible || !user) return null;

  const btn =
    "p-2 sm:p-3 rounded-xl text-[11px] sm:text-xs font-bold border transition-all text-center";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-xl space-y-5">
        {step === "done" ? (
          <div className="text-center py-6 space-y-3">
            <div className="text-2xl">✅</div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              All set!
            </h3>
            <p className="text-xs text-slate-500">
              You can change these anytime in Settings.
            </p>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${step === "account" ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
              />
              <div
                className={`w-2.5 h-2.5 rounded-full ${step === "preferences" ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
              />
            </div>

            {step === "account" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Tell us about yourself
                  </h3>
                  <p className="text-xs text-slate-500">
                    This helps personalize your trip recommendations.
                  </p>
                </div>
                <label className="block text-xs font-bold uppercase text-slate-500">
                  Full name
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white"
                  />
                </label>
                <label className="block text-xs font-bold uppercase text-slate-500">
                  Language
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { id: "en", label: "English" },
                      { id: "ja", label: "日本語" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDefaultLocale(opt.id as "en" | "ja")}
                        className={`${btn} ${
                          defaultLocale === opt.id
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block text-xs font-bold uppercase text-slate-500">
                  Home city
                  <SearchableDestinationPicker
                    value={homeCityId}
                    onSelect={(d) => setHomeCityId(d.id)}
                    placeholder="Select home city"
                    locale={locale}
                    destinations={cityHubs}
                    savedDestinations={[]}
                    recentDestinations={[]}
                    className="mt-2"
                  />
                </label>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                    Base station
                  </label>
                  <StationInput embedded={true} />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkip}
                    className="flex-1 rounded-xl text-xs font-bold"
                  >
                    Skip
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveAccount}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === "preferences" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Travel preferences
                  </h3>
                  <p className="text-xs text-slate-500">
                    Set your defaults for trip planning.
                  </p>
                </div>

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
                            ? "bg-emerald-500 text-white border-emerald-500"
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
                    {t("home.transportModes.car")}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "none", label: t("home.transportOptions.public") },
                      {
                        id: "rental",
                        label: t("home.transportOptions.rentalCar"),
                      },
                      { id: "own", label: t("home.transportOptions.myCar") },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setCarMode(m.id)}
                        className={`${btn} ${
                          carMode === m.id
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    {t("home.transport")}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "train", label: t("home.transportModes.train") },
                      {
                        id: "shinkansen",
                        label: t("home.transportModes.shinkansen"),
                      },
                      { id: "bus", label: t("home.transportModes.bus") },
                      { id: "flight", label: t("home.transportModes.flight") },
                    ].map((tm) => (
                      <button
                        key={tm.id}
                        type="button"
                        onClick={() => togglePublicMode(tm.id)}
                        className={`${btn} ${
                          publicModes.includes(tm.id)
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {tm.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    {t("home.party")}: {partySize}{" "}
                    {partySize > 1
                      ? t("home.people_other")
                      : t("home.people_one")}
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
                    className="flex-1 rounded-xl text-xs font-bold"
                  >
                    Skip
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSavePreferences}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
