import { useState, useEffect } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { getDestinationList } from "@/shared/services/destination/DestinationService";
import type { Destination } from "@/shared/types/destination";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import TripCard from "@/features/trips/components/TripCard";
import TripEditor from "@/features/trips/components/TripEditor";
import TripDetails from "@/features/trips/TripDetails";
import { Sparkles, Plus, Calendar, Bookmark } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/PageHeader";

export default function MyTrips() {
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
      <PageHeader
        title={
          activeTab === "bucketlist"
            ? `My Bucket List (${favoriteDestinations.length})`
            : `My Travel Itineraries (${trips.length})`
        }
        subtitle={
          activeTab === "bucketlist" ? "Saved Destinations" : "Travel Planner"
        }
        description={
          activeTab === "bucketlist"
            ? "Explore saved destinations you would like to visit across Japan."
            : "Manage your custom travel itineraries and daily route plans."
        }
        actions={
          activeTab === "planned" ? (
            <Button
              onClick={() => setIsAddingTrip(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-6 shadow-md"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Plan New Trip
            </Button>
          ) : undefined
        }
      />

      {/* Planned Itineraries Sub-Page */}
      {activeTab === "planned" && (
        <div className="space-y-6">
          {trips.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 max-w-2xl mx-auto">
              <Calendar className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-700 mb-6" />
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                No itineraries planned yet
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                Create a custom travel itinerary to organize your daily stops,
                route sequence, and transport options across Japan.
              </p>
              <Button
                onClick={() => setIsAddingTrip(true)}
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-8 shadow-md"
              >
                <Plus className="w-4 h-4 mr-2" />
                Plan New Trip
              </Button>
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
                Your Bucket List is empty
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                Explore our curated destinations across Japan and tap the
                bookmark icon to save places you would like to visit in the
                future.
              </p>
              <Link to="/destinations">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-8 shadow-md">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Explore Destinations
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
              Plan New Itinerary
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
