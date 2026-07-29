import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Search,
  Utensils,
  Trees,
  Palette,
  Camera,
  Sun,
  CloudRain,
  ThermometerSun,
  Navigation,
  Waves,
  Landmark,
  Snowflake,
  Calendar,
  Dices,
  MapPin,
} from "lucide-react";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/components/ui/select";
import { Slider } from "@/shared/components/ui/slider";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { getTabWeatherSummary } from "@/shared/services/weather/WeatherTabService";
import RouletteModal from "@/features/home/components/RouletteModal";

import { useTripPlannerState } from "@/features/home/hooks/useTripPlannerState";
import { useWeatherContext } from "@/features/home/hooks/useWeatherContext";
import { useTripRecommendations } from "@/features/home/hooks/useTripRecommendations";
import {
  budgetTierForLimit,
  partyProfileForSize,
} from "@/shared/types/planner";
import { serializePlannerSearchParams } from "@/features/destinations/destinationSearchParams";

export default function Home() {
  const allDestinations = getDestinationList() as Destination[];

  const { isVisited, homeStationCoords, homeStation } = useTripStore();
  const { user } = useAuth();

  const {
    tripType,
    setTripType,
    budget,
    setBudget,
    carMode,
    publicModes,
    partySize,
    setPartySize,
    weather,
    setWeather,
    budgetTier,
    tripDuration,
  } = useTripPlannerState(user);

  const {
    weatherContext,
    setWeatherContext,
    activeTabId,
    setActiveTabId,
    customDate,
    setCustomDate,
    currentTab,
    handleCustomDateSelect,
  } = useWeatherContext(homeStationCoords);

  const currentSituation = useMemo(() => {
    if (!weatherContext || !currentTab) return null;
    return getTabWeatherSummary(currentTab, weatherContext.forecastMap);
  }, [weatherContext, currentTab]);

  const { recommendedDestinations, rouletteCandidates } =
    useTripRecommendations({
      allDestinations,
      actualWeather: currentSituation
        ? { desc: currentSituation.desc, temperatureC: currentSituation.temp }
        : undefined,
      preferredWeather: weather,
      vibe: tripType,
      budget,
      carMode,
      publicModes,
      partySize,
      budgetTier,
      tripDuration,
      homeStationCoords,
      isVisited,
    });

  const [rouletteOpen, setRouletteOpen] = useState(false);

  const topRecommendations = recommendedDestinations.slice(0, 3);
  const plannerSearch = serializePlannerSearchParams({
    vibe: tripType,
    weather,
    partyProfile: partyProfileForSize(partySize),
    partySize,
    budgetTier: budgetTierForLimit(budget),
    tripDuration,
    budget,
    carMode,
    publicModes,
  });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero & Planner Section */}
      <section className="relative pt-8 pb-12 sm:pt-12 lg:pt-16 lg:pb-20 overflow-hidden bg-slate-50 dark:bg-slate-950">
        <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/50 [mask-image:linear-gradient(0deg,transparent,black)] -z-10" />
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Contextual Hero */}
            <div className="flex flex-col items-start text-left w-full">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200 mb-6">
                <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Base Location: {homeStation || "Tokyo Station"}</span>
                <Link
                  to="/settings?section=general&return=/"
                  className="ml-1 text-emerald-600 dark:text-emerald-400 hover:underline font-extrabold"
                >
                  Change
                </Link>
              </div>
              {currentSituation ? (
                <div className="mb-10 w-full">
                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    {weatherContext?.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          if (weatherContext && !tab.isCustom) {
                            const cleanTabs = weatherContext.tabs.filter(
                              (t) => !t.isCustom,
                            );
                            setWeatherContext({
                              ...weatherContext,
                              tabs: cleanTabs,
                            });
                            setCustomDate(null);
                          }
                          setActiveTabId(tab.id);
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold h-9 flex items-center transition-all focus:outline-none ${
                          activeTabId === tab.id
                            ? "bg-emerald-600 text-white shadow-md"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}

                    {/* Custom Date Picker (Bounded to Open-Meteo 10-day forecast) */}
                    {weatherContext && (
                      <div className="relative inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-1.5 h-9 text-xs font-semibold text-slate-600 dark:text-slate-300 shadow-sm hover:border-emerald-500 transition-colors">
                        <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <input
                          type="date"
                          min={weatherContext.minDate}
                          max={weatherContext.maxDate}
                          value={customDate || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              setCustomDate(val);
                              handleCustomDateSelect(val);
                            }
                          }}
                          className="bg-transparent border-none p-0 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                          title="Pick custom forecast date"
                        />
                      </div>
                    )}
                  </div>

                  <p className="text-slate-500 dark:text-slate-400 font-bold mb-2 tracking-widest uppercase text-xs">
                    {currentSituation.dateLabel}
                  </p>
                  <div className="flex items-center text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-4">
                    <span>{currentSituation.temp}°C</span>
                    <span className="mx-4 text-slate-200 dark:text-slate-800">
                      |
                    </span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">
                      {currentSituation.desc} in your area
                    </span>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100 mt-6 leading-tight">
                    Based on{" "}
                    {currentTab?.label.toLowerCase() === "today"
                      ? "today's"
                      : currentTab?.label.toLowerCase() === "tomorrow"
                        ? "tomorrow's"
                        : `${currentTab?.label.toLowerCase() || "upcoming"}`}{" "}
                    conditions,
                    <br />
                    you should go to...
                  </h1>
                </div>
              ) : (
                <div className="h-40 animate-pulse bg-slate-200 dark:bg-slate-800 rounded-2xl w-full max-w-lg mb-10" />
              )}

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-14 px-6 text-base font-bold rounded-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-xl"
                  onClick={() =>
                    document
                      .getElementById("recommendations")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Reveal Top Match
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  aria-label="Open destination roulette wheel"
                  onClick={() => setRouletteOpen(true)}
                  className="w-full sm:w-auto h-14 px-6 text-base font-bold rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                >
                  <Dices className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
                  Surprise Me 🎲
                </Button>
                <Link
                  to={`/destinations?${plannerSearch}`}
                  className="w-full sm:w-auto"
                >
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-14 px-6 text-base font-bold rounded-full bg-white/50 backdrop-blur-sm dark:bg-slate-900/50 border-slate-300 hover:bg-slate-100"
                  >
                    Browse All
                  </Button>
                </Link>
              </div>
            </div>

            <RouletteModal
              isOpen={rouletteOpen}
              onClose={() => setRouletteOpen(false)}
              candidates={rouletteCandidates as Destination[]}
              partySize={partySize}
              carMode={carMode}
              publicModes={publicModes}
            />

            {/* Smart Planner Card */}
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 relative">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
                  <Navigation className="w-6 h-6 mr-2 text-emerald-500" />
                  Trip Planner
                </h3>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Find your match in 30s
                </span>
              </div>

              <div className="space-y-6">
                {/* Trip Type */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    What's the vibe?
                  </label>
                  <Select
                    value={tripType}
                    onValueChange={(val: string | null) => {
                      if (val) setTripType(val);
                    }}
                  >
                    <SelectTrigger className="h-14 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-colors rounded-xl font-medium text-base">
                      {tripType === "any" && (
                        <div className="flex items-center">
                          <Sparkles className="w-5 h-5 mr-3 text-slate-400" />{" "}
                          Anything goes
                        </div>
                      )}
                      {tripType === "themepark" && (
                        <div className="flex items-center">
                          <Sparkles className="w-5 h-5 mr-3 text-pink-500" />{" "}
                          Theme Parks
                        </div>
                      )}
                      {tripType === "sea" && (
                        <div className="flex items-center">
                          <Waves className="w-5 h-5 mr-3 text-blue-500" /> Sea
                          Escape
                        </div>
                      )}
                      {tripType === "history" && (
                        <div className="flex items-center">
                          <Landmark className="w-5 h-5 mr-3 text-amber-700" />{" "}
                          History & Culture
                        </div>
                      )}
                      {tripType === "art" && (
                        <div className="flex items-center">
                          <Palette className="w-5 h-5 mr-3 text-purple-500" />{" "}
                          Art & Museums
                        </div>
                      )}
                      {tripType === "food" && (
                        <div className="flex items-center">
                          <Utensils className="w-5 h-5 mr-3 text-orange-500" />{" "}
                          Food & Eating
                        </div>
                      )}
                      {tripType === "nature" && (
                        <div className="flex items-center">
                          <Trees className="w-5 h-5 mr-3 text-emerald-500" />{" "}
                          Nature & Outdoors
                        </div>
                      )}
                      {tripType === "cool" && (
                        <div className="flex items-center">
                          <Snowflake className="w-5 h-5 mr-3 text-sky-400" />{" "}
                          Cool Escape
                        </div>
                      )}
                      {tripType === "photography" && (
                        <div className="flex items-center">
                          <Camera className="w-5 h-5 mr-3 text-rose-400" />{" "}
                          Photography
                        </div>
                      )}
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
                      <SelectItem
                        value="any"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Sparkles className="w-5 h-5 mr-3 text-slate-400" />{" "}
                          <span className="text-base font-medium">
                            Anything goes
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="themepark"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Sparkles className="w-5 h-5 mr-3 text-pink-500" />{" "}
                          <span className="text-base font-medium">
                            Theme Parks
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="sea"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Waves className="w-5 h-5 mr-3 text-blue-500" />{" "}
                          <span className="text-base font-medium">
                            Sea Escape
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="history"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Landmark className="w-5 h-5 mr-3 text-amber-700" />{" "}
                          <span className="text-base font-medium">
                            History & Culture
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="art"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Palette className="w-5 h-5 mr-3 text-purple-500" />{" "}
                          <span className="text-base font-medium">
                            Art & Museums
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="food"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Utensils className="w-5 h-5 mr-3 text-orange-500" />{" "}
                          <span className="text-base font-medium">
                            Food & Eating
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="nature"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Trees className="w-5 h-5 mr-3 text-emerald-500" />{" "}
                          <span className="text-base font-medium">
                            Nature & Outdoors
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="cool"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Snowflake className="w-5 h-5 mr-3 text-sky-400" />{" "}
                          <span className="text-base font-medium">
                            Cool Escape
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="photography"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Camera className="w-5 h-5 mr-3 text-rose-400" />{" "}
                          <span className="text-base font-medium">
                            Photography
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Weather */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Weather condition?
                  </label>
                  <Select
                    value={weather}
                    onValueChange={(val: string | null) => {
                      if (
                        val === "any" ||
                        val === "rainy" ||
                        val === "hot" ||
                        val === "cold"
                      )
                        setWeather(val);
                    }}
                  >
                    <SelectTrigger className="h-14 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-colors rounded-xl font-medium text-base">
                      {weather === "any" && (
                        <div className="flex items-center">
                          <Sun className="w-5 h-5 mr-3 text-amber-500" />{" "}
                          Perfect Weather
                        </div>
                      )}
                      {weather === "rainy" && (
                        <div className="flex items-center">
                          <CloudRain className="w-5 h-5 mr-3 text-blue-500" />{" "}
                          Looks like Rain
                        </div>
                      )}
                      {weather === "hot" && (
                        <div className="flex items-center">
                          <ThermometerSun className="w-5 h-5 mr-3 text-red-500" />{" "}
                          Scorching Hot
                        </div>
                      )}
                      {weather === "cold" && (
                        <div className="flex items-center">
                          <Snowflake className="w-5 h-5 mr-3 text-sky-400" />{" "}
                          Freezing Cold
                        </div>
                      )}
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950 p-1">
                      <SelectItem
                        value="any"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Sun className="w-5 h-5 mr-3 text-amber-500" />{" "}
                          <span className="text-base font-medium">
                            Perfect Weather
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="rainy"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <CloudRain className="w-5 h-5 mr-3 text-blue-500" />{" "}
                          <span className="text-base font-medium">
                            Looks like Rain
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="hot"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <ThermometerSun className="w-5 h-5 mr-3 text-red-500" />{" "}
                          <span className="text-base font-medium">
                            Scorching Hot
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="cold"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Snowflake className="w-5 h-5 mr-3 text-sky-400" />{" "}
                          <span className="text-base font-medium">
                            Freezing Cold
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      Travel party
                    </label>
                    <span className="rounded-md bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                      {partySize} {partySize === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <Slider
                    value={[partySize]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={(value: number | readonly number[]) =>
                      setPartySize(Array.isArray(value) ? value[0] : value)
                    }
                    className="w-full"
                  />
                </div>

                {/* Budget */}
                <div className="space-y-4 pt-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      Max Budget (couple)
                    </label>
                    <span className="text-sm font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-2 py-1 rounded-md">
                      ¥{budget.toLocaleString()}
                    </span>
                  </div>
                  <Slider
                    value={[budget]}
                    max={100000}
                    step={5000}
                    onValueChange={(val: number | readonly number[]) =>
                      setBudget(Array.isArray(val) ? val[0] : val)
                    }
                    className="w-full"
                  />
                </div>

                <Button
                  className="w-full h-12 mt-4 text-base font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  onClick={() => {
                    document
                      .getElementById("recommendations")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <Search className="w-5 h-5 mr-2" />
                  Find My Match
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Top Recommendations */}
      <section
        id="recommendations"
        className="py-20 bg-white dark:bg-background"
      >
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">
                Your Top Matches
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                Ranked by our algorithm based on your preferences.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {topRecommendations.map((dest: any, index: number) => (
              <div key={dest.id} className="flex flex-col h-full">
                <div className="flex-grow">
                  <DestinationCard
                    destination={dest as Destination}
                    rank={index + 1}
                    partySize={partySize}
                    carMode={carMode}
                    publicModes={publicModes}
                    activeTransportMode={
                      (dest as any).bestTransportMode || "train"
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
