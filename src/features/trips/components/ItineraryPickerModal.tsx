import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { addStopToTrip } from "@/shared/services/trips/TripService";
import { toast } from "sonner";
import {
  Calendar,
  Plus,
  X,
  ChevronRight,
  AlertCircle,
  MapPin,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface ItineraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  destination: {
    id: string;
    name: string;
  };
}

export function ItineraryPickerModal({
  isOpen,
  onClose,
  destination,
}: ItineraryPickerModalProps) {
  const navigate = useNavigate();
  const { trips, addTrip, updateTrip } = useTripStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  if (!isOpen) return null;

  const handleSelectTrip = (tripId: string) => {
    const targetTrip = trips.find((t) => t.id === tripId);
    if (!targetTrip) return;

    // Duplicate check
    const isDuplicate = targetTrip.stops.some(
      (s) => s.destinationId === destination.id,
    );

    if (isDuplicate) {
      toast.warning(`Destination already exists in "${targetTrip.title}"`, {
        id: "itinerary-duplicate-warning",
      });
      onClose();
      return;
    }

    // Add stop to trip
    const updated = addStopToTrip(targetTrip, {
      name: destination.name,
      type: "destination",
      destinationId: destination.id,
    });

    updateTrip(targetTrip.id, { stops: updated.stops });

    toast.success(`Added to "${targetTrip.title}"`, {
      id: "itinerary-add-success",
      duration: 4000,
      action: {
        label: "View Trip",
        onClick: () => navigate(`/my-trips?tripId=${targetTrip.id}`),
      },
    });

    onClose();
  };

  const handleCreateNewTrip = (e: React.FormEvent) => {
    e.preventDefault();
    const titleToUse = newTitle.trim() || `Trip to ${destination.name}`;

    try {
      const created = addTrip(titleToUse);
      handleSelectTrip(created.id);
    } catch (err) {
      toast.error("Failed to create itinerary.");
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-page-enter max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="itinerary-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2
              id="itinerary-modal-title"
              className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Add to Itinerary
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs sm:max-w-md">
              Select an itinerary for{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {destination.name}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {isCreating ? (
            <form onSubmit={handleCreateNewTrip} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  New Itinerary Name
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`e.g. ${destination.name} Trip`}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreating(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold px-4"
                >
                  Create & Add
                </Button>
              </div>
            </form>
          ) : (
            <>
              {trips.length === 0 ? (
                <div className="text-center py-6">
                  <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    No active itineraries found
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Create your first itinerary to start organizing your trip.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trips.map((trip) => {
                    const isAlreadyAdded = trip.stops.some(
                      (s) => s.destinationId === destination.id,
                    );
                    return (
                      <button
                        key={trip.id}
                        onClick={() => handleSelectTrip(trip.id)}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                          isAlreadyAdded
                            ? "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:bg-amber-500/10 hover:border-amber-500/30"
                            : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:border-emerald-500/50 shadow-sm"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-2.5 rounded-xl shrink-0 ${
                              isAlreadyAdded
                                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                                : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            <Calendar className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {trip.title}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {trip.stops.length} stop
                              {trip.stops.length === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>

                        {isAlreadyAdded ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0 ml-2">
                            <AlertCircle className="w-3 h-3" /> In Trip
                          </span>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Bottom Action: Create New Itinerary */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-bold transition-colors"
                >
                  <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Create New Itinerary
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
