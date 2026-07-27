import { MapPin } from "lucide-react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useState, useEffect, useMemo } from "react";

const PREFECTURES = [
  "Hokkaido",
  "Aomori",
  "Iwate",
  "Miyagi",
  "Akita",
  "Yamagata",
  "Fukushima",
  "Ibaraki",
  "Tochigi",
  "Gunma",
  "Saitama",
  "Chiba",
  "Tokyo",
  "Kanagawa",
  "Niigata",
  "Toyama",
  "Ishikawa",
  "Fukui",
  "Yamanashi",
  "Nagano",
  "Gifu",
  "Shizuoka",
  "Aichi",
  "Mie",
  "Shiga",
  "Kyoto",
  "Osaka",
  "Hyogo",
  "Nara",
  "Wakayama",
  "Tottori",
  "Shimane",
  "Okayama",
  "Hiroshima",
  "Yamaguchi",
  "Tokushima",
  "Kagawa",
  "Ehime",
  "Kochi",
  "Fukuoka",
  "Saga",
  "Nagasaki",
  "Kumamoto",
  "Oita",
  "Miyazaki",
  "Kagoshima",
  "Okinawa",
];

interface StationInputProps {
  embedded?: boolean;
}

export default function StationInput({ embedded = false }: StationInputProps) {
  const {
    homeStation,
    setHomeStation,
    homeStationCoords,
    setHomeStationCoords,
  } = useTripStore();

  type StationData = { name: string; lat: number; lng: number };
  // Data for stations by prefecture
  const [stationsByPref, setStationsByPref] = useState<
    Record<string, StationData[]>
  >({});

  // UI State
  const [isEditing, setIsEditing] = useState<boolean>(embedded || !homeStation);
  const [mode, setMode] = useState<"station" | "zip">("station");
  const [selectedPref, setSelectedPref] = useState<string>("Tokyo");
  const [selectedStation, setSelectedStation] = useState<string>("");
  const [zipCode, setZipCode] = useState<string>("");
  const [isFetchingZip, setIsFetchingZip] = useState(false);
  const [zipError, setZipError] = useState("");

  useEffect(() => {
    if (embedded) {
      setIsEditing(true);
    }
  }, [embedded]);

  useEffect(() => {
    fetch("/data/stations-by-prefecture.json")
      .then((res) => res.json())
      .then((data) => setStationsByPref(data))
      .catch((err) => console.error("Failed to load stations", err));
  }, []);

  // Parse homeStation on mount or when it changes externally
  useEffect(() => {
    if (!homeStation) return;

    // Check if it's a zip code (matches roughly 3-4 digits or 7 digits)
    if (/^\d{3}-?\d{4}$/.test(homeStation) || /^\d+$/.test(homeStation)) {
      setMode("zip");
      setZipCode(homeStation);

      // Auto-resolve coordinates if missing (e.g. from previous app versions)
      if (!homeStationCoords) {
        setIsFetchingZip(true);
        const cleanZip = homeStation.replace("-", "");
        fetch(
          `https://nominatim.openstreetmap.org/search?postalcode=${cleanZip}&country=japan&format=json`,
        )
          .then((res) => res.json())
          .then((data) => {
            if (data && data.length > 0) {
              setHomeStationCoords({
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
              });
            }
          })
          .catch(console.error)
          .finally(() => setIsFetchingZip(false));
      }
    } else if (homeStation.includes(", ")) {
      const parts = homeStation.split(", ");
      setMode("station");
      if (PREFECTURES.includes(parts[1])) {
        setSelectedPref(parts[1]);
      }
      setSelectedStation(parts[0]);

      // Auto-resolve station coordinates if missing
      if (!homeStationCoords && stationsByPref[parts[1]]) {
        const st = stationsByPref[parts[1]].find((s) => s.name === parts[0]);
        if (st) setHomeStationCoords({ lat: st.lat, lng: st.lng });
      }
    } else {
      // Fallback
      setMode("station");
      setSelectedStation(homeStation);
    }
  }, [homeStation, homeStationCoords, stationsByPref, setHomeStationCoords]);

  const handleStationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStation(e.target.value);
  };

  const handlePrefChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value;
    setSelectedPref(p);
    setSelectedStation(""); // reset station
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setZipCode(e.target.value);
  };

  const handleSet = async () => {
    if (mode === "station" && selectedStation) {
      setHomeStation(`${selectedStation}, ${selectedPref}`);
      const st = stations.find((s) => s.name === selectedStation);
      if (st) {
        setHomeStationCoords({ lat: st.lat, lng: st.lng });
      }
      setIsEditing(false);
    } else if (mode === "zip" && zipCode) {
      setIsFetchingZip(true);
      setZipError("");
      try {
        const cleanZip = zipCode.replace("-", "");
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?postalcode=${cleanZip}&country=japan&format=json`,
        );
        const data = await res.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          setHomeStation(zipCode);
          setHomeStationCoords({ lat, lng });
          setIsEditing(false);
        } else {
          setZipError("Could not find coordinates for this zip code.");
        }
      } catch (err) {
        console.error("Failed to fetch zip code coordinates", err);
        setZipError("Failed to fetch location. Try again.");
      } finally {
        setIsFetchingZip(false);
      }
    }
  };

  const stations = useMemo(() => {
    return stationsByPref[selectedPref] || [];
  }, [stationsByPref, selectedPref]);

  if (!isEditing && homeStation && !embedded) {
    return (
      <div className="flex items-center gap-3 bg-white/70 dark:bg-slate-900/70 p-3 rounded-xl w-fit border border-slate-200 dark:border-slate-700 backdrop-blur-md shadow-sm">
        <MapPin className="w-5 h-5 text-emerald-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">
          Base Location:{" "}
          <span className="text-emerald-600 dark:text-emerald-400 ml-1">
            {homeStation}
          </span>
        </span>
        <button
          onClick={() => setIsEditing(true)}
          className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs px-3 py-1 rounded-md transition-colors shadow-sm ml-2"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 ${embedded ? "bg-slate-50/50 dark:bg-slate-900/40 w-full" : "bg-white/70 dark:bg-slate-900/70 w-full max-w-full sm:w-fit backdrop-blur-md shadow-sm"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
            Select Base Station:
          </span>
        </div>
        <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-300 dark:border-slate-700 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setMode("station")}
            className={`flex-1 sm:flex-initial px-3 py-1 text-xs font-medium rounded-md transition-colors text-center ${mode === "station" ? "bg-white dark:bg-slate-950 text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
          >
            Station
          </button>
          <button
            type="button"
            onClick={() => setMode("zip")}
            className={`flex-1 sm:flex-initial px-3 py-1 text-xs font-medium rounded-md transition-colors text-center ${mode === "zip" ? "bg-white dark:bg-slate-950 text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
          >
            ZIP / Postal
          </button>
        </div>
      </div>

      {mode === "station" ? (
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <select
            value={selectedPref}
            onChange={handlePrefChange}
            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm font-semibold focus:outline-none focus:border-emerald-500 w-full sm:w-36"
          >
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={selectedStation}
            onChange={handleStationChange}
            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-sm font-semibold focus:outline-none focus:border-emerald-500 w-full sm:w-64"
            disabled={stations.length === 0}
          >
            <option value="">-- Select Station --</option>
            {stations.map((st) => (
              <option key={st.name} value={st.name}>
                {st.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <input
            type="text"
            placeholder="e.g. 100-0001"
            value={zipCode}
            onChange={handleZipChange}
            onKeyDown={(e) => e.key === "Enter" && handleSet()}
            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:border-emerald-500 w-full sm:w-64"
          />
          {zipError && <span className="text-xs text-red-500">{zipError}</span>}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSet}
          disabled={
            (mode === "station" && !selectedStation) ||
            (mode === "zip" && !zipCode) ||
            isFetchingZip
          }
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex-1 flex items-center justify-center gap-2"
        >
          {isFetchingZip && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {isFetchingZip ? "Locating..." : "Set Location"}
        </button>
        {homeStation && !embedded && (
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
