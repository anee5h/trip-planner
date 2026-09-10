import { useState, useEffect } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useCatalogue } from "@/shared/hooks/useCatalogue";
import type { Destination } from "@/shared/types/destination";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import TripCard from "@/features/trips/components/TripCard";
import TripEditor from "@/features/trips/components/TripEditor";
import TripDatesEditor from "@/features/trips/components/TripDatesEditor";
import TripDetails from "@/features/trips/TripDetails";
import { Sparkles, Plus, Calendar, Bookmark, Compass, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import ModalDialog from "@/shared/components/ui/ModalDialog";
import { useTranslation } from "react-i18next";

export default function MyTrips() {
  const { t, i18n } = useTranslation();
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

  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const paramTripId = searchParams.get("tripId");

  const isBucketListRoute =
    location.pathname === "/bucket-list" || paramTab === "bucketlist";

  const [activeTab, setActiveTab] = useState<"planned" | "bucketlist">(
    isBucketListRoute ? "bucketlist" : "planned",
  );
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [isAddingTrip, setIsAddingTrip] = useState(false);
  const [newTripOpener, setNewTripOpener] = useState<HTMLButtonElement | null>(
    null,
  );
  const [cardEditorOpener, setCardEditorOpener] = useState<HTMLElement | null>(
    null,
  );
  const [cardEdit, setCardEdit] = useState<
    { tripId: string; mode: "rename" | "dates" } | undefined
  >();

  useEffect(() => {
    if (location.pathname === "/bucket-list" || paramTab === "bucketlist") {
      setActiveTab("bucketlist");
    } else {
      setActiveTab("planned");
    }
    if (paramTripId) {
      setSelectedTripId(paramTripId);
    }
  }, [location.pathname, paramTab, paramTripId, trips]);

  const {
    places: cataloguePlaces,
    error: liteError,
    retry: retryLite,
  } = useCatalogue({ need: "summary" });
  const allDestinations = cataloguePlaces as Destination[];

  const favoriteDestinations = allDestinations.filter((d) =>
    favorites.includes(d.id),
  );

  const selectedTrip = trips.find((t) => t.id === selectedTripId);
  const cardEditingTrip = cardEdit
    ? trips.find((t) => t.id === cardEdit.tripId)
    : undefined;

  useEffect(() => {
    document.body.dataset.tripDetailOpen = selectedTrip ? "true" : "false";
    window.dispatchEvent(new Event("trip-detail-visibility"));
    return () => {
      delete document.body.dataset.tripDetailOpen;
      window.dispatchEvent(new Event("trip-detail-visibility"));
    };
  }, [selectedTrip]);

  const closeCardEditor = () => {
    setCardEdit(undefined);
    setCardEditorOpener(null);
  };

  const closeNewTripEditor = () => {
    setIsAddingTrip(false);
    setNewTripOpener(null);
  };

  // If a specific trip planner is open, render its detailed editor
  if (selectedTrip) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-6 md:py-12">
        <TripDetails
          trip={selectedTrip}
          onBack={() => {
            setSelectedTripId(null);
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.delete("tripId");
            setSearchParams(nextSearchParams, { replace: true });
          }}
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

  // KAI-132: a failed lite load is NOT an empty catalogue — an empty
  // bucket list must not masquerade as real. Surface an explicit
  // error/retry state.
  if (liteError) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div
          role="alert"
          data-lite-error
          className="flex flex-col items-center justify-center py-20 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900/50 text-center px-4"
        >
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t("home.matchesErrorTitle", "Couldn't load destinations")}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "home.matchesErrorBody",
              "The destination catalogue couldn't be loaded. Check your connection and try again.",
            )}
          </p>
          <button
            type="button"
            onClick={retryLite}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {t("ui.retry", "Retry")}
          </button>
        </div>
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
              ? "bg-emerald-700 text-white shadow-sm"
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
              ? "bg-emerald-700 text-white shadow-sm"
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
              onClick={(event) => {
                setNewTripOpener(event.currentTarget);
                setIsAddingTrip(true);
              }}
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-full font-bold px-6 shadow-md"
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
              <p className="text-slate-500 dark:text-slate-300 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                {t("ui.noItinerariesHint")}
              </p>
              <div className="flex flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  onClick={(event) => {
                    setNewTripOpener(event.currentTarget);
                    setIsAddingTrip(true);
                  }}
                  size="lg"
                  className="rounded-full bg-emerald-700 px-6 font-bold text-white shadow-md hover:bg-emerald-800"
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
                  onRename={(tripId, opener) => {
                    setCardEditorOpener(opener ?? null);
                    setCardEdit({ tripId, mode: "rename" });
                  }}
                  onEditDates={(tripId, opener) => {
                    setCardEditorOpener(opener ?? null);
                    setCardEdit({ tripId, mode: "dates" });
                  }}
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
              <p className="text-slate-500 dark:text-slate-300 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                {t("ui.emptyBucketListHint")}
              </p>
              <Link to="/destinations">
                <Button className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-full font-bold px-8 shadow-md">
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

      {cardEditingTrip && cardEdit && (
        <ModalDialog
          titleId="trip-card-editor-title"
          onClose={closeCardEditor}
          opener={cardEditorOpener}
          className="max-w-lg"
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="trip-card-editor-title"
                className="text-lg font-extrabold text-slate-950 dark:text-white"
              >
                {cardEdit.mode === "rename"
                  ? t("ui.rename")
                  : cardEditingTrip.startDate
                    ? t("ui.editDates")
                    : t("ui.setDates")}
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-300">
                {cardEditingTrip.title}
              </p>
            </div>
            <button
              type="button"
              aria-label={t("ui.close")}
              onClick={closeCardEditor}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {cardEdit.mode === "rename" ? (
            <TripEditor
              initialTitle={cardEditingTrip.title}
              showDates={false}
              allowBlankTitle={false}
              onSave={(title) => {
                updateTrip(cardEditingTrip.id, { title });
                closeCardEditor();
              }}
              onCancel={closeCardEditor}
            />
          ) : (
            <TripDatesEditor
              initialStartDate={cardEditingTrip.startDate}
              initialEndDate={cardEditingTrip.endDate}
              onSave={(startDate, endDate) => {
                updateTrip(cardEditingTrip.id, { startDate, endDate });
                closeCardEditor();
              }}
              onCancel={closeCardEditor}
            />
          )}
        </ModalDialog>
      )}

      {/* Create Trip Overlay Modal */}
      {isAddingTrip && (
        <ModalDialog
          titleId="new-itinerary-title"
          onClose={closeNewTripEditor}
          opener={newTripOpener}
          className="max-w-md"
        >
          <h3
            id="new-itinerary-title"
            className="mb-4 text-xl font-bold text-slate-900 dark:text-white"
          >
            {t("ui.newItinerary")}
          </h3>
          <TripEditor
            onSave={(title, start, end) => {
              addTrip(title, start, end, {
                locale: i18n.language === "ja" ? "ja" : "en",
              });
              closeNewTripEditor();
            }}
            onCancel={closeNewTripEditor}
          />
        </ModalDialog>
      )}
    </div>
  );
}
