import { useState, useEffect } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import TripCard from "@/features/trips/components/TripCard";
import TripEditor from "@/features/trips/components/TripEditor";
import TripDetails from "@/features/trips/TripDetails";
import { Sparkles, Plus, Calendar, Bookmark, Compass } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { useTranslation } from "react-i18next";

export default function MyTrips() {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    favorites,
    trips,
    addTrip,
    updateTrip,
    deleteTrip,
    addStopToTrip,
    removeStopFromTrip,
    reorderTripStops,
  } = useTripStore();

  const [searchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const paramTripId = searchParams.get("tripId");

  const isBucketListRoute =
    location.pathname === "/bucket-list" || paramTab === "bucketlist";

  const [activeTab, setActiveTab] = useState<"planned" | "bucketlist">(
    isBucketListRoute ? "bucketlist" : "planned",
  );
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [isAddingTrip, setIsAddingTrip] = useState(false);

  useEffect(() => {
    if (location.pathname === "/bucket-list" || paramTab === "bucketlist") {
      setActiveTab("bucketlist");
    } else {
      setActiveTab("planned");
    }
    if (paramTripId) {
      setSelectedTripId(paramTripId);
    }
  }, [location.pathname, paramTab, paramTripId]);

  const allDestinations = getDestinationList() as Destination[];

  const favoriteDestinations = allDestinations.filter((d) =>
    favorites.includes(d.id),
  );

  const selectedTrip = trips.find((t) => t.id === selectedTripId);

  // If a specific trip planner is open, render its detailed editor
  if (selectedTrip) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <TripDetails
          trip={selectedTrip}
          onBack={() => setSelectedTripId(null)}
          onUpdateTrip={(updates) => updateTrip(selectedTrip.id, updates)}
          onAddStop={(stop) => addStopToTrip(selectedTrip.id, stop)}
          onRemoveStop={(stopId) => removeStopFromTrip(selectedTrip.id, stopId)}
          onReorderStops={(start, end) =>
            reorderTripStops(selectedTrip.id, start, end)
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl space-y-8">
      {/* Shared Trips Sub-Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <Link
          to="/my-trips"
          className={`flex items-center gap-2 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-[36px] rounded-xl text-xs font-bold transition-all ${
            !isBucketListRoute
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>{t("navigation.itineraries")}</span>
        </Link>
        <Link
          to="/bucket-list"
          className={`flex items-center gap-2 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-[36px] rounded-xl text-xs font-bold transition-all ${
            isBucketListRoute
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>{t("navigation.bucketList")}</span>
        </Link>
      </div>

      <PageHeader
        title={
          activeTab === "bucketlist"
            ? `${t("ui.bucketList")} (${favoriteDestinations.length})`
            : `${t("ui.itineraries")} (${trips.length})`
        }
        subtitle={
          activeTab === "bucketlist"
            ? t("ui.savedDestinations")
            : t("ui.travelPlanner")
        }
        description={
          activeTab === "bucketlist"
            ? t("ui.emptyBucketListHint")
            : t("ui.noItinerariesHint")
        }
        actions={
          activeTab === "planned" && trips.length > 0 ? (
            <Button
              onClick={() => setIsAddingTrip(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-6 shadow-md"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {t("ui.newTrip")}
            </Button>
          ) : undefined
        }
        stackActionsOnMobile
      />

      {/* Planned Itineraries Sub-Page */}
      {activeTab === "planned" && (
        <div className="space-y-6">
          {trips.length === 0 ? (
            <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center dark:border-slate-800 dark:bg-slate-900/50">
              <Calendar className="mx-auto mb-5 size-14 text-slate-300 dark:text-slate-700" />
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                {t("ui.noItineraries")}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                {t("ui.noItinerariesHint")}
              </p>
              <div className="flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  onClick={() => setIsAddingTrip(true)}
                  size="lg"
                  className="rounded-full bg-emerald-600 px-6 font-bold text-white shadow-md hover:bg-emerald-700"
                >
                  <Plus className="mr-2 size-4" />
                  {t("ui.planFirstTrip")}
                </Button>
                <Link to="/">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full rounded-full font-bold sm:w-auto"
                  >
                    <Compass className="mr-2 size-4" />
                    {t("ui.startFromRecommendations")}
                  </Button>
                </Link>
                <Link to="/bucket-list">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full rounded-full font-bold sm:w-auto"
                  >
                    <Bookmark className="mr-2 size-4" />
                    {t("ui.buildFromSavedDestination")}
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onSelect={() => setSelectedTripId(trip.id)}
                  onDelete={() => deleteTrip(trip.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bucket List Sub-Page */}
      {activeTab === "bucketlist" && (
        <div className="space-y-6">
          {favoriteDestinations.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 max-w-2xl mx-auto">
              <Bookmark className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-700 mb-6" />
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                {t("ui.emptyBucketList")}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                {t("ui.emptyBucketListHint")}
              </p>
              <Link to="/destinations">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-8 shadow-md">
                  <Sparkles className="w-4 h-4 mr-2" />
                  {t("ui.exploreDestinations")}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {favoriteDestinations.map((dest) => (
                <DestinationCard key={dest.id} destination={dest} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Trip Overlay Modal */}
      {isAddingTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full relative shadow-xl mx-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {t("ui.newItinerary")}
            </h3>
            <TripEditor
              onSave={(title, start, end) => {
                addTrip(title, start, end);
                setIsAddingTrip(false);
              }}
              onCancel={() => setIsAddingTrip(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
