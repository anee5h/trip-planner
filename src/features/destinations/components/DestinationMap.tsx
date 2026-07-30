import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import type { Destination } from "@/shared/types/destination";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/shared/components/ui/button";
import { useLocale } from "@/shared/context/LocaleContext";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import { ItineraryPickerModal } from "@/features/trips/components/ItineraryPickerModal";
import { Compass, CalendarPlus } from "lucide-react";

interface DestinationMapProps {
  destinations: Destination[];
  carMode?: string;
  publicModes?: string[];
}

function FitDestinations({
  destinations,
}: Pick<DestinationMapProps, "destinations">) {
  const map = useMap();
  useEffect(() => {
    const points = destinations.flatMap((destination) =>
      destination.coordinates
        ? [
            [destination.coordinates.lat, destination.coordinates.lng] as [
              number,
              number,
            ],
          ]
        : [],
    );
    if (points.length === 1) map.setView(points[0], 12);
    else if (points.length > 1) map.fitBounds(points, { padding: [32, 32] });
  }, [destinations, map]);
  return null;
}

export default function DestinationMap({
  destinations,
  carMode,
  publicModes,
}: DestinationMapProps) {
  const { locale } = useLocale();
  const [selectedPickerDest, setSelectedPickerDest] =
    useState<Destination | null>(null);

  const center: [number, number] = [35.5, 139.6];

  const linkState =
    carMode !== undefined || publicModes !== undefined
      ? { carMode, publicModes }
      : undefined;

  return (
    <div className="w-full h-[600px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm z-0 relative">
      <MapContainer
        center={center}
        zoom={8}
        scrollWheelZoom={false}
        className="w-full h-full z-0"
      >
        <FitDestinations destinations={destinations} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {destinations
          .filter((d) => d.coordinates)
          .map((dest) => {
            const { lat, lng } = dest.coordinates!;

            const customIcon = L.divIcon({
              className: "custom-map-marker",
              html: `<div class="w-8 h-8 rounded-full border-2 border-white bg-emerald-500 shadow-lg flex items-center justify-center transform hover:scale-110 transition-transform"><img src="${dest.heroImage}" class="w-full h-full rounded-full object-cover opacity-80 mix-blend-screen" /></div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
              popupAnchor: [0, -16],
            });

            const placeName = formatPlaceName(dest, locale);

            return (
              <Marker key={dest.id} position={[lat, lng]} icon={customIcon}>
                <Popup className="custom-popup">
                  <div className="font-sans min-w-[220px] max-w-[260px] p-3">
                    <img
                      src={dest.heroImage}
                      alt={placeName}
                      className="w-full h-28 object-cover rounded-md mb-2"
                    />
                    <h3 className="font-bold text-base text-slate-900 dark:text-white mb-0.5 truncate">
                      {placeName}
                    </h3>
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">
                      ★ {dest.ratings?.overall ?? 4.5}/10
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                      {dest.description
                        ? `${dest.description.slice(0, 60)}...`
                        : dest.categories?.join(" • ")}
                    </p>

                    {/* Action Bar with Explore and Add to Trip buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <Link
                        to={`/destinations/${dest.id}`}
                        state={linkState}
                        className="flex-1 min-w-0"
                      >
                        <Button
                          size="sm"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-2 h-8"
                        >
                          <Compass className="w-3.5 h-3.5 mr-1 shrink-0" />
                          <span className="truncate">
                            {locale === "ja" ? "ガイドを見る" : "Explore"}
                          </span>
                        </Button>
                      </Link>

                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-w-0 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold text-xs px-2 h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPickerDest(dest);
                        }}
                      >
                        <CalendarPlus className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="truncate">
                          {locale === "ja" ? "日程に追加" : "Add to Trip"}
                        </span>
                      </Button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>

      {selectedPickerDest && (
        <ItineraryPickerModal
          isOpen={Boolean(selectedPickerDest)}
          onClose={() => setSelectedPickerDest(null)}
          destination={{
            id: selectedPickerDest.id,
            name: formatPlaceName(selectedPickerDest, locale),
          }}
        />
      )}
    </div>
  );
}
