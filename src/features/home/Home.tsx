import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  Dices,
  MapPin,
  Navigation,
  Sparkles,
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
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuth } from "@/shared/hooks/useAuth";
import { getTabWeatherSummary } from "@/shared/services/weather/WeatherTabService";
import type { TripDuration } from "@/shared/services/recommendation/RecommendationContext";
import RouletteModal from "@/features/home/components/RouletteModal";
import { useTripPlannerState } from "@/features/home/hooks/useTripPlannerState";
import { useWeatherContext } from "@/features/home/hooks/useWeatherContext";
import { useTripRecommendations } from "@/features/home/hooks/useTripRecommendations";
import { useLocale } from "@/shared/context/LocaleContext";
import { type DiningStyle, type PartyProfile } from "@/shared/types/planner";
import { serializePlannerSearchParams } from "@/features/destinations/destinationSearchParams";

const HOME_COPY = {
  en: {
    baseLocation: "Tokyo Station",
    change: "Change",
    pickDate: "Pick custom forecast date",
    inYourArea: "today in",
    surprise: "Surprise Me",
    browse: "Browse All Destinations",
    planner: "Plan your trip",
    quickMatch: "Personalized match",
    vibe: "What are you in the mood for?",
    party: "Who are you traveling with?",
    dining: "Dining style",
    duration: "Trip type",
    anyDuration: "Any duration",
    halfDay: "Half day (<5h)",
    dayTrip: "Day trip (5–12h)",
    weekend: "Weekend (>12h)",
    budget: "Maximum trip budget",
    budgetNote: "Advanced budget limit; dining style controls food estimates.",
    solo: "Solo",
    couple: "Couple",
    group: "Group · 4",
    budgetStyle: "Budget",
    standardStyle: "Standard",
    premiumStyle: "Premium",
    planningFrom: "Planning from",
    findMatch: "Find My Match",
    topMatches: "Your Top Matches",
    ranked: "Ranked by how well they match your conditions and preferences.",
    seeAll: "See all matches",
  },
  ja: {
    baseLocation: "東京駅",
    change: "変更",
    pickDate: "予報日を選択",
    inYourArea: "今日の",
    surprise: "おまかせ",
    browse: "すべての旅先を見る",
    planner: "旅を計画",
    quickMatch: "あなた向けに提案",
    vibe: "どんな気分ですか？",
    party: "誰と旅行しますか？",
    dining: "食事スタイル",
    duration: "旅のタイプ",
    anyDuration: "時間を指定しない",
    halfDay: "半日（5時間未満）",
    dayTrip: "日帰り（5〜12時間）",
    weekend: "週末（12時間超）",
    budget: "旅の予算上限",
    budgetNote: "詳細設定の予算上限。食事スタイルは食費の目安です。",
    solo: "ひとり旅",
    couple: "カップル",
    group: "グループ・4名",
    budgetStyle: "節約",
    standardStyle: "標準",
    premiumStyle: "プレミアム",
    planningFrom: "出発地",
    findMatch: "ぴったりを探す",
    topMatches: "あなたへのおすすめ",
    ranked: "条件や好みに合う順に表示しています。",
    seeAll: "おすすめをすべて見る",
  },
} as const;

