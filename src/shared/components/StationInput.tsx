import { LocateFixed, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { resolveOriginTransportZone } from "@/shared/services/transport/OriginTransportZone";

import { useState, useEffect, useMemo } from "react";
import { OriginLocationDisplay } from "@/shared/components/OriginLocationDisplay";
import { useLocale } from "@/shared/context/LocaleContext";
import { getLocalizedStationNameOnly } from "@/shared/utils/formatOriginLocation";
import { formatPrefecture } from "@/shared/utils/placeLabels";

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
  allowCurrentLocation?: boolean;
}

export default function StationInput({
  embedded = false,
  allowCurrentLocation = true,
}: StationInputProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const {
    homeStation,
    savedHomeStation,
    originSource,
    setOriginLocation,
    setCurrentLocationOrigin,
    restoreSavedOrigin,
    canSelectOrigin,
  } = useTripStore();
  const savedOriginLabel = savedHomeStation || homeStation;
  const isCurrentLocation = originSource === "current";

  type StationData = { name: string; lat: number; lng: number };
  const [stationsByPref, setStationsByPref] = useState<
    Record<string, StationData[]>
  >({});

  const [isEditing, setIsEditing] = useState<boolean>(
    embedded || !savedOriginLabel,
  );
  const [mode, setMode] = useState<"station" | "zip">("station");
  const [selectedPref, setSelectedPref] = useState<string>("Tokyo");
  const [selectedStation, setSelectedStation] = useState<string>("");
  const [zipCode, setZipCode] = useState<string>("");
  const [isFetchingZip, setIsFetchingZip] = useState(false);
  const [zipError, setZipError] = useState("");
  const [isLocatingCurrent, setIsLocatingCurrent] = useState(false);
  const [currentLocationError, setCurrentLocationError] = useState("");

  useEffect(() => {
    if (embedded) {
      setIsEditing(true);
    }
  }, [embedded]);

  useEffect(() => {
    if (embedded || !isEditing) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsEditing(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [embedded, isEditing]);

  useEffect(() => {
    fetch("/data/stations-by-prefecture.json")
      .then((res) => res.json())
      .then((data) => setStationsByPref(data))
      .catch((err) => console.error("Failed to load stations", err));
  }, []);

  useEffect(() => {
    if (!savedOriginLabel) return;

    if (
      /^\d{3}-?\d{4}$/.test(savedOriginLabel) ||
      /^\d+$/.test(savedOriginLabel)
    ) {
      setMode("zip");
      setZipCode(savedOriginLabel);
    } else if (savedOriginLabel.includes(", ")) {
      const parts = savedOriginLabel.split(", ");
      setMode("station");
      if (PREFECTURES.includes(parts[1])) {
        setSelectedPref(parts[1]);
      }
      setSelectedStation(parts[0]);
    } else {
      setMode("station");
      setSelectedStation(savedOriginLabel);
    }
  }, [savedOriginLabel]);

  const handleStationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStation(e.target.value);
  };

  const handlePrefChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value;
    setSelectedPref(p);
    setSelectedStation("");
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setZipCode(e.target.value);
  };

  const handleSet = async () => {
    if (!canSelectOrigin) return;
    if (mode === "station" && selectedStation) {
      const label = `${selectedStation}, ${selectedPref}`;
      const st = stations.find((s) => s.name === selectedStation);
      if (!st) return;
      setOriginLocation({
        label,
        coordinates: { lat: st.lat, lng: st.lng },
        source: "station",
        transportZoneId: resolveOriginTransportZone({
          coordinates: { lat: st.lat, lng: st.lng },
          label,
        }),
      });
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
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            setZipError(t("origin.zipNotFound"));
            return;
          }
          setOriginLocation({
            label: zipCode,
            coordinates: { lat, lng },
            source: "postal_code",
            transportZoneId: resolveOriginTransportZone({
              coordinates: { lat, lng },
              label: zipCode,
            }),
          });
          setIsEditing(false);
        } else {
          setZipError(t("origin.zipNotFound"));
        }
      } catch (err) {
        console.error("Failed to fetch zip code coordinates", err);
        setZipError(t("origin.locationFetchFailed"));
      } finally {
        setIsFetchingZip(false);
      }
    }
  };

  const handleUseCurrentLocation = () => {
    if (!allowCurrentLocation || !canSelectOrigin || isLocatingCurrent) return;
    setCurrentLocationError("");

    if (!navigator.geolocation) {
      setCurrentLocationError(t("origin.currentLocationUnsupported"));
      return;
    }

    setIsLocatingCurrent(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          if (
            !Number.isFinite(coordinates.lat) ||
            !Number.isFinite(coordinates.lng)
          ) {
            setCurrentLocationError(t("origin.currentLocationUnavailable"));
            setIsLocatingCurrent(false);
            return;
          }
          setCurrentLocationOrigin(coordinates);
          setIsLocatingCurrent(false);
          setIsEditing(false);
        },
        (error) => {
          const messageKey =
            error.code === 1
              ? "origin.currentLocationPermissionDenied"
              : error.code === 3
                ? "origin.currentLocationTimeout"
                : "origin.currentLocationUnavailable";
          setCurrentLocationError(t(messageKey));
          setIsLocatingCurrent(false);
        },
        {
          timeout: 10000,
          maximumAge: 0,
          enableHighAccuracy: false,
        },
      );
    } catch {
      setCurrentLocationError(t("origin.currentLocationUnavailable"));
      setIsLocatingCurrent(false);
    }
  };

  const stations = useMemo(() => {
    return stationsByPref[selectedPref] || [];
  }, [stationsByPref, selectedPref]);

  if (!isEditing && homeStation && !embedded) {
    return (
      <OriginLocationDisplay
        origin={homeStation}
        onEdit={() => setIsEditing(true)}
        isCurrentLocation={isCurrentLocation}
        onRestoreSaved={restoreSavedOrigin}
        editDisabled={!canSelectOrigin}
      />
    );
  }

  return (
    <>
      {!embedded && (
        <button
          type="button"
          aria-label={t("origin.closeLocationEditor")}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm"
          onClick={() => setIsEditing(false)}
        />
      )}
      <div
        className={
          embedded
            ? "flex w-full flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40"
            : "fixed inset-0 z-50 flex items-end justify-center p-0 pointer-events-none sm:items-center sm:p-4"
        }
      >
        <div
          role={!embedded ? "dialog" : undefined}
          aria-modal={!embedded ? "true" : undefined}
          aria-label={!embedded ? t("origin.changeLocation") : undefined}
          className={
            embedded
              ? "contents"
              : "pointer-events-auto flex w-full max-w-lg flex-col gap-3 rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:rounded-2xl"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                {t("origin.selectBaseStation")}
              </span>
            </div>
            <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-300 dark:border-slate-700 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setMode("station")}
                className={`flex-1 sm:flex-initial px-3 py-1 text-xs font-medium rounded-md transition-colors text-center ${mode === "station" ? "bg-white dark:bg-slate-950 text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-700 dark:hover:text-slate-300"}`}
              >
                {t("origin.station")}
              </button>
              <button
                type="button"
                onClick={() => setMode("zip")}
                className={`flex-1 sm:flex-initial px-3 py-1 text-xs font-medium rounded-md transition-colors text-center ${mode === "zip" ? "bg-white dark:bg-slate-950 text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-700 dark:hover:text-slate-300"}`}
              >
                {t("origin.zipPostal")}
              </button>
            </div>
          </div>

          {mode === "station" ? (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <select
                value={selectedPref}
                onChange={handlePrefChange}
                aria-label={t("origin.prefecture", "Prefecture")}
                className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-base sm:text-sm font-semibold focus:outline-none focus:border-emerald-700 w-full sm:w-36"
              >
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>
                    {formatPrefecture(p, locale)}
                  </option>
                ))}
              </select>

              <select
                value={selectedStation}
                onChange={handleStationChange}
                aria-label={t("origin.station", "Station")}
                className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-base sm:text-sm font-semibold focus:outline-none focus:border-emerald-700 w-full sm:w-64"
                disabled={stations.length === 0}
              >
                <option value="">{t("origin.selectStation")}</option>
                {stations.map((st) => (
                  <option key={st.name} value={st.name}>
                    {getLocalizedStationNameOnly(st.name, locale)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <input
                type="text"
                placeholder={t("origin.zipPlaceholder")}
                value={zipCode}
                onChange={handleZipChange}
                onKeyDown={(e) => e.key === "Enter" && handleSet()}
                className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-base sm:text-sm font-semibold focus:outline-none focus:border-emerald-700 w-full sm:w-64"
              />
              {zipError && (
                <span className="text-xs text-red-500">{zipError}</span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSet}
                disabled={
                  !canSelectOrigin ||
                  (mode === "station" && !selectedStation) ||
                  (mode === "zip" && !zipCode) ||
                  isFetchingZip ||
                  isLocatingCurrent
                }
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex-1 flex items-center justify-center gap-2"
              >
                {isFetchingZip && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {isFetchingZip ? t("origin.locating") : t("origin.setLocation")}
              </button>
              {savedOriginLabel && !embedded && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  {t("origin.cancel")}
                </button>
              )}
            </div>
            {allowCurrentLocation && (
              <>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={
                    !canSelectOrigin || isLocatingCurrent || isFetchingZip
                  }
                  className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                >
                  {isLocatingCurrent ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
                  ) : (
                    <LocateFixed className="size-4" />
                  )}
                  {isLocatingCurrent
                    ? t("origin.locatingCurrent")
                    : t("origin.useCurrentLocation")}
                </button>
                {currentLocationError && (
                  <p className="text-xs text-red-500" role="alert">
                    {currentLocationError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
