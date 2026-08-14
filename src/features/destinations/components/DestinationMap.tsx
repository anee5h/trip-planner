import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import type { Destination } from "@/shared/types/destination";
import { formatPlaceName } from "@/shared/utils/placeLabels";
import { getScorePresentation } from "@/shared/services/recommendation/RecommendationScorer";
import { Compass } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { BucketListButton } from "@/shared/components/ui/BucketListButton";
import "leaflet/dist/leaflet.css";

// Fix default Leaflet icon paths
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const defaultMarkerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitDestinations({ destinations }: { destinations: Destination[] }) {
  const map = useMap();
  useEffect(() => {
    if (destinations.length === 1 && destinations[0].coordinates) {
      map.setView(
        [destinations[0].coordinates.lat, destinations[0].coordinates.lng],
        14,
      );
    } else if (destinations.length > 1) {
      const bounds = L.latLngBounds(
        destinations.map((d) => [d.coordinates!.lat, d.coordinates!.lng]),
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [destinations, map]);
  return null;
}

export interface DestinationMapProps {
  destinations: Destination[];
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  className?: string;
  locale?: "en" | "ja";
  carMode?: string;
  publicModes?: string[];
  activeTransportMode?: string;
}

export default function DestinationMap({
  destinations,
  centerLat = 35.6762,
  centerLng = 139.6503,
  zoom = 11,
  className = "h-[400px] w-full rounded-xl overflow-hidden shadow-inner",
  locale = "en",
}: DestinationMapProps) {
  const location = useLocation();

  const validDestinations = useMemo(() => {
    return destinations.filter(
      (d) =>
        d.coordinates &&
        Number.isFinite(d.coordinates.lat) &&
        Number.isFinite(d.coordinates.lng),
    );
  }, [destinations]);

  const mapCenter: [number, number] = useMemo(() => {
    if (validDestinations.length > 0 && validDestinations[0].coordinates) {
      return [
        validDestinations[0].coordinates.lat,
        validDestinations[0].coordinates.lng,
      ];
    }
    return [centerLat, centerLng];
  }, [validDestinations, centerLat, centerLng]);

  const linkState = useMemo(
    () => ({ from: `${location.pathname}${location.search}` }),
    [location.pathname, location.search],
  );

  return (
    <div className={`relative ${className}`}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        scrollWheelZoom={false}
        className="h-full w-full z-0"
      >
        <FitDestinations destinations={validDestinations} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {validDestinations.map((dest) => {
          if (!dest.coordinates) return null;
          const placeName = formatPlaceName(dest, locale);

          return (
            <Marker
              key={dest.id}
              position={[dest.coordinates.lat, dest.coordinates.lng]}
              icon={defaultMarkerIcon}
            >
              <Popup className="min-w-[220px] max-w-[260px] p-0">
                <div className="p-1">
                  <img
                    src={dest.heroImage}
                    alt={placeName}
                    className="w-full h-28 object-cover rounded-md mb-2"
                  />
                  <h3 className="font-bold text-base text-slate-900 dark:text-white mb-0.5 truncate">
                    {placeName}
                  </h3>
                  {/* REC-002/KAI-89 3-state: verified shows ★ overall/10;
                      estimated shows ★ value/10 labeled est. (from the
                      trusted season vector); unverifiable shows the
                      localized Score-unavailable line — never blank. */}
                  {(() => {
                    const sp = getScorePresentation(dest);
                    if (
                      sp.state === "verified" &&
                      Number.isFinite(dest.ratings?.overall)
                    ) {
                      return (
                        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">
                          ★ {dest.ratings.overall}/10
                        </div>
                      );
                    }
                    if (sp.state === "estimated" && sp.value !== null) {
                      return (
                        <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1.5">
                          ★ {sp.value}/10{" "}
                          <span className="ml-0.5 text-[10px] font-normal uppercase text-slate-400">
                            {locale === "ja" ? "目安" : "est."}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="text-xs font-semibold text-slate-400 mb-1.5">
                        {locale === "ja"
                          ? "スコアを表示できません"
                          : "Score unavailable"}
                      </div>
                    );
                  })()}
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                    {dest.description
                      ? `${dest.description.slice(0, 60)}...`
                      : dest.categories?.join(" • ")}
                  </p>

                  {/* Action Bar with Explore and Save (Bucket List) buttons */}
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

                    <div className="flex-1 min-w-0 flex justify-center">
                      <BucketListButton
                        destinationId={dest.id}
                        destinationName={placeName}
                        variant="button"
                        className="w-full h-8 text-xs font-semibold"
                        addLabel={locale === "ja" ? "お気に入り" : "Save"}
                        removeLabel={
                          locale === "ja" ? "お気に入りから削除" : "Remove"
                        }
                      />
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
