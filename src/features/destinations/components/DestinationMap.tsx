import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Destination } from "@/shared/types/destination";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/shared/components/ui/button";

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
  // Center roughly on Yokohama/Tokyo
  const center: [number, number] = [35.5, 139.6];

  const linkState =
    carMode !== undefined || publicModes !== undefined
      ? { carMode, publicModes }
      : undefined;

  return (
    <div className="w-full h-[600px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm z-0">
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

            return (
              <Marker key={dest.id} position={[lat, lng]} icon={customIcon}>
                <Popup className="custom-popup">
                  <div className="font-sans min-w-[200px] p-3">
                    <img
                      src={dest.heroImage}
                      alt={dest.name}
                      className="w-full h-28 object-cover rounded-md mb-2"
                    />
                    <h3 className="font-bold text-lg mb-0">{dest.name}</h3>
                    <div className="text-sm font-medium text-emerald-600 mb-2">
                      ★ {dest.ratings.overall}/10
                    </div>
                    <p className="text-sm text-slate-500 mb-3">
                      {dest.description
                        ? `${dest.description.slice(0, 60)}...`
                        : dest.categories?.join(" • ")}
                    </p>
                    <Link to={`/destinations/${dest.id}`} state={linkState}>
                      <Button
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                      >
                        View Guide
                      </Button>
                    </Link>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}
