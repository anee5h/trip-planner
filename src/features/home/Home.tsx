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
import { useLocale } from "@/shared/context/LocaleContext";

const HOME_COPY = {
  en: {
    baseLocation: "Base Location",
    change: "Change",
    pickDate: "Pick custom forecast date",
    inYourArea: "in your area",
    reveal: "Reveal Top Match",
    surprise: "Surprise Me 🎲",
    browse: "Browse All",
    planner: "Trip Planner",
    quickMatch: "Find your match in 30s",
    vibe: "What's the vibe?",
    weather: "Weather condition?",
    budget: "Max Budget (couple)",
    findMatch: "Find My Match",
    topMatches: "Your Top Matches",
    ranked: "Ranked by our algorithm based on your preferences.",
  },
  ja: {
    baseLocation: "出発地",
    change: "変更",
    pickDate: "予報日を選択",
    inYourArea: "現在地周辺",
    reveal: "おすすめを見る",
    surprise: "おまかせ 🎲",
    browse: "すべて見る",
    planner: "旅のプランナー",
    quickMatch: "30秒でぴったりの旅先を提案",
    vibe: "どんな気分ですか？",
    weather: "天気は？",
    budget: "予算上限（2人）",
    findMatch: "おすすめを探す",
    topMatches: "あなたへのおすすめ",
    ranked: "好みと条件に合わせておすすめ順に表示しています。",
  },
} as const;

const TRIP_LABELS = {
  en: {
    any: "Anything goes",
    themepark: "Theme Parks",
    sea: "Sea Escape",
    history: "History & Culture",
    art: "Art & Museums",
    food: "Food & Eating",
    nature: "Nature & Outdoors",
    cool: "Cool Escape",
    photography: "Photography",
    anyWeather: "Perfect Weather",
    rainy: "Looks like Rain",
    summer: "Scorching Hot",
    winter: "Freezing Cold",
  },
  ja: {
    any: "なんでも",
    themepark: "テーマパーク",
    sea: "海へ",
    history: "歴史・文化",
    art: "アート・美術館",
    food: "グルメ",
    nature: "自然・アウトドア",
    cool: "涼しい場所",
    photography: "写真旅",
    anyWeather: "晴れ・快適",
    rainy: "雨の日",
    summer: "暑い日",
    winter: "寒い日",
  },
} as const;

function localizeWeatherText(text: string, locale: "en" | "ja") {
  if (locale === "en") return text;
  const translations: Record<string, string> = {
    Sunny: "晴れ",
    "Partly cloudy": "晴れ時々くもり",
    Cloudy: "くもり",
    Rainy: "雨",
    Rain: "雨",
    Thunderstorm: "雷雨",
    Snow: "雪",
    Fog: "霧",
    Today: "今日",
    Tomorrow: "明日",
    "This Weekend": "今週末",
    Sunday: "日曜日",
  };
  return translations[text] || text;
}

