import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTheme } from "@/shared/context/ThemeContext";
import { useTripStore } from "@/shared/hooks/useTripStore";
import StationInput from "@/shared/components/StationInput";
import {
  MapPin,
  Car,
  Sun,
  Eye,
  Download,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { toast } from "sonner";

type SettingsSection =
  "general" | "travel" | "appearance" | "accessibility" | "data";

export default function Settings() {
  const { user, updateUserProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { homeStation, setHomeStation, visited, visitedPrefectures, trips } =
    useTripStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sectionParam = searchParams.get("section") as SettingsSection | null;
  const returnParam = searchParams.get("return");

  const [activeSection, setActiveSection] = useState<SettingsSection>(
    sectionParam || "general",
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
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (homeStation) setBaseLocation(homeStation);
  }, [homeStation]);

  useEffect(() => {
    if (user?.user_metadata) {
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
      }
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const locationChanged = baseLocation !== homeStation;
      if (locationChanged) {
        setHomeStation(baseLocation);
      }

      const { error } = await updateUserProfile({
        base_location: baseLocation,
        theme,
        preferences: {
          carMode,
          publicModes,
          partySize,
          preferences_set: true,
        },
      });

      if (!error) {
        setSaveSuccess(true);
        if (locationChanged) {
          toast.success(
            `Base Location updated to ${baseLocation}. Recommendations refreshed.`,
          );
        } else {
          const sectionToasts: Record<SettingsSection, string> = {
            general: "General settings updated successfully!",
            travel: "Travel preferences updated successfully!",
            appearance: "Appearance & theme updated successfully!",
            accessibility: "Accessibility options updated successfully!",
            data: "Data settings updated successfully!",
          };
          toast.success(
            sectionToasts[activeSection] || "Settings saved successfully!",
          );
        }

        // Safe return flow: validate internal relative URL
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
      toast.error("Failed to save settings");
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
      app: "TabiMap",
      version: "1.5.2",
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
    downloadAnchor.setAttribute("download", "tabimap_travel_data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    toast.success("Travel data backup exported successfully");
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl space-y-8 animate-in fade-in duration-200">
      <PageHeader
        title="Settings & Preferences"
        subtitle="Application Configuration"
        description="Customize your Base Location, travel preferences, transit defaults, and UI accessibility."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Settings Navigation Sidebar */}
        <div className="lg:col-span-3 flex overflow-x-auto lg:flex-col gap-2 pb-2 lg:pb-0 scrollbar-none">
          {[
            { id: "general", label: "General & Base Location", icon: MapPin },
            { id: "travel", label: "Travel Preferences", icon: Car },
            { id: "appearance", label: "Appearance", icon: Sun },
            { id: "accessibility", label: "Accessibility", icon: Eye },
            { id: "data", label: "Data & Export", icon: Download },
          ].map((sec) => {
            const isActive = activeSection === sec.id;
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id as SettingsSection)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 text-left ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20 ring-2 ring-emerald-500/30"
                    : "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-emerald-500"}`}
                />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Settings Form Panel */}
        <div className="lg:col-span-9">
          <form
            onSubmit={handleSave}
            className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6"
          >
            {saveSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Settings updated
                successfully!
              </div>
            )}

            {/* Section 1: General & Base Location */}
            {activeSection === "general" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    General & Base Location
                  </h3>
                  <p className="text-xs text-slate-500">
                    Set your home starting point for travel duration estimates
                    and regional route calculations.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Base Location (Home Station / Prefecture)
                    </label>

                    {/* Reusable StationInput Component */}
                    <StationInput embedded={true} />

                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>
                        Base location changes save automatically upon selection.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: Travel Preferences */}
            {activeSection === "travel" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Travel & Transit Preferences
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure default transit modes and party size for trip
                    generation.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                      Car Mode Preference
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: "none", label: "Transit Only" },
                        { id: "rental", label: "Rental Car" },
                        { id: "own", label: "Personal Car" },
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

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                      Public Transport Modes
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { id: "train", label: "Train / Subway" },
                        { id: "shinkansen", label: "Shinkansen" },
                        { id: "bus", label: "Local Bus" },
                        { id: "flight", label: "Domestic Flight" },
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

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                      Default Travel Party Size: {partySize} person
                      {partySize > 1 ? "s" : ""}
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
                </div>
              </div>
            )}

            {/* Section 3: Appearance */}
            {activeSection === "appearance" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Appearance & Theme
                  </h3>
                  <p className="text-xs text-slate-500">
                    Customize interface visual theme. ThemeProvider applies
                    changes instantly.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { id: "system", label: "System Default" },
                    { id: "light", label: "Light Mode" },
                    { id: "dark", label: "Dark Mode" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id as any)}
                      className={`p-4 rounded-2xl text-xs font-bold border transition-all text-center ${
                        theme === t.id
                          ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Section 4: Accessibility */}
            {activeSection === "accessibility" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Accessibility Options
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure motion and visual contrast preferences.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Reduced Motion
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Minimize animations and UI transition effects
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={reducedMotion}
                    onChange={(e) => setReducedMotion(e.target.checked)}
                    className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Section 5: Data & Export */}
            {activeSection === "data" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Data & Export Controls
                  </h3>
                  <p className="text-xs text-slate-500">
                    Manage your stored travel history data.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 space-y-3">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Export Travel History (JSON Backup)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Download a full JSON backup of your profile details, visited
                    places, prefectures, and saved trips (`schemaVersion: 1`).
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

            {activeSection !== "data" && activeSection !== "general" && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Settings
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