const TRIP_LABELS = {
  en: {
    any: "Anything",
    themepark: "Theme Parks",
    sea: "Sea Escape",
    history: "History & Culture",
    art: "Art & Museums",
    food: "Food & Eating",
    nature: "Nature & Outdoors",
    cool: "Cool Escape",
    photography: "Photography",
    anyWeather: "Any weather",
    rainy: "Rainy",
    summer: "Hot",
    winter: "Cold",
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
    anyWeather: "どんな天気でも",
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

function getHomeCity(homeStation: string | null, fallback: string) {
  const label = homeStation?.split(",")[0].trim() || fallback;
  return label.replace(/\s+Station$/i, "").trim();
}

export default function Home() {
  const { locale } = useLocale();
  const copy = HOME_COPY[locale];
  const labels = TRIP_LABELS[locale];
  const allDestinations = getDestinationList(locale) as Destination[];
  const { isVisited, homeStationCoords, homeStation } = useTripStore();
  const { user } = useAuth();
  const {
    vibe,
    setVibe,
    budget,
    carMode,
    publicModes,
    partySize,
    partyProfile,
    setPartyProfile,
    diningStyle,
    setDiningStyle,
    tripDuration,
    setTripDuration,
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
      vibe,
      budget,
      carMode,
      publicModes,
      partySize,
      diningStyle,
      tripDuration,
      homeStationCoords,
      isVisited,
    });
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const topRecommendations = recommendedDestinations.slice(0, 3);
  const homeCity = getHomeCity(homeStation, copy.baseLocation);
  const scrollToRecommendations = () =>
    document
      .getElementById("recommendations")
      ?.scrollIntoView({ behavior: "smooth" });

  const selectClass =
    "h-12 rounded-xl border-slate-200 bg-slate-50 font-medium dark:border-slate-800 dark:bg-slate-950";
  const moodOptions = [
    ["any", labels.any],
    ["themepark", labels.themepark],
    ["sea", labels.sea],
    ["history", labels.history],
    ["art", labels.art],
    ["food", labels.food],
    ["nature", labels.nature],
    ["cool", labels.cool],
    ["photography", labels.photography],
  ];
  const partyOptions: [PartyProfile, string][] = [
    ["solo", copy.solo],
    ["couple", copy.couple],
    ["group", copy.group],
  ];
  const diningOptions: [DiningStyle, string][] = [
    ["budget", copy.budgetStyle],
    ["standard", copy.standardStyle],
    ["premium", copy.premiumStyle],
  ];
  const durationOptions: [TripDuration, string][] = [
    ["any", copy.anyDuration],
    ["halfDay", copy.halfDay],
    ["dayTrip", copy.dayTrip],
    ["weekend", copy.weekend],
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/30">
        <div className="pointer-events-none absolute -right-24 top-12 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/20" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-sky-100/60 blur-3xl dark:bg-sky-950/30" />
        <div className="container relative mx-auto px-4">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 py-5 text-sm dark:border-slate-800">
            <span className="inline-flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <MapPin className="h-4 w-4 text-emerald-600" />
              {homeStation || copy.baseLocation}
            </span>
            <Link
              to="/settings?section=general&return=/"
              className="font-bold text-emerald-600 hover:underline"
            >
              {copy.change}
            </Link>
            <span className="hidden h-5 w-px bg-slate-300 sm:block dark:bg-slate-700" />
            {weatherContext?.tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (weatherContext && !tab.isCustom) {
                    setWeatherContext({
                      ...weatherContext,
                      tabs: weatherContext.tabs.filter(
                        (item) => !item.isCustom,
                      ),
                    });
                    setCustomDate(null);
                  }
                  setActiveTabId(tab.id);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${activeTabId === tab.id ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-900"}`}
              >
                {localizeWeatherText(tab.label, locale)}
              </button>
            ))}
            {weatherContext && (
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                <input
                  type="date"
                  min={weatherContext.minDate}
                  max={weatherContext.maxDate}
                  value={customDate || ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      setCustomDate(event.target.value);
                      handleCustomDateSelect(event.target.value);
                    }
                  }}
                  title={copy.pickDate}
                  className="w-[7.5rem] bg-transparent text-xs focus:outline-none dark:text-slate-200"
                />
              </label>
            )}
            {currentSituation && (
              <span className="inline-flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
                <span className="text-emerald-600">
                  {currentSituation.temp}°C
                </span>
                {locale === "ja"
                  ? `${homeCity}の${localizeWeatherText(currentSituation.desc, locale)}です`
                  : `${localizeWeatherText(currentSituation.desc, locale)} ${copy.inYourArea} ${homeCity}`}
              </span>
            )}
          </div>

          <div className="grid items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
            <div className="max-w-xl">
              <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 dark:text-white sm:text-6xl">
                {locale === "ja" ? (
                  <>
                    {homeCity}から、
                    <br />
                    次はどこへ行く？
                  </>
                ) : (
                  <>
                    Where will you go next
                    <br />
                    from {homeCity}?
                  </>
                )}
              </h1>
              <p className="mt-6 max-w-md text-lg leading-8 text-slate-600 dark:text-slate-300">
                {locale === "ja"
                  ? `${homeCity}発の予定、天気、予算、好みに合わせておすすめします。`
                  : `Personalized recommendations from ${homeCity} based on your plans, weather, budget, and preferences.`}
              </p>
            </div>

            <div>
              <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <h2 className="flex items-center text-xl font-bold text-slate-900 dark:text-white">
                    <Navigation className="mr-2 h-5 w-5 text-emerald-600" />
                    {copy.planner}
                  </h2>
                  <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 sm:block dark:bg-emerald-950/60 dark:text-emerald-300">
                    {copy.quickMatch}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                    {copy.vibe}
                    <Select
                      value={vibe}
                      onValueChange={(value) => value && setVibe(value)}
                    >
                      <SelectTrigger className={selectClass}>
                        {labels[vibe as keyof typeof labels] || labels.any}
                      </SelectTrigger>
                      <SelectContent>
                        {moodOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                    {copy.party}
                    <Select
                      value={partyProfile}
                      onValueChange={(value) =>
                        value && setPartyProfile(value as PartyProfile)
                      }
                    >
                      <SelectTrigger className={selectClass}>
                        {
                          partyOptions.find(
                            ([value]) => value === partyProfile,
                          )?.[1]
                        }
                      </SelectTrigger>
                      <SelectContent>
                        {partyOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                    {copy.dining}
                    <Select
                      value={diningStyle}
                      onValueChange={(value) =>
                        value && setDiningStyle(value as DiningStyle)
                      }
                    >
                      <SelectTrigger className={selectClass}>
                        {
                          diningOptions.find(
                            ([value]) => value === diningStyle,
                          )?.[1]
                        }
                      </SelectTrigger>
                      <SelectContent>
                        {diningOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                    {copy.duration}
                    <Select
                      value={tripDuration}
                      onValueChange={(value) =>
                        value && setTripDuration(value as TripDuration)
                      }
                    >
                      <SelectTrigger className={selectClass}>
                        {
                          durationOptions.find(
                            ([value]) => value === tripDuration,
                          )?.[1]
                        }
                      </SelectTrigger>
                      <SelectContent>
                        {durationOptions.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                  {copy.budgetNote}
                </p>
                <Button
                  className="mt-6 h-12 w-full rounded-xl bg-emerald-700 text-base font-bold text-white hover:bg-emerald-800"
                  onClick={scrollToRecommendations}
                >
                  <Sparkles className="mr-2 h-5 w-5" />
                  {copy.findMatch}
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-12 rounded-xl bg-white text-base font-bold dark:bg-slate-900"
                  onClick={() => setRouletteOpen(true)}
                >
                  <Dices className="mr-2 h-5 w-5" />
                  {copy.surprise}
                </Button>
                <Link
                  to={`/destinations?${serializePlannerSearchParams({ vibe, partyProfile, diningStyle, tripDuration, budget, carMode, publicModes })}`}
                >
                  <Button
                    variant="outline"
                    className="h-12 w-full rounded-xl bg-white text-base font-bold dark:bg-slate-900"
                  >
                    {copy.browse}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RouletteModal
        isOpen={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        candidates={rouletteCandidates as Destination[]}
        partySize={partySize}
        carMode={carMode}
        publicModes={publicModes}
      />

      <section
        id="recommendations"
        className="bg-white py-16 dark:bg-background sm:py-20"
      >
        <div className="container mx-auto px-4">
          <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h2 className="mb-2 text-3xl font-bold tracking-tight">
                {copy.topMatches}
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                {copy.ranked}
              </p>
            </div>
            <Link
              to="/destinations"
              className="inline-flex items-center font-bold text-emerald-600 hover:text-emerald-700"
            >
              {copy.seeAll}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {topRecommendations.map((dest: any, index: number) => (
              <div key={dest.id} className="flex h-full flex-col">
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
