import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { addStopToTrip } from "@/shared/services/trips/TripService";
import {
  saveItineraryGroup,
  type ItineraryGroup,
} from "@/shared/services/trips/ItineraryGroupService";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { isRealDestinationStop } from "@/shared/services/recommendation/DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";
import { toast } from "sonner";
import {
  Calendar,
  Plus,
  X,
  ChevronRight,
  AlertCircle,
  MapPin,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export type PendingItinerarySave =
  | { type: "destination"; destination: { id: string; name: string } }
  | { type: "destination_pair"; group: ItineraryGroup }
  | { type: "generated_plan"; plan: DayPlan };

export interface ItineraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: PendingItinerarySave | null;
}

export function ItineraryPickerModal({
  isOpen,
  onClose,
  payload,
}: ItineraryPickerModalProps) {
  const navigate = useNavigate();
  const { trips, addTrip, updateTrip } = useTripStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !payload) return null;

  const handleClose = () => {
    if (isSubmitting) return;
    setIsCreating(false);
    setNewTitle("");
    onClose();
  };

  const handleSelectTrip = (tripId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const targetTrip = trips.find((t) => t.id === tripId);
      if (!targetTrip) {
        setIsSubmitting(false);
        return;
      }

      let currentTrip = targetTrip;

      if (payload.type === "generated_plan") {
        const plan = payload.plan;
        const destSteps = plan.steps.filter(isRealDestinationStop);
        let addedCount = 0;
        const uniqueDests: Destination[] = [];
        const seenIds = new Set<string>();

        destSteps.forEach((step) => {
          if (step.destination && !seenIds.has(step.destination.id)) {
            seenIds.add(step.destination.id);
            uniqueDests.push(step.destination);
          }
        });

        uniqueDests.forEach((dest) => {
          const isDup = currentTrip.stops.some(
            (s) => s.destinationId === dest.id,
          );
          if (!isDup) {
            currentTrip = addStopToTrip(currentTrip, {
              name: dest.name,
              type: "destination",
              destinationId: dest.id,
            });
            addedCount++;
          }
        });

        updateTrip(targetTrip.id, { stops: currentTrip.stops });

        const groupToSave: ItineraryGroup = {
          id: plan.id,
          type: "generated_plan",
          title: plan.title,
          destinations: uniqueDests,
          plan,
          createdAt: new Date().toISOString(),
        };
        saveItineraryGroup(targetTrip.id, groupToSave);

        toast.success(
          `Saved full model plan (${addedCount} stops) to "${targetTrip.title}"`,
          {
            id: "itinerary-add-plan-success",
            duration: 4000,
            action: {
              label: "View Trip",
              onClick: () => navigate(`/my-trips?tripId=${targetTrip.id}`),
            },
          },
        );
      } else if (payload.type === "destination_pair") {
        const group = payload.group;
        const addedNames: string[] = [];
        const existingNames: string[] = [];

        group.destinations.forEach((dest: Destination) => {
          const isDup = currentTrip.stops.some(
            (s) => s.destinationId === dest.id,
          );
          if (!isDup) {
            currentTrip = addStopToTrip(currentTrip, {
              name: dest.name,
              type: "destination",
              destinationId: dest.id,
            });
            addedNames.push(dest.name);
          } else {
            existingNames.push(dest.name);
          }
        });

        updateTrip(targetTrip.id, { stops: currentTrip.stops });
        saveItineraryGroup(targetTrip.id, group);

        let msg = `Saved pair to "${targetTrip.title}"`;
        if (addedNames.length === 2) {
          msg = `Added ${addedNames[0]} & ${addedNames[1]} to "${targetTrip.title}"`;
        } else if (addedNames.length === 1) {
          msg = `Added ${addedNames[0]} to "${targetTrip.title}" (${existingNames[0]} already in trip)`;
        } else if (existingNames.length === 2) {
          msg = `Saved pair to "${targetTrip.title}" (both spots already in trip)`;
        }

        toast.success(msg, {
          id: "itinerary-add-pair-success",
          duration: 4000,
          action: {
            label: "View Trip",
            onClick: () => navigate(`/my-trips?tripId=${targetTrip.id}`),
          },
        });
      } else {
        // Single destination save
        const dest = payload.destination;
        const isDuplicate = currentTrip.stops.some(
          (s) => s.destinationId === dest.id,
        );

        if (isDuplicate) {
          toast.warning(
            `Destination already exists in "${currentTrip.title}"`,
            {
              id: "itinerary-duplicate-warning",
            },
          );
          setIsSubmitting(false);
          onClose();
          return;
        }

        const updated = addStopToTrip(currentTrip, {
          name: dest.name,
          type: "destination",
          destinationId: dest.id,
        });

        updateTrip(currentTrip.id, { stops: updated.stops });

        toast.success(`Added ${dest.name} to "${currentTrip.title}"`, {
          id: "itinerary-add-success",
          duration: 4000,
          action: {
            label: "View Trip",
            onClick: () => navigate(`/my-trips?tripId=${currentTrip.id}`),
          },
        });
      }

      handleClose();
    } catch (err) {
      toast.error("Failed to add destination to itinerary.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNewTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const defaultTitle =
      payload.type === "destination"
        ? `Trip to ${payload.destination.name}`
        : payload.type === "destination_pair"
          ? payload.group.title.en
          : payload.plan.title.en;

    const titleToUse = newTitle.trim() || defaultTitle;

    try {
      const created = addTrip(titleToUse);
      let currentTrip = created;

      if (payload.type === "generated_plan") {
        const destSteps = payload.plan.steps.filter(isRealDestinationStop);
        const uniqueDests: Destination[] = [];
        const seenIds = new Set<string>();

        destSteps.forEach((step) => {
          if (step.destination && !seenIds.has(step.destination.id)) {
            seenIds.add(step.destination.id);
            uniqueDests.push(step.destination);
          }
        });

        uniqueDests.forEach((dest) => {
          currentTrip = addStopToTrip(currentTrip, {
            name: dest.name,
            type: "destination",
            destinationId: dest.id,
          });
        });

        updateTrip(created.id, { stops: currentTrip.stops });
        saveItineraryGroup(created.id, {
          id: payload.plan.id,
          type: "generated_plan",
          title: payload.plan.title,
          destinations: uniqueDests,
          plan: payload.plan,
          createdAt: new Date().toISOString(),
        });

        toast.success(`Created "${created.title}" & saved plan!`, {
          id: "itinerary-create-plan-success",
          duration: 4000,
          action: {
            label: "View Trip",
            onClick: () => navigate(`/my-trips?tripId=${created.id}`),
          },
        });
      } else if (payload.type === "destination_pair") {
        payload.group.destinations.forEach((dest: Destination) => {
          currentTrip = addStopToTrip(currentTrip, {
            name: dest.name,
            type: "destination",
            destinationId: dest.id,
          });
        });

        updateTrip(created.id, { stops: currentTrip.stops });
        saveItineraryGroup(created.id, payload.group);

        toast.success(`Created "${created.title}" & saved pair!`, {
          id: "itinerary-create-pair-success",
          duration: 4000,
          action: {
            label: "View Trip",
            onClick: () => navigate(`/my-trips?tripId=${created.id}`),
          },
        });
      } else {
        const updated = addStopToTrip(created, {
          name: payload.destination.name,
          type: "destination",
          destinationId: payload.destination.id,
        });

        updateTrip(created.id, { stops: updated.stops });

        toast.success(
          `Created "${created.title}" & added ${payload.destination.name}!`,
          {
            id: "itinerary-create-success",
            duration: 4000,
            action: {
              label: "View Trip",
              onClick: () => navigate(`/my-trips?tripId=${created.id}`),
            },
          },
        );
      }

      handleClose();
    } catch (err) {
      toast.error("Failed to create itinerary.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle =
    payload.type === "generated_plan"
      ? "Save Generated Plan"
      : payload.type === "destination_pair"
        ? "Save Destination Pair"
        : "Add Destination to Trip";

  const modalSubtitle =
    payload.type === "generated_plan"
      ? payload.plan.title.en
      : payload.type === "destination_pair"
        ? payload.group.title.en
        : payload.destination.name;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="itinerary-picker-title"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-2xl text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
              {payload.type === "destination" ? (
                <Calendar className="w-5 h-5" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3
                id="itinerary-picker-title"
                className="font-bold text-slate-900 dark:text-white text-base"
              >
                {modalTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                {modalSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-100 rounded-full transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {trips.length === 0 && !isCreating ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  No trips yet
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Create your first trip to save {modalSubtitle} to your
                  itinerary.
                </p>
              </div>
              <Button
                onClick={() => setIsCreating(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl py-2.5 text-sm"
              >
                Create First Trip
              </Button>
            </div>
          ) : isCreating ? (
            <form onSubmit={handleCreateNewTrip} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Trip Name
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={modalSubtitle}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base sm:text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreating(false)}
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl text-xs font-bold"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    "Create & Add"
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Select a Trip
                </span>
                <button
                  onClick={() => setIsCreating(true)}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Trip
                </button>
              </div>

              <div className="space-y-2">
                {trips.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTrip(t.id)}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-white dark:bg-slate-900 transition-all text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <MapPin className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                          {t.title}
                        </p>
                        <p className="text-xs text-slate-400">
                          {t.stops.length}{" "}
                          {t.stops.length === 1 ? "stop" : "stops"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
