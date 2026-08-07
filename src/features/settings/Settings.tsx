import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTheme } from "@/shared/context/ThemeContext";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTripStore } from "@/shared/hooks/useTripStore";
import StationInput from "@/shared/components/StationInput";
import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import {
  UserRound,
  Car,
  Palette,
  Download,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { personalizationService } from "@/shared/services/recommendation/PersonalizationService";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { SearchableDestinationPicker } from "@/shared/components/ui/SearchableDestinationPicker";
import packageJson from "@/../package.json";

type SettingsSection = "account" | "travel" | "appearance" | "data";

const BUDGET_PRESETS = [
  { id: "economy", key: "home.budgets.economy" },
  { id: "standard", key: "home.budgets.standard" },
  { id: "comfortable", key: "home.budgets.comfortable" },
  { id: "luxury", key: "home.budgets.luxury" },
] as const;

const ALL_MODES = [
  { id: "train", key: "home.transportModes.train" as const },
  { id: "shinkansen", key: "home.transportModes.shinkansen" as const },
  { id: "bus", key: "home.transportModes.bus" as const },
  { id: "flight", key: "home.transportModes.flight" as const },
  { id: "ferry", key: "home.transportModes.ferry" as const },
];

export default function Settings() {
  const { t } = useTranslation();
  const { user, updateUserProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const { homeStation, visited, visitedPrefectures, trips } = useTripStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sectionParam = searchParams.get("section") as SettingsSection | null;
  const returnParam = searchParams.get("return");

  const [activeSection, setActiveSection] = useState<SettingsSection>(
    sectionParam || "account",
  );
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [baseLocation, setBaseLocation] = useState(
    homeStation || user?.user_metadata?.base_location || "Tokyo Station",
  );
  const [carMode, setCarMode] = useState(
    user?.user_metadata?.preferences?.carMode || "none",
  );
  const [publicModes, setPublicModes] = useState<string[]>(
    user?.user_metadata?.preferences?.publicModes || [
      "train",
      "shinkansen",
      "bus",
      "flight",
      "ferry",
    ],
  );
  const [partySize, setPartySize] = useState(
    user?.user_metadata?.preferences?.partySize || 2,
  );
  const [budget, setBudget] = useState(
    user?.user_metadata?.preferences?.budget || "standard",
  );
  const [homeCityId, setHomeCityId] = useState(
    user?.user_metadata?.home_city || "",
  );
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name || "",
  );
  const [username, setUsername] = useState(user?.user_metadata?.username || "");
  const [defaultLocale, setDefaultLocale] = useState<"en" | "ja">(
    user?.user_metadata?.default_locale === "ja" ? "ja" : locale,
  );

  const cityHubs = useMemo(
    () =>
      (getDestinationList(locale) as Destination[])
        .filter((d) => d.role === "hub" && d.kind === "city")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [locale],
  );

  useEffect(() => {
    if (homeStation) setBaseLocation(homeStation);
  }, [homeStation]);

  useEffect(() => {
    if (user?.user_metadata) {
      setFullName(user.user_metadata.full_name || "");
      setUsername(user.user_metadata.username || "");
      setDefaultLocale(
        user.user_metadata.default_locale === "ja" ? "ja" : locale,
      );
      if (user.user_metadata.preferences) {
        setCarMode(user.user_metadata.preferences.carMode || "none");
        setPublicModes(
          user.user_metadata.preferences.publicModes || [
            "train",
            "shinkansen",
            "bus",
            "flight",
            "ferry",
          ],
        );
        setPartySize(user.user_metadata.preferences.partySize || 2);
        setBudget(user.user_metadata.preferences.budget || "standard");
      }
    }
  }, [user, locale]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await updateUserProfile({
        full_name: fullName.trim(),
        username: username.trim(),
        base_location: baseLocation,
        home_city: homeCityId,
        default_locale: defaultLocale,
        theme,
        preferences: {
          carMode,
          publicModes,
          partySize,
          budget,
          preferences_set: true,
        },
      });

      if (!error) {
        setLocale(defaultLocale);
        setSaveSuccess(true);
        setIsDirty(false);
        toast.success(t("ui.settingsSaved"));

        if (
          returnParam &&
          returnParam.startsWith("/") &&
          !returnParam.startsWith("//")
        ) {
          setTimeout(() => navigate(returnParam), 1000);
        } else {
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(t("ui.failedSave"));
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = <T,>(setter: (v: T) => void, value: T) => {
    setter(value);
    setIsDirty(true);
  };

  const togglePublicMode = (mode: string) => {
    setPublicModes((prev) => {
      const next = prev.includes(mode)
        ? prev.filter((m) => m !== mode)
        : [...prev, mode];
      setIsDirty(true);
      return next;
    });
  };

  const handleExportData = () => {
    const exportData = {
      app: "Meguruto",
      version: packageJson.version,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        username:
          user?.user_metadata?.username || user?.user_metadata?.full_name || "",
        email: user?.email || "",
        home_city: user?.user_metadata?.home_city || "",
      },
      preferences: {
        base_location: homeStation || baseLocation,
        carMode,
        publicModes,
        partySize,
        budget,
        theme,
      },
      visitedDestinations: visited,
      prefectures: visitedPrefectures,
      trips,
    };

    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "meguruto_travel_data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    toast.success(t("ui.dataExport"));
  };

  const sidebarSections = [
    { id: "account" as const, label: t("ui.account"), icon: UserRound },
    { id: "travel" as const, label: t("ui.travelPreferences"), icon: Car },
    {
      id: "appearance" as const,
      label: t("ui.appearance"),
      icon: Palette,
    },
    { id: "data" as const, label: t("ui.dataExport"), icon: Download },
  ];

  const btnBase =
    "p-2 sm:p-3 rounded-xl text-[11px] sm:text-xs font-bold border transition-all";

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 animate-in fade-in duration-200">
      <PageHeader
        title={t("ui.settingsTitle")}
        subtitle={t("ui.settingsSubtitle")}
        description={t("ui.settingsDescription")}
      />

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Sidebar — icon-only on mobile, active tab shows label */}
        <nav
          className="lg:col-span-3 w-full flex overflow-x-auto lg:flex-col gap-1.5 pb-2 lg:pb-0 scrollbar-none"
          role="tablist"
          aria-label="Settings sections"
        >
          {sidebarSections.map((sec) => {
            const isActive = activeSection === sec.id;
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={sec.label}
                onClick={() => setActiveSection(sec.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-white" : "text-emerald-500"}`}
                  aria-hidden="true"
                />
                <span className={isActive ? "" : "hidden sm:inline"}>
                  {sec.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Main Panel */}
        <div className="lg:col-span-9 w-full">
          <form
            onSubmit={handleSave}
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
          >
            {saveSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {t("ui.settingsSaved")}
              </div>
            )}

            {/* ── Account ── */}
            {activeSection === "account" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t("ui.account")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("ui.accountDescription")}
                  </p>
                </div>

                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                  {t("settings.fullName")}
                  <input
                    value={fullName}
                    onChange={(e) =>
                      handleFieldChange(setFullName, e.target.value)
                    }
                    placeholder={t("settings.fullNamePlaceholder")}
                    className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white"
                  />
                </label>
                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                  {t("settings.username")}
                  <input
                    value={username}
                    onChange={(e) =>
                      handleFieldChange(setUsername, e.target.value)
                    }
                    placeholder={t("settings.usernamePlaceholder")}
                    className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white"
                  />
                </label>
                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                  {t("ui.chooseCity")}
                  <SearchableDestinationPicker
                    value={homeCityId}
                    onSelect={(d) => {
                      handleFieldChange(setHomeCityId, d.id);
                    }}
                    placeholder={t("ui.chooseCity")}
                    locale={locale}
                    destinations={cityHubs}
                    savedDestinations={[]}
                    recentDestinations={[]}
                    className="mt-2"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {t("settings.homeCityHelp")}
                  </p>
                </label>

                {/* Base location — flattened, no nested card */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                    {t("ui.baseLocation")}
                  </label>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                    {t("settings.baseLocationHelp")}
                  </p>
                  <StationInput embedded={true} />
                </div>
              </div>
            )}

            {/* ── Travel Preferences ── */}
            {activeSection === "travel" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t("ui.travelPreferences")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.travelDescription")}
                  </p>
                </div>

                <div className="space-y-5">
                  {/* Budget */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                      {t("home.budget")}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {BUDGET_PRESETS.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => handleFieldChange(setBudget, b.id)}
                          className={`${btnBase} text-center ${
                            budget === b.id
                              ? "bg-emerald-500 text-white border-emerald-500"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {t(b.key)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Primary transport */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                      {t("settings.primaryTransport")}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        {
                          id: "none",
                          label: t("home.transportOptions.public"),
                        },
                        {
                          id: "rental",
                          label: t("home.transportOptions.rentalCar"),
                        },
                        {
                          id: "own",
                          label: t("home.transportOptions.myCar"),
                        },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleFieldChange(setCarMode, m.id)}
                          className={`${btnBase} text-center ${
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

                  {/* Public transport modes */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                      {t("settings.publicTransportModes")}
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                      {ALL_MODES.map((tm) => (
                        <button
                          key={tm.id}
                          type="button"
                          onClick={() => togglePublicMode(tm.id)}
                          className={`${btnBase} text-center ${
                            publicModes.includes(tm.id)
                              ? "bg-emerald-500 text-white border-emerald-500"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {t(tm.key)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Party size */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                      {t("home.party")}:{" "}
                      {t("home.people_other", { count: partySize })}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={partySize}
                      onChange={(e) =>
                        handleFieldChange(
                          setPartySize,
                          parseInt(e.target.value),
                        )
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  {/* Personalization */}
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-4">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {t("recommendation.personalization.title")}
                    </h4>

                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {t("recommendation.personalization.enableLabel")}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t("recommendation.personalization.enableHelp")}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={personalizationService.getSettings().enabled}
                        onChange={(e) => {
                          personalizationService.updateSettings({
                            enabled: e.target.checked,
                          });
                        }}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                        {t("recommendation.personalization.noveltyLabel")}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          {
                            id: "BALANCED",
                            label: t(
                              "recommendation.personalization.noveltyBalanced",
                            ),
                          },
                          {
                            id: "NOVEL",
                            label: t(
                              "recommendation.personalization.noveltyNovel",
                            ),
                          },
                          {
                            id: "FAMILIAR",
                            label: t(
                              "recommendation.personalization.noveltyFamiliar",
                            ),
                          },
                        ].map((nov) => (
                          <button
                            key={nov.id}
                            type="button"
                            onClick={() => {
                              personalizationService.updateSettings({
                                novelty: nov.id as any,
                              });
                            }}
                            className={`${btnBase} text-center ${
                              personalizationService.getSettings().novelty ===
                              nov.id
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {nov.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {t("settings.recommendationAnalytics")}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t("settings.recommendationAnalyticsHelp")}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={!recommendationAnalytics.getOptOut()}
                        onChange={(e) => {
                          recommendationAnalytics.setOptOut(!e.target.checked);
                        }}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                    </div>

                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (
                            window.confirm(
                              t("recommendation.personalization.resetConfirm"),
                            )
                          ) {
                            personalizationService.resetSettings();
                            toast.success(
                              t("recommendation.personalization.resetAction"),
                            );
                          }
                        }}
                        className="text-xs text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-bold"
                      >
                        {t("recommendation.personalization.resetAction")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Appearance & Language ── */}
            {activeSection === "appearance" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t("ui.appearance")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.appearanceHelp")}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                    {t("settings.theme")}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "system", label: t("settings.themeSystem") },
                      { id: "light", label: t("settings.themeLight") },
                      { id: "dark", label: t("settings.themeDark") },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTheme(opt.id as any)}
                        className={`${btnBase} text-center ${
                          theme === opt.id
                            ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">
                    {t("ui.defaultLanguage")}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "en", label: t("settings.languageEn") },
                      { id: "ja", label: t("settings.languageJa") },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={async () => {
                          const next = opt.id as "en" | "ja";
                          setDefaultLocale(next);
                          setLocale(next);
                          await updateUserProfile({
                            default_locale: next,
                          });
                          toast.success(
                            next === "ja"
                              ? t("settings.languageChangedJa")
                              : t("settings.languageChangedEn"),
                          );
                        }}
                        className={`${btnBase} text-center ${
                          defaultLocale === opt.id
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Data ── */}
            {activeSection === "data" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t("ui.dataExport")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.dataHelp")}
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("settings.dataDescription")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExportData}
                    className="rounded-xl text-xs font-bold flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />{" "}
                    {t("settings.exportButton")}
                  </Button>
                </div>
              </div>
            )}

            {/* Save — hidden for appearance (immediate) and data (export-only) */}
            {activeSection !== "data" && activeSection !== "appearance" && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex justify-end">
                <Button
                  type="submit"
                  disabled={loading || !isDirty}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t("ui.save")}
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
