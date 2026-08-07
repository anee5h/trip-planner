import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTheme } from "@/shared/context/ThemeContext";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTripStore } from "@/shared/hooks/useTripStore";
import StationInput from "@/shared/components/StationInput";
import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import { getLocalizedPlace } from "@/shared/services/place/PlaceCatalog";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import {
  UserRound,
  Settings2,
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
import packageJson from "@/../package.json";

type SettingsSection = "account" | "general" | "travel" | "appearance" | "data";

const BUDGET_PRESETS = [
  { id: "economy", key: "home.budgets.economy" },
  { id: "standard", key: "home.budgets.standard" },
  { id: "comfortable", key: "home.budgets.comfortable" },
  { id: "luxury", key: "home.budgets.luxury" },
] as const;

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

  // Settings State
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
        .filter(
          (destination) =>
            destination.role === "hub" && destination.kind === "city",
        )
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

  const togglePublicMode = (mode: string) => {
    setPublicModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
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
    { id: "account", label: t("ui.account"), icon: UserRound },
    { id: "general", label: t("ui.general"), icon: Settings2 },
    { id: "travel", label: t("ui.travelPreferences"), icon: Car },
    { id: "appearance", label: t("ui.appearance"), icon: Palette },
    { id: "data", label: t("ui.dataExport"), icon: Download },
  ] as const;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 animate-in fade-in duration-200">
      <PageHeader
        title={t("ui.settingsTitle")}
        subtitle={t("ui.settingsSubtitle")}
        description={t("ui.settingsDescription")}
      />

      {/* Mobile: stacked sections with accordion feel. Desktop: sidebar + panel */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Sidebar – horizontal scroll on mobile, vertical on desktop */}
        <nav className="lg:col-span-3 w-full flex overflow-x-auto lg:flex-col gap-2 pb-2 lg:pb-0 scrollbar-none">
          {sidebarSections.map((sec) => {
            const isActive = activeSection === sec.id;
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-emerald-500"}`}
                />
                <span className="hidden sm:inline">{sec.label}</span>
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
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t("ui.account")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("ui.accountDescription")}
                  </p>
                </div>
                <div className="space-y-4">
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    {t("auth.signUpTitle")}
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder={t("auth.signUpPrompt")}
                      className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white"
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    Username
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="@username"
                      className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white"
                    />
                  </label>
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    {t("ui.chooseCity")}
                    <select
                      value={homeCityId}
                      onChange={(event) => setHomeCityId(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white"
                    >
                      <option value="">{t("ui.chooseCity")}</option>
                      {cityHubs.map((city) => (
                        <option key={city.id} value={city.id}>
                          {formatPlaceName(
                            getLocalizedPlace(city, locale),
                            locale,
                          )}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-bold uppercase text-slate-500">
                    {t("ui.defaultLanguage")}
                    <select
                      value={defaultLocale}
                      onChange={(event) =>
                        setDefaultLocale(event.target.value as "en" | "ja")
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white"
                    >
                      <option value="en">English</option>
                      <option value="ja">日本語</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {/* ── General ── */}
            {activeSection === "general" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t("ui.general")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("ui.baseLocation")}
                  </p>
                </div>
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      {t("ui.baseLocation")}
                    </label>
                    <StationInput embedded={true} />
                  </div>
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
                  <p className="text-xs text-slate-500">
                    {t("home.transport")}
                  </p>
                </div>

                <div className="space-y-5 pt-2">
                  {/* Budget */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                      {t("home.budget")}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {BUDGET_PRESETS.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBudget(b.id)}
                          className={`p-3 rounded-2xl text-xs font-bold border transition-all ${
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

                  {/* Car mode */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                      {t("home.transportModes.car")}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {
                          id: "none",
                          label: t("home.transportOptions.public"),
                        },
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
                          className={`p-3 rounded-2xl text-xs font-bold border transition-all ${
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
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                      {t("home.transport")}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: "train", label: t("home.transportModes.train") },
                        {
                          id: "shinkansen",
                          label: t("home.transportModes.shinkansen"),
                        },
                        { id: "bus", label: t("home.transportModes.bus") },
                        {
                          id: "flight",
                          label: t("home.transportModes.flight"),
                        },
                      ].map((tm) => (
                        <button
                          key={tm.id}
                          type="button"
                          onClick={() => togglePublicMode(tm.id)}
                          className={`p-3 rounded-2xl text-xs font-bold border transition-all ${
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

                  {/* Party size */}
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

                  {/* Personalization */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {t("recommendation.personalization.title")}
                    </h4>

                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {t("recommendation.personalization.enableLabel")}
                        </div>
                        <div className="text-[11px] text-slate-500">
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
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                        {t("recommendation.personalization.noveltyLabel")}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
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
                            className={`p-3 rounded-2xl text-xs font-bold border transition-all ${
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
                          {t("recommendation.feedback.optOutLabel")}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {t("recommendation.feedback.optOutLabel")}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={recommendationAnalytics.getOptOut()}
                        onChange={(e) => {
                          recommendationAnalytics.setOptOut(e.target.checked);
                        }}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                    </div>

                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          personalizationService.resetSettings();
                          toast.success(
                            t("recommendation.personalization.resetAction"),
                          );
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

            {/* ── Appearance ── */}
            {activeSection === "appearance" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t("ui.appearance")}
                  </h3>
                  <p className="text-xs text-slate-500">{t("ui.appearance")}</p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { id: "system", label: "System" },
                    { id: "light", label: "Light" },
                    { id: "dark", label: "Dark" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTheme(opt.id as any)}
                      className={`p-4 rounded-2xl text-xs font-bold border transition-all text-center ${
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
            )}

            {/* ── Data ── */}
            {activeSection === "data" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {t("ui.dataExport")}
                  </h3>
                  <p className="text-xs text-slate-500">{t("ui.dataExport")}</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Export Travel History (JSON Backup)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Download a full JSON backup of your profile details, visited
                    places, prefectures, and saved trips.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExportData}
                    className="rounded-xl text-xs font-bold flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Data (JSON)
                  </Button>
                </div>
              </div>
            )}

            {activeSection !== "data" && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <Button
                  type="submit"
                  disabled={loading}
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