export default function Home() {
  const { locale } = useLocale();
  const copy = HOME_COPY[locale];
  const labels = TRIP_LABELS[locale];
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
    weather,
    setWeather,
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
      currentTab: currentTab || undefined,
      weatherContextMap: weatherContext?.forecastMap
        ? (new Map(
            Array.from(weatherContext.forecastMap.entries()).map(([k, v]) => [
              k,
              { desc: v.desc, icon: v.icon },
            ]),
          ) as Map<string, { desc: string; icon: string }>)
        : undefined,
      tripType,
      budget,
      carMode,
      publicModes,
      partySize,
      weather,
      homeStationCoords,
      isVisited,
    });

  const [rouletteOpen, setRouletteOpen] = useState(false);

  const topRecommendations = recommendedDestinations.slice(0, 3);

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
                <span>
                  {copy.baseLocation}:{" "}
                  {homeStation ||
                    (locale === "ja" ? "東京駅" : "Tokyo Station")}
                </span>
                <Link
                  to="/settings?section=general&return=/"
                  className="ml-1 text-emerald-600 dark:text-emerald-400 hover:underline font-extrabold"
                >
                  {copy.change}
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
                        {localizeWeatherText(tab.label, locale)}
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
                          title={copy.pickDate}
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
                      {localizeWeatherText(currentSituation.desc, locale)}{" "}
                      {copy.inYourArea}
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
                  {copy.reveal}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  aria-label="Open destination roulette wheel"
                  onClick={() => setRouletteOpen(true)}
                  className="w-full sm:w-auto h-14 px-6 text-base font-bold rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                >
                  <Dices className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
                  {copy.surprise}
                </Button>
                <Link to="/destinations" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full h-14 px-6 text-base font-bold rounded-full bg-white/50 backdrop-blur-sm dark:bg-slate-900/50 border-slate-300 hover:bg-slate-100"
                  >
                    {copy.browse}
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
                  {copy.planner}
                </h3>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                  {copy.quickMatch}
                </span>
              </div>

              <div className="space-y-6">
                {/* Trip Type */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {copy.vibe}
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
                          {labels.any}
                        </div>
                      )}
                      {tripType === "themepark" && (
                        <div className="flex items-center">
                          <Sparkles className="w-5 h-5 mr-3 text-pink-500" />{" "}
                          {labels.themepark}
                        </div>
                      )}
                      {tripType === "sea" && (
                        <div className="flex items-center">
                          <Waves className="w-5 h-5 mr-3 text-blue-500" />{" "}
                          {labels.sea}
                        </div>
                      )}
                      {tripType === "history" && (
                        <div className="flex items-center">
                          <Landmark className="w-5 h-5 mr-3 text-amber-700" />{" "}
                          {labels.history}
                        </div>
                      )}
                      {tripType === "art" && (
                        <div className="flex items-center">
                          <Palette className="w-5 h-5 mr-3 text-purple-500" />{" "}
                          {labels.art}
                        </div>
                      )}
                      {tripType === "food" && (
                        <div className="flex items-center">
                          <Utensils className="w-5 h-5 mr-3 text-orange-500" />{" "}
                          {labels.food}
                        </div>
                      )}
                      {tripType === "nature" && (
                        <div className="flex items-center">
                          <Trees className="w-5 h-5 mr-3 text-emerald-500" />{" "}
                          {labels.nature}
                        </div>
                      )}
                      {tripType === "cool" && (
                        <div className="flex items-center">
                          <Snowflake className="w-5 h-5 mr-3 text-sky-400" />{" "}
                          {labels.cool}
                        </div>
                      )}
                      {tripType === "photography" && (
                        <div className="flex items-center">
                          <Camera className="w-5 h-5 mr-3 text-rose-400" />{" "}
                          {labels.photography}
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
                            {labels.any}
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
                            {labels.themepark}
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
                            {labels.sea}
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
                            {labels.history}
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
                            {labels.art}
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
                            {labels.food}
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
                            {labels.nature}
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
                            {labels.cool}
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
                            {labels.photography}
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Weather */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {copy.weather}
                  </label>
                  <Select
                    value={weather}
                    onValueChange={(val: string | null) => {
                      if (val) setWeather(val);
                    }}
                  >
                    <SelectTrigger className="h-14 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-colors rounded-xl font-medium text-base">
                      {weather === "any" && (
                        <div className="flex items-center">
                          <Sun className="w-5 h-5 mr-3 text-amber-500" />{" "}
                          {labels.anyWeather}
                        </div>
                      )}
                      {weather === "rainy" && (
                        <div className="flex items-center">
                          <CloudRain className="w-5 h-5 mr-3 text-blue-500" />{" "}
                          {labels.rainy}
                        </div>
                      )}
                      {weather === "summer" && (
                        <div className="flex items-center">
                          <ThermometerSun className="w-5 h-5 mr-3 text-red-500" />{" "}
                          {labels.summer}
                        </div>
                      )}
                      {weather === "winter" && (
                        <div className="flex items-center">
                          <Snowflake className="w-5 h-5 mr-3 text-sky-400" />{" "}
                          {labels.winter}
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
                            {labels.anyWeather}
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
                            {labels.rainy}
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="summer"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <ThermometerSun className="w-5 h-5 mr-3 text-red-500" />{" "}
                          <span className="text-base font-medium">
                            {labels.summer}
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="winter"
                        className="py-3 px-4 cursor-pointer focus:bg-slate-50 dark:focus:bg-slate-900 rounded-lg"
                      >
                        <div className="flex items-center">
                          <Snowflake className="w-5 h-5 mr-3 text-sky-400" />{" "}
                          <span className="text-base font-medium">
                            {labels.winter}
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Budget */}
                <div className="space-y-4 pt-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {copy.budget}
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
                  {copy.findMatch}
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
                {copy.topMatches}
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                {copy.ranked}
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
